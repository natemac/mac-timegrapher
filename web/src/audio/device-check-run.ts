/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { startCapture, type CaptureSession } from './audio-engine';
import { constraintsFor, type CaptureProfile } from './capture-route';
import { SignalMeter, type SignalState } from './signal-strength';
import { ClockCalibrator, correctedSampleRate, type ClockDebug } from './clock-calibration';
import { bandLevelDb, BandAverager, VOICE_BAND, TICK_BAND } from './spectrum';
import { TimegrapherEngine, type Measurement } from '../timegrapher/tg-engine';
import {
  pendingResults,
  gradeBrowser, gradePermission, gradeInput, gradeStream, gradeSampleRate,
  gradeProcessing, gradeTiming, gradeLevel, gradeClipping, gradeBandwidth,
  gradeEnergy, gradeBeat, gradeAnalysis,
  type StepId, type StepResult, type ProcessingStep,
} from '../timegrapher/device-check';

/*
   One pass down the device check, in order, reporting each step as it lands.

   It runs on the app's own capture path — the same `startCapture`, the same
   constraints, the same worklet — rather than a parallel rig built to look like
   it. A diagnostic that measures a parallel path measures the parallel path,
   which is how a bad reading can be reproduced everywhere except in the tool
   built to find it.

   Two listening windows do the work. The first is ten seconds with nothing on
   the sensor required: long enough for the clock calibrator to say whether
   frames are keeping pace, and the level, headroom and spectrum fall out of the
   same audio for free. The second runs only when a movement is on the sensor,
   and is long enough for the analysis to lock.
*/

export interface CheckTimings {
  /** Listening window for the device and signal steps. */
  listenSeconds: number;
  /** Listening window with a movement on the sensor. */
  movementSeconds: number;
  /** How much of that window the tick-energy reading takes first. */
  energySeconds: number;
  /** Waiting for the first blocks to arrive. */
  streamMs: number;
  /** Long enough for a resolved step to register before the next is lit. */
  beatMs: number;
}

/*
   Ten seconds is what the clock calibrator needs before frame delivery says
   anything; fifteen more is what the analysis needs to lock onto an escapement.
   Injectable so the sequence can be driven by a test in milliseconds rather
   than in half a minute of real waiting.
*/
export const DEFAULT_TIMINGS: CheckTimings = {
  listenSeconds: 10,
  movementSeconds: 15,
  energySeconds: 3,
  streamMs: 600,
  beatMs: 260,
};

export interface DeviceCheckReport {
  startedAt: string;
  finishedAt: string;
  userAgent: string;
  profile: CaptureProfile;
  requestedDeviceId: string;
  deviceLabel: string | null;
  /** Verbatim, because the interesting keys are the ones we did not ask about. */
  grantedSettings: MediaTrackSettings | null;
  capabilities: MediaTrackCapabilities | null;
  sampleRate: number | null;
  requestedSampleRate: number | null;
  includeMovement: boolean;
  movement: { name: string | null; bph: number; liftAngle: number };
  clockDriftSecondsPerDay: number;
  results: StepResult[];
  clock: ClockDebug | null;
  voiceBandDb: number | null;
  tickBandDb: number | null;
}

export interface CheckProgress {
  /** Which step is being worked on, or null once the run is over. */
  running: StepId | null;
  /** Everything decided so far, in list order. */
  results: StepResult[];
  /** Seconds elapsed, for a progress bar that moves at the run's own rate. */
  elapsedSeconds: number;
}

export interface RunOptions {
  deviceId: string;
  profile: CaptureProfile;
  includeMovement: boolean;
  movement: { name: string | null; bph: number; liftAngle: number };
  clockDriftSecondsPerDay: number;
  onProgress: (p: CheckProgress) => void;
  signal?: AbortSignal;
  timings?: CheckTimings;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Aborted extends Error {
  constructor() {
    super('Check cancelled');
    this.name = 'AbortError';
  }
}

/*
   A sequential recorder for the run.

   Holds the list in its declared order, marks one step as running at a time,
   and republishes the whole list on every change — so the panel never has to
   work out what changed, and a step can never be reported out of order.
*/
class Run {
  private results: StepResult[];
  private running: StepId | null = null;
  private startedAt = performance.now();

