/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { classify } from '../audio/signal-strength';

/** Below this the input is too coarse for a watch; well under 44.1 kHz. */
export const MIN_SAMPLE_RATE = 32_000;
export const GOOD_SAMPLE_RATE = 44_100;

/*
   A built-in microphone hears the room, not the movement. Recognised by label
   so the result can be a warning rather than a failure — it still works, just
   worse. Anything not obviously built-in is assumed to be the external pickup
   the operator chose.
*/
export function isBuiltInMic(label: string | null): boolean {
  if (!label) return false;
  return /built-?in|macbook|imac|iphone|ipad|internal|default/i.test(label);
}

/*
   The device check: what is asked, in what order, and how each answer is
   graded.

   One pass, top to bottom, each step reported as it finishes. The order is not
   presentation — it is dependency. There is no point asking about the sample
   rate before the stream opens, or about an escapement before anything is
   arriving at all, and a check that reported them out of order would have the
   operator chasing the last failure rather than the first.

   Everything here is a pure function of facts the run collects. The audio lives
   in audio/device-check-run.ts; this file is what those facts mean, so the
   meanings can be tested without a microphone.

   The one rule that outranks the rest: **nothing passes by default.** A check
   that was not made is not a check that succeeded. On the platform this panel
   exists for, an undisclosed gain control reports as absent, and reading that
   silence as "off" is exactly how an invalidated amplitude comes to look like a
   good one.
*/

/** The badge states the stylesheet draws. */
export type CheckState = 'pass' | 'warn' | 'fail' | 'unknown' | 'running' | 'pending' | 'skipped';

export type StepId =
  // Device: nothing on the sensor is needed for any of these.
  | 'browser'
  | 'permission'
  | 'input'
  | 'stream'
  | 'rate'
  | 'echoCancellation'
  | 'autoGainControl'
  | 'noiseSuppression'
  | 'timing'
  // Signal: what is arriving, whatever it is.
  | 'level'
  | 'clipping'
  | 'bandwidth'
  // Movement: only meaningful with a watch on the sensor.
  | 'energy'
  | 'beat'
  | 'analysis';

export type StepGroup = 'device' | 'signal' | 'movement';

export interface StepSpec {
  id: StepId;
  group: StepGroup;
  label: string;
  /** What it is doing, shown while this step is the one running. */
  doing: string;
}

/*
   Roughly how long each step takes, so the progress bar moves at the rate the
   check actually runs rather than jumping a fifteenth per step and then sitting
   still through the two that take ten seconds each.
*/
export const STEP_SECONDS: Record<StepId, number> = {
  browser: 0.1,
  permission: 0.3,
  input: 0.2,
  stream: 0.6,
  rate: 0.1,
  echoCancellation: 0.1,
  autoGainControl: 0.1,
  noiseSuppression: 0.1,
  timing: 10,
  level: 0,
  clipping: 0,
  bandwidth: 0,
  energy: 0,
  beat: 15,
  analysis: 0,
};

export const STEPS: StepSpec[] = [
  { id: 'browser', group: 'device', label: 'Browser support', doing: 'Checking this browser can measure at all' },
  { id: 'permission', group: 'device', label: 'Microphone access', doing: 'Asking for the microphone' },
  { id: 'input', group: 'device', label: 'Input', doing: 'Opening the chosen input' },
  { id: 'stream', group: 'device', label: 'Audio stream', doing: 'Waiting for audio to arrive' },
  { id: 'rate', group: 'device', label: 'Sample rate', doing: 'Reading the rate in force' },
  { id: 'echoCancellation', group: 'device', label: 'Echo cancellation', doing: 'Reading what the browser applied' },
  { id: 'autoGainControl', group: 'device', label: 'Automatic gain control', doing: 'Reading what the browser applied' },
  { id: 'noiseSuppression', group: 'device', label: 'Noise suppression', doing: 'Reading what the browser applied' },
  { id: 'timing', group: 'device', label: 'Audio timing', doing: 'Watching the audio clock keep pace' },

  { id: 'level', group: 'signal', label: 'Input level', doing: 'Measuring what is arriving' },
  { id: 'clipping', group: 'signal', label: 'Headroom', doing: 'Looking for clipping' },
  { id: 'bandwidth', group: 'signal', label: 'Frequency range', doing: 'Checking the input carries high frequencies' },

  { id: 'energy', group: 'movement', label: 'Tick energy', doing: 'Listening for ticks above the room' },
  { id: 'beat', group: 'movement', label: 'Beat lock', doing: 'Looking for a repeating beat' },
  { id: 'analysis', group: 'movement', label: 'Analysis lock', doing: 'Waiting for a usable reading' },
];

