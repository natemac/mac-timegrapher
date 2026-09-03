/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { buildAudioConstraints, startCapture, type CaptureSession } from './audio-engine';
import { listAudioInputs, type AudioInput } from './device-manager';
import { SignalMeter } from './signal-strength';
import { TimegrapherEngine, type Measurement } from '../timegrapher/tg-engine';

/*
   One press, every question at once.

   Diagnosing a phone that will not measure has meant a round trip per
   hypothesis — ask for a log, read it, find it was the wrong microphone or the
   wrong constraint set, ask again. This runs the whole set on the device and
   returns one report: what inputs exist, what each processing configuration is
   actually granted, what the signal looks like under each, and — the question
   that matters — whether the real analysis engine locks onto a beat.

   It uses startCapture, not a copy of it, so what it reports is the path the
   app actually takes.
*/

/* The configurations worth distinguishing. Ours is what the app asks for; the
   rest exist to find out what a platform will do differently. */
export type VariantId = 'ours' | 'gain-only' | 'voice' | 'unconstrained';

export const VARIANTS: { id: VariantId; label: string; note: string }[] = [
  { id: 'ours', label: 'All processing off', note: 'What the app asks for.' },
  { id: 'gain-only', label: 'Gain control on', note: 'Louder, but amplitude is no longer measurable.' },
  { id: 'voice', label: 'Full voice processing', note: 'What a call or dictation app asks for.' },
  { id: 'unconstrained', label: 'No constraints at all', note: 'Whatever the platform prefers.' },
];

export function constraintsFor(id: VariantId, deviceId: string): MediaStreamConstraints {
  const device = { deviceId: { exact: deviceId } };
  switch (id) {
    case 'ours':
      return buildAudioConstraints(deviceId);
    case 'gain-only':
      return { audio: { ...device, echoCancellation: false, autoGainControl: true, noiseSuppression: false, channelCount: 1 }, video: false };
    case 'voice':
      return { audio: { ...device, echoCancellation: true, autoGainControl: true, noiseSuppression: true, channelCount: 1 }, video: false };
    case 'unconstrained':
      return { audio: device, video: false };
  }
}

/*
   Where the energy is.

   A microphone reached over Bluetooth is a voice channel: band-limited to
   roughly four or eight kilohertz, which is below where an escapement's
   impulse lives. It looks perfectly healthy on a level meter and can never
   produce a reading. One glance at these bands says so, which is a question
   that cost a day of guessing before it was asked.
*/
export const BANDS: { label: string; from: number; to: number }[] = [
  { label: '0–500 Hz', from: 0, to: 500 },
  { label: '0.5–2 kHz', from: 500, to: 2000 },
  { label: '2–4 kHz', from: 2000, to: 4000 },
  { label: '4–8 kHz', from: 4000, to: 8000 },
  { label: '8–16 kHz', from: 8000, to: 16000 },
  { label: '16 kHz+', from: 16000, to: Infinity },
];

export interface BandEnergy { label: string; db: number }

/** Average bin energy per band, from getFloatFrequencyData output. */
export function bandEnergies(bins: Float32Array, sampleRate: number, fftSize: number): BandEnergy[] {
  const hzPerBin = sampleRate / fftSize;
  return BANDS.map(({ label, from, to }) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < bins.length; i++) {
      const hz = i * hzPerBin;
      if (hz >= from && hz < to && Number.isFinite(bins[i])) { sum += bins[i]; n++; }
    }
    return { label, db: n > 0 ? sum / n : -Infinity };
  });
}

/*
   The cliff a voice channel leaves. Compares the best low band against the
   best high one; a real microphone keeps some energy above 4 kHz, a phone call
   does not.
*/
export function looksBandLimited(bands: BandEnergy[]): boolean {
  const low = Math.max(...bands.slice(0, 3).map((b) => b.db).filter(Number.isFinite), -Infinity);
  const high = Math.max(...bands.slice(3).map((b) => b.db).filter(Number.isFinite), -Infinity);
  if (!Number.isFinite(low)) return false;
  if (!Number.isFinite(high)) return true;
  return low - high > 35;
}

export interface VariantResult {
  id: VariantId;
  label: string;
  granted: Record<string, unknown> | null;
  contextSampleRate: number | null;
  rmsDb: number;
  peakDb: number;
  bands: BandEnergy[];
  bandLimited: boolean;
  error: string | null;
}

export interface LockResult {
  id: VariantId;
  label: string;
  seconds: number;
  samples: number;
  validReadings: number;
  bestQuality: number;
  detectedBph: number | null;
  rate: number | null;
  amplitude: number | null;
  beatError: number | null;
  headroomDb: number | null;
  error: string | null;
}

export interface DeviceTestReport {
  startedAt: string;
  userAgent: string;
  devices: AudioInput[];
  selected: { deviceId: string; label: string } | null;
  movement: { name: string | null; bph: number; liftAngle: number };
  variants: VariantResult[];
  locks: LockResult[];
}

export interface TestProgress { step: number; total: number; label: string }

const LEVEL_SECONDS = 3;
const LOCK_SECONDS = 20;
/* Level and spectrum for every variant; the analysis only for the two worth
   comparing — what the app asks for, against the loudest thing the platform
   offers. Four full lock attempts would be two minutes for no more insight. */