  private readonly onProgress: (p: CheckProgress) => void;
  private readonly signal: AbortSignal | undefined;
  private readonly beatMs: number;

  // Explicit fields rather than constructor parameter properties: the project
  // builds with erasableSyntaxOnly, which rejects the shorthand (TS1294).
  constructor(
    includeMovement: boolean,
    onProgress: (p: CheckProgress) => void,
    beatMs: number,
    signal?: AbortSignal,
  ) {
    this.onProgress = onProgress;
    this.signal = signal;
    this.beatMs = beatMs;
    this.results = pendingResults(includeMovement);
  }

  private publish(): void {
    this.onProgress({
      running: this.running,
      results: [...this.results],
      elapsedSeconds: (performance.now() - this.startedAt) / 1000,
    });
  }

  throwIfAborted(): void {
    if (this.signal?.aborted) throw new Aborted();
  }

  /** Mark a step as the one being worked on. */
  begin(id: StepId): void {
    this.throwIfAborted();
    this.running = id;
    this.set({ id, state: 'running', detail: '' });
  }

  set(result: StepResult): void {
    const at = this.results.findIndex((r) => r.id === result.id);
    if (at >= 0) this.results[at] = result;
    if (result.state !== 'running' && this.running === result.id) this.running = null;
    this.publish();
  }

  /** Run one step, showing it as active for at least long enough to be seen. */
  async step(id: StepId, work: () => StepResult | Promise<StepResult>): Promise<StepResult> {
    this.begin(id);
    const settled = await work();
    this.set(settled);
    await sleep(this.beatMs);
    return settled;
  }

  /** Everything not yet decided, because the run stopped short of it. */
  abandon(why: string): void {
    this.running = null;
    this.results = this.results.map((r) => (
      r.state === 'pending' || r.state === 'running' ? { ...r, state: 'skipped', detail: why } : r
    ));
    this.publish();
  }