export const GROUP_LABEL: Record<StepGroup, string> = {
  device: 'DEVICE',
  signal: 'SIGNAL',
  movement: 'MOVEMENT',
};

export interface StepResult {
  id: StepId;
  state: CheckState;
  detail: string;
}

const BADGE: Record<CheckState, string> = {
  pass: 'OK',
  warn: 'Review',
  fail: 'Issue',
  unknown: 'Unknown',
  running: 'Checking…',
  pending: '—',
  skipped: 'Skipped',
};

export function badgeFor(state: CheckState): string {
  return BADGE[state];
}

const result = (id: StepId, state: CheckState, detail: string): StepResult => ({ id, state, detail });

/** The list as it looks before anything has run. */
export function pendingResults(includeMovement: boolean): StepResult[] {
  return STEPS.map((s) => (
    s.group === 'movement' && !includeMovement
      ? result(s.id, 'skipped', 'Not included in this check')
      : result(s.id, 'pending', 'Not checked yet')
  ));
}

/** Total seconds a run of this shape should take, for the progress bar. */
export function estimatedSeconds(includeMovement: boolean): number {
  return STEPS
    .filter((s) => includeMovement || s.group !== 'movement')
    .reduce((total, s) => total + STEP_SECONDS[s.id], 0);
}

// ---------------------------------------------------------------- graders --

export function gradeBrowser(secure: boolean, worklet: boolean): StepResult {
  if (!secure) {
    return result('browser', 'fail',
      'Not a secure connection — the browser will not grant the microphone. Open the app over HTTPS.');
  }
  if (!worklet) {
    return result('browser', 'fail',
      'No AudioWorklet in this browser. Use a current Chrome, Edge, Firefox or Safari.');
  }
  return result('browser', 'pass', 'Secure connection, AudioWorklet available');
}

export function gradePermission(granted: boolean, error: string | null): StepResult {
  if (granted) return result('permission', 'pass', 'Granted');
  return result('permission', 'fail',
    error ?? 'Not granted. Allow the microphone in your browser’s site settings.');
}

/**
 * Which input the browser actually opened.
 *
 * The one that matters most on Android, where a chosen USB pickup is silently
 * swapped for the built-in microphone unless the capture takes the platform's
 * communication route. `default` and `communications` are aliases rather than
 * devices, so they are not a mismatch either way.
 */
export function gradeInput(
  chosenLabel: string | null,
  requestedId: string,
  grantedId: string | null,
): StepResult {
  if (!chosenLabel) return result('input', 'fail', 'No audio input found');

  const alias = (id: string) => id === '' || id === 'default' || id === 'communications';
  if (grantedId && !alias(requestedId) && !alias(grantedId) && grantedId !== requestedId) {
    return result('input', 'warn',
      `${chosenLabel} was asked for; the browser opened a different device. On Android this is normal for a USB pickup and the readings still come from it.`);
  }
  if (isBuiltInMic(chosenLabel)) {
    return result('input', 'warn', `${chosenLabel} — a built-in microphone hears the room, not the movement`);
  }
  return result('input', 'pass', chosenLabel);
}

export function gradeStream(blocks: number, seconds: number): StepResult {
  if (blocks === 0) {
    return result('stream', 'fail', 'The input opened but delivered no audio');
  }
  return result('stream', 'pass', `${blocks.toLocaleString()} blocks in ${seconds.toFixed(1)}s`);
}

/**
 * The rate in force, and whether it is the device's own.
 *
 * Asking a 48 kHz device for 44,100 forces a resample the render thread does
 * not keep up with, which starves the audio clock and produces an impossible
 * rate figure over an otherwise clean run. It looks like a bad crystal and is
 * not, which is why the two figures are compared rather than one being shown.
 */
export function gradeSampleRate(granted: number | null, requested: number | undefined): StepResult {
  if (granted === null) return result('rate', 'fail', 'The browser reported no sample rate');
  const shown = `${granted.toLocaleString()} Hz`;

  if (granted < MIN_SAMPLE_RATE) return result('rate', 'fail', `${shown} — too coarse for a watch`);
  if (requested !== undefined && requested !== granted) {
    return result('rate', 'warn',
      `Running at ${shown}, but the device reports ${requested.toLocaleString()} Hz — the audio is being resampled`);
  }
  if (granted < GOOD_SAMPLE_RATE) return result('rate', 'warn', `${shown} — low`);
  return result('rate', 'pass', shown);
}