const LOCK_VARIANTS: VariantId[] = ['ours', 'voice'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function measureVariant(
  id: VariantId,
  label: string,
  deviceId: string,
): Promise<VariantResult> {
  const base: VariantResult = {
    id, label, granted: null, contextSampleRate: null,
    rmsDb: -Infinity, peakDb: -Infinity, bands: [], bandLimited: false, error: null,
  };
  let stream: MediaStream | undefined;
  let ctx: AudioContext | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraintsFor(id, deviceId));
    const track = stream.getAudioTracks()[0];
    base.granted = track.getSettings() as Record<string, unknown>;

    ctx = new AudioContext();
    base.contextSampleRate = ctx.sampleRate;
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);

    const time = new Float32Array(analyser.fftSize);
    const freq = new Float32Array(analyser.frequencyBinCount);
    const bandSums = BANDS.map(() => 0);
    let bandRuns = 0;
    let sumSquares = 0;
    let count = 0;
    let peak = 0;

    const until = performance.now() + LEVEL_SECONDS * 1000;
    while (performance.now() < until) {
      analyser.getFloatTimeDomainData(time);
      for (let i = 0; i < time.length; i++) {
        const v = time[i];
        sumSquares += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      count += time.length;

      analyser.getFloatFrequencyData(freq);
      bandEnergies(freq, ctx.sampleRate, analyser.fftSize).forEach((b, i) => {
        if (Number.isFinite(b.db)) bandSums[i] += b.db;
      });
      bandRuns++;
      await sleep(50);
    }

    base.rmsDb = count > 0 && sumSquares > 0 ? 20 * Math.log10(Math.sqrt(sumSquares / count)) : -Infinity;
    base.peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    base.bands = BANDS.map((b, i) => ({
      label: b.label,
      db: bandRuns > 0 ? bandSums[i] / bandRuns : -Infinity,
    }));
    base.bandLimited = looksBandLimited(base.bands);

    source.disconnect();
    analyser.disconnect();
  } catch (err) {
    base.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    for (const t of stream?.getTracks() ?? []) t.stop();
    await ctx?.close().catch(() => {});
  }
  return base;
}

async function attemptLock(
  id: VariantId,
  label: string,
  deviceId: string,
  bph: number,
  liftAngle: number,
): Promise<LockResult> {
  const base: LockResult = {
    id, label, seconds: LOCK_SECONDS, samples: 0, validReadings: 0, bestQuality: 0,
    detectedBph: null, rate: null, amplitude: null, beatError: null, headroomDb: null,
    error: null,
  };
  let session: CaptureSession | undefined;
  let engine: TimegrapherEngine | undefined;
  const meter = new SignalMeter();
  try {
    session = await startCapture(
      deviceId,
      (block) => {
        engine?.push(block);
        const s = meter.push(block, block.length / (session?.sampleRate ?? 48000));
        if (Number.isFinite(s.headroomDb)) base.headroomDb = s.headroomDb;
      },
      undefined,
      constraintsFor(id, deviceId),
    );

    const best: { m: Measurement | null } = { m: null };
    engine = TimegrapherEngine.create({
      sampleRate: session.sampleRate,
      bph,
      liftAngle,
      onMeasurement: (m) => {
        base.samples++;
        if (m.valid) {
          base.validReadings++;
          if (m.signalQuality >= base.bestQuality) { base.bestQuality = m.signalQuality; best.m = m; }
        }
      },
      onError: (message) => { base.error = message; },
    });

    await sleep(LOCK_SECONDS * 1000);

    if (best.m) {
      base.detectedBph = best.m.detectedBph;
      base.rate = best.m.rate;
      base.amplitude = best.m.amplitude;
      base.beatError = best.m.beatError;
    }
  } catch (err) {
    base.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    engine?.destroy();
    await session?.stop().catch(() => {});
  }
  return base;
}

export async function runDeviceTest(
  deviceId: string,
  movement: { name: string | null; bph: number; liftAngle: number },
  onProgress: (p: TestProgress) => void,
): Promise<DeviceTestReport> {
  const total = VARIANTS.length + LOCK_VARIANTS.length + 1;
  let step = 0;
  const advance = (label: string) => onProgress({ step: ++step, total, label });

  advance('Listing audio inputs');
  const devices = await listAudioInputs().catch(() => [] as AudioInput[]);

  const variants: VariantResult[] = [];
  for (const v of VARIANTS) {
    advance(`Testing: ${v.label}`);
    variants.push(await measureVariant(v.id, v.label, deviceId));
    // A moment between streams; some platforms need the previous one released.
    await sleep(300);
  }

  const locks: LockResult[] = [];
  for (const id of LOCK_VARIANTS) {
    const v = VARIANTS.find((x) => x.id === id)!;
    advance(`Listening for a beat: ${v.label}`);
    locks.push(await attemptLock(id, v.label, deviceId, movement.bph, movement.liftAngle));
    await sleep(300);
  }

  return {
    startedAt: new Date().toISOString(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    devices,
    selected: {
      deviceId,
      label: devices.find((d) => d.deviceId === deviceId)?.label ?? 'unknown',
    },
    movement,
    variants,
    locks,
  };
}