  finish(): StepResult[] {
    this.running = null;
    this.publish();
    return this.results;
  }

}

function describeOpenFailure(err: unknown): string {
  if (!(err instanceof Error)) return 'Could not open the audio input.';
  switch (err.name) {
    case 'NotAllowedError':
      return 'Access was refused. Allow the microphone in your browser’s site settings, then try again.';
    case 'NotFoundError':
      return 'The device is no longer there. Reconnect it and try again.';
    case 'NotReadableError':
      return 'Another application is holding this device. Close it and try again.';
    case 'OverconstrainedError':
      return 'The browser could not open this device with the settings the app needs.';
    default:
      return `${err.name}: ${err.message}`;
  }
}

/** `getSettings()` reports a boolean, or omits the key entirely. */
function appliedFlag(settings: MediaTrackSettings | null, name: ProcessingStep): boolean | null {
  if (!settings || !(name in settings)) return null;
  const value = (settings as Record<string, unknown>)[name];
  return typeof value === 'boolean' ? value : null;
}

export async function runDeviceCheck(options: RunOptions): Promise<DeviceCheckReport> {
  const {
    deviceId, profile, includeMovement, movement, clockDriftSecondsPerDay,
    onProgress, signal, timings = DEFAULT_TIMINGS,
  } = options;

  const run = new Run(includeMovement, onProgress, timings.beatMs, signal);
  const startedAt = new Date().toISOString();

  const report: DeviceCheckReport = {
    startedAt,
    finishedAt: startedAt,
    userAgent: navigator.userAgent,
    profile,
    requestedDeviceId: deviceId,
    deviceLabel: null,
    grantedSettings: null,
    capabilities: null,
    sampleRate: null,
    requestedSampleRate: null,
    includeMovement,
    movement,
    clockDriftSecondsPerDay,
    results: [],
    clock: null,
    voiceBandDb: null,
    tickBandDb: null,
  };

  let session: CaptureSession | null = null;
  let engine: TimegrapherEngine | null = null;

  try {
    const browser = await run.step('browser', () => gradeBrowser(
      window.isSecureContext,
      typeof AudioWorkletNode !== 'undefined',
    ));
    if (browser.state === 'fail') {
      run.abandon('Not reached — the browser cannot measure');
      return { ...report, results: run.finish(), finishedAt: new Date().toISOString() };
    }

    /*
       Permission, the input and the stream all come out of one acquisition, so
       they are graded from its outcome rather than probed separately — a second
       getUserMedia to answer a question the first one already answered would
       open the device twice.
    */
    let blocks = 0;
    const meter = new SignalMeter();
    const calibrator = new ClockCalibrator();
    const bands = new BandAverager();
    /* Boxed rather than a bare `let`: the meter is written from inside the
       audio callback, and TypeScript narrows a plain local to its initialiser
       when it is read again out here. */
    const live: { signal: SignalState | null } = { signal: null };
    let peakDb = -Infinity;

    run.begin('permission');
    try {
      session = await startCapture(
        deviceId,
        (block) => {
          blocks++;
          const ctx = session?.context;
          if (ctx && ctx.state === 'running') {
            calibrator.sample(ctx.currentTime, performance.now(), block.length);
          }
          const next = meter.push(block, block.length / (session?.sampleRate ?? 48000));
          live.signal = next;
          const peak = 20 * Math.log10(Math.max(next.peakHold, 1e-9));
          if (peak > peakDb) peakDb = peak;
          engine?.push(block);
        },
        undefined,
        constraintsFor(profile, deviceId),
        profile === 'ec-only' ? ['echoCancellation'] : [],
      );
    } catch (err) {
      const why = describeOpenFailure(err);
      if (err instanceof Error && err.name === 'NotAllowedError') {
        run.set(gradePermission(false, why));
      } else {
        run.set(gradePermission(true, null));
        await sleep(timings.beatMs);
        run.set({ id: 'input', state: 'fail', detail: why });
      }
      run.abandon('Not reached — the input never opened');
      return { ...report, results: run.finish(), finishedAt: new Date().toISOString() };
    }

    run.set(gradePermission(true, null));
    await sleep(timings.beatMs);

    const track = session.stream.getAudioTracks()[0] ?? null;
    const granted = session.settings;
    const grantedId = typeof granted.deviceId === 'string' ? granted.deviceId : null;
    report.deviceLabel = track?.label || null;
    report.grantedSettings = granted;
    report.capabilities = session.capabilities;
    report.sampleRate = session.sampleRate;
    report.requestedSampleRate = session.requestedSampleRate ?? null;
    calibrator.beginSession();

    await run.step('input', () => gradeInput(report.deviceLabel, deviceId, grantedId));

    // Half a second is enough to know whether blocks are arriving at all; the
    // rest of the window is spent on the questions that need duration.
    await run.step('stream', async () => {
      const began = performance.now();
      while (performance.now() - began < timings.streamMs) {
        run.throwIfAborted();
        await sleep(50);
      }
      return gradeStream(blocks, (performance.now() - began) / 1000);
    });

    await run.step('rate', () => gradeSampleRate(session!.sampleRate, session!.requestedSampleRate));

    for (const name of ['echoCancellation', 'autoGainControl', 'noiseSuppression'] as ProcessingStep[]) {
      await run.step(name, () => gradeProcessing(
        name,
        appliedFlag(granted, name),
        profile === 'ec-only' && name === 'echoCancellation',
      ));
    }

    /*
       The long window. Timing is what needs it — the calibrator wants a run
       long enough for frame delivery to say something — and the level, headroom
       and spectrum come out of the same audio, so they are read at the end of
       it rather than costing three more windows of their own.
    */
    const analyser = session.context.createAnalyser();
    analyser.fftSize = 4096;
    const spectrumSource = session.context.createMediaStreamSource(session.stream);
    spectrumSource.connect(analyser);
    const bins = new Float32Array(analyser.frequencyBinCount);

    await run.step('timing', async () => {
      const began = performance.now();
      while ((performance.now() - began) / 1000 < timings.listenSeconds) {
        run.throwIfAborted();
        analyser.getFloatFrequencyData(bins);
        bands.add('voice', bandLevelDb(bins, session!.context.sampleRate, analyser.fftSize, VOICE_BAND.from, VOICE_BAND.to));
        bands.add('tick', bandLevelDb(bins, session!.context.sampleRate, analyser.fftSize, TICK_BAND.from, TICK_BAND.to));
        await sleep(100);
      }
      const debug = calibrator.debug(session!.sampleRate);
      report.clock = debug;
      return gradeTiming({
        seconds: debug.elapsedSeconds,
        disturbed: calibrator.disturbed,
        rejectionRate: debug.steps > 0 ? (debug.steps - debug.points) / debug.steps : null,
        driftSecondsPerDay: debug.framesDriftSecondsPerDay,
      });
    });

    spectrumSource.disconnect();
    analyser.disconnect();

    const s = live.signal;
    report.voiceBandDb = Number.isFinite(bands.mean('voice')) ? bands.mean('voice') : null;
    report.tickBandDb = Number.isFinite(bands.mean('tick')) ? bands.mean('tick') : null;

    await run.step('level', () => gradeLevel(s?.levelDb ?? -Infinity, s?.floorDb ?? -Infinity));
    await run.step('clipping', () => gradeClipping(peakDb));
    await run.step('bandwidth', () => gradeBandwidth(bands.mean('tick'), bands.mean('voice')));

    if (includeMovement) {
      /*
         The analysis, on the same audio path and with the same clock correction
         the app measures under — so a reading here is the reading the app would
         give, not an idealised one.
      */
      /* Boxed for the same reason as the meter above. */
      const found: { best: Measurement | null } = { best: null };
      let validReadings = 0;
      engine = TimegrapherEngine.create({
        sampleRate: correctedSampleRate(session.sampleRate, clockDriftSecondsPerDay),
        // Zero lets the core find the beat rate. A diagnostic must not be told
        // the answer it is checking for.
        bph: 0,
        liftAngle: movement.liftAngle,
        onMeasurement: (m) => {
          if (!m.valid) return;
          validReadings++;
          if (!found.best || m.signalQuality >= found.best.signalQuality) found.best = m;
        },
        onError: () => {},
      });

      await run.step('energy', async () => {
        const began = performance.now();
        while ((performance.now() - began) / 1000 < timings.energySeconds) {
          run.throwIfAborted();
          await sleep(100);
        }
        const now = live.signal;
        return gradeEnergy(now?.headroomDb ?? NaN, now?.levelDb ?? NaN);
      });

      await run.step('beat', async () => {
        const began = performance.now();
        while ((performance.now() - began) / 1000 < timings.movementSeconds - timings.energySeconds) {
          run.throwIfAborted();
          await sleep(200);
        }
        return gradeBeat(found.best?.detectedBph ?? null, movement.bph > 0 ? movement.bph : null);
      });

      await run.step('analysis', () => gradeAnalysis({
        validReadings,
        seconds: timings.movementSeconds,
        rate: found.best?.rate ?? null,
        amplitude: found.best?.amplitude ?? null,
        beatError: found.best?.beatError ?? null,
      }));
    }

    return { ...report, results: run.finish(), finishedAt: new Date().toISOString() };
  } catch (err) {
    run.abandon(err instanceof Error && err.name === 'AbortError'
      ? 'Cancelled before this step'
      : 'Not reached — the check stopped');
    if (!(err instanceof Error && err.name === 'AbortError')) throw err;
    return { ...report, results: run.finish(), finishedAt: new Date().toISOString() };
  } finally {
    engine?.destroy();
    await session?.stop().catch(() => {});
  }
}