const PROCESSING_STEPS = {
  echoCancellation: 'echoCancellation',
  autoGainControl: 'autoGainControl',
  noiseSuppression: 'noiseSuppression',
} as const;

export type ProcessingStep = keyof typeof PROCESSING_STEPS;

/**
 * What the browser says it applied.
 *
 * Three answers, not two. Safari omits `autoGainControl` from `getSettings()`
 * altogether, so "off" and "the browser did not say" are different facts and
 * must not render the same — the second is a warning, because silence is not
 * consent and gain control is the one that invalidates amplitude outright.
 */
export function gradeProcessing(
  step: ProcessingStep,
  applied: boolean | null,
  intentional: boolean,
): StepResult {
  if (applied === null) return result(step, 'unknown', 'The browser did not report this');
  if (!applied) return result(step, 'pass', 'Off');
  if (intentional) {
    return result(step, 'warn',
      'On — asked for on purpose, because it is the only way to reach a chosen input on this platform');
  }
  return result(step, 'fail', 'On — it changes the shape of a tick, so amplitude cannot be trusted');
}

/*
   How unevenly audio blocks may arrive before it is worth mentioning. Anchored
   to two healthy readings — an iPhone at ~2% and a MacBook in Firefox with many
   tabs at ~10% — so the warning sits well above both.
*/
export const REJECTION_WARN = 0.3;

export interface TimingFacts {
  seconds: number;
  disturbed: boolean;
  /** Fraction of steps the calibrator threw away, 0..1; null before any. */
  rejectionRate: number | null;
  /** Frames delivered against wall time, as seconds per day. */
  driftSecondsPerDay: number | null;
}

/**
 * Whether the audio clock is keeping pace.
 *
 * Deliberately not a calibration: it does not claim the converter runs at its
 * nominal rate, only that frames are arriving at roughly the rate they should.
 * A drift too large for any crystal is a starved or interrupted stream whatever
 * its cause, and that is what went uncaught the week 44.1 kHz resampled.
 */
export function gradeTiming(f: TimingFacts): StepResult {
  if (f.seconds < 5) return result('timing', 'unknown', 'Not enough of a run to judge');
  if (f.disturbed) {
    return result('timing', 'fail',
      'Frames are not keeping pace — the stream is being starved or interrupted');
  }
  if (f.rejectionRate !== null && f.rejectionRate > REJECTION_WARN) {
    return result('timing', 'warn',
      `Audio arriving unevenly (${(f.rejectionRate * 100).toFixed(0)}% of steps discarded) — usually a busy device; the reading tolerates it`);
  }
  const drift = f.driftSecondsPerDay;
  return result('timing', 'pass',
    drift === null
      ? `Steady over ${f.seconds.toFixed(0)}s`
      : `Steady over ${f.seconds.toFixed(0)}s (${drift > 0 ? '+' : ''}${drift.toFixed(0)} s/day against the system clock)`);
}

export function gradeLevel(levelDb: number, floorDb: number): StepResult {
  if (!Number.isFinite(levelDb) || levelDb < -60) {
    return result('level', 'fail', 'Nothing arriving — silence on this input');
  }
  return result('level', 'pass', `${levelDb.toFixed(0)} dBFS, room at ${floorDb.toFixed(0)} dBFS`);
}

/**
 * Headroom.
 *
 * A well-set input peaks around -12 to -6 dBFS. Clipping is a hard failure
 * rather than a warning: amplitude is read from the shape of an impulse, and a
 * flattened peak has no shape left to read.
 */
export function gradeClipping(peakDb: number): StepResult {
  if (!Number.isFinite(peakDb)) return result('clipping', 'unknown', 'No peak measured');
  if (peakDb >= -0.5) {
    return result('clipping', 'fail', `Clipping at ${peakDb.toFixed(1)} dBFS — turn the input down`);
  }
  if (peakDb > -3) {
    return result('clipping', 'warn', `Peaks at ${peakDb.toFixed(1)} dBFS — very little room left`);
  }
  return result('clipping', 'pass', `Peaks at ${peakDb.toFixed(1)} dBFS`);
}

/**
 * Whether the input carries the frequencies an escapement lives in.
 *
 * A microphone reached over Bluetooth is a voice channel: band-limited to
 * roughly four or eight kilohertz, below where an escapement's impulse is. It
 * looks perfectly healthy on a level meter and can never produce a reading.
 * This is the question that cost a day of guessing before anybody asked it.
 */
export function gradeBandwidth(highDb: number, lowDb: number): StepResult {
  if (!Number.isFinite(highDb) || !Number.isFinite(lowDb)) {
    return result('bandwidth', 'unknown', 'Not enough signal to judge the frequency range');
  }
  const gap = lowDb - highDb;
  if (gap > 35) {
    return result('bandwidth', 'fail',
      `Almost nothing above 4 kHz (${gap.toFixed(0)} dB down) — this looks like a voice channel, such as a Bluetooth headset. An escapement cannot be heard through it.`);
  }
  if (gap > 25) {
    return result('bandwidth', 'warn',
      `Weak above 4 kHz (${gap.toFixed(0)} dB down) — the tick may be hard to pick out`);
  }
  return result('bandwidth', 'pass', `Carries high frequencies (${gap.toFixed(0)} dB down at 4–8 kHz)`);
}

export function gradeEnergy(headroomDb: number, levelDb: number): StepResult {
  if (!Number.isFinite(headroomDb)) return result('energy', 'unknown', 'No signal to judge');
  const strength = classify(headroomDb, levelDb);
  const said = `Ticks stand ${headroomDb.toFixed(0)} dB above the room`;
  if (strength === 'none') return result('energy', 'fail', 'Nothing detected');
  if (strength === 'weak') {
    return result('energy', 'fail', `${said} — too weak. Press the watch firmly onto the pickup.`);
  }
  if (strength === 'fair') return result('energy', 'warn', `${said} — usable, but firmer contact is better`);
  return result('energy', 'pass', said);
}

export function gradeBeat(detectedBph: number | null, expectedBph: number | null): StepResult {
  if (!detectedBph) {
    return result('beat', 'fail', 'No repeating beat found — check the watch is running and in contact');
  }
  const found = `${detectedBph.toLocaleString()} bph`;
  if (expectedBph && detectedBph !== expectedBph) {
    return result('beat', 'warn',
      `Locked at ${found}, not the ${expectedBph.toLocaleString()} the chosen movement expects`);
  }
  return result('beat', 'pass', `Locked at ${found}`);
}

export interface AnalysisFacts {
  validReadings: number;
  seconds: number;
  rate: number | null;
  amplitude: number | null;
  beatError: number | null;
}

export function gradeAnalysis(f: AnalysisFacts): StepResult {
  if (f.validReadings === 0) {
    return result('analysis', 'fail', `Nothing usable in ${f.seconds.toFixed(0)}s of listening`);
  }
  const parts: string[] = [];
  if (f.rate !== null) parts.push(`${f.rate > 0 ? '+' : ''}${f.rate.toFixed(1)} s/day`);
  /* Zero is the core saying it could not determine an amplitude, not a balance
     at rest, so it is left out rather than printed as a reading. */
  if (f.amplitude !== null && f.amplitude > 0) parts.push(`${f.amplitude.toFixed(0)}°`);
  if (f.beatError !== null) parts.push(`${f.beatError.toFixed(1)} ms`);
  const shown = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
  return result('analysis', 'pass',
    `${f.validReadings} usable reading${f.validReadings === 1 ? '' : 's'}${shown}`);
}

// -------------------------------------------------------------- the whole --

/** The verdict for a group, and for the run. */
export type Verdict = 'pass' | 'warn' | 'fail' | 'incomplete';

export function verdictOf(results: StepResult[]): Verdict {
  const graded = results.filter((r) => r.state !== 'skipped');
  if (graded.length === 0) return 'incomplete';
  if (graded.some((r) => r.state === 'fail')) return 'fail';
  if (graded.some((r) => r.state === 'pending' || r.state === 'running')) return 'incomplete';
  if (graded.some((r) => r.state === 'warn' || r.state === 'unknown')) return 'warn';
  return 'pass';
}

/** One sentence for the whole run, for the line under the progress bar. */
export function summarise(results: StepResult[]): string {
  const verdict = verdictOf(results);
  const failed = results.filter((r) => r.state === 'fail');
  const flagged = results.filter((r) => r.state === 'warn' || r.state === 'unknown');
  const name = (id: StepId) => STEPS.find((s) => s.id === id)?.label.toLowerCase() ?? id;

  if (verdict === 'fail') {
    return `This device cannot measure reliably — ${failed.map((r) => name(r.id)).join(', ')}.`;
  }
  if (verdict === 'warn') {
    return `Usable, with ${flagged.length} thing${flagged.length === 1 ? '' : 's'} to look at: ${flagged.map((r) => name(r.id)).join(', ')}.`;
  }
  if (verdict === 'incomplete') return 'Check did not finish.';
  return 'Everything checked passed.';
}
