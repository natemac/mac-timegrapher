/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { SignalStrength } from '../audio/signal-strength';
import type { ProcessingWarning } from '../audio/audio-engine';

/*
   Is this device delivering audio good enough to measure a watch by?

   A pre-flight, run before a measurement, that reduces the audio path to a
   single verdict. It is deliberately NOT a calibration: it does not claim the
   ADC clock is exactly its nominal rate. It answers a narrower question — is
   the stream configured correctly, arriving continuously, and carrying a clear
   escapement — which is the question that was invisible the week a 44.1 kHz
   resample starved the clock and nobody could see it.

   Everything here is a pure function of facts the app already produces:
   nothing new listens to audio. The signal that catches the resample case is
   the clock calibrator's own "disturbed" flag — a drift too large for any
   crystal is exactly a starved or interrupted stream, whatever its cause.
*/

/* PASS / WARNING / FAIL / UNKNOWN as the guide asks, plus PENDING for "not
   enough yet" so a check that has not run does not read as a failure. */
export type CheckState = 'pass' | 'warning' | 'fail' | 'unknown' | 'pending';

export interface CheckItem {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

/* A run needs no watch (device) or a watch on the sensor (signal). Kept apart
   so "no escapement" never blocks someone still setting up the microphone. */
export type ReadinessStatus = 'ready' | 'warning' | 'not-ready' | 'pending';

export interface ReadinessReport {
  device: CheckItem[];
  signal: CheckItem[];
  deviceStatus: ReadinessStatus;
  signalStatus: ReadinessStatus;
  overall: ReadinessStatus;
}

export interface ReadinessFacts {
  capturing: boolean;
  deviceLabel: string | null;
  sampleRate: number | null;

  /* From the clock calibrator, used only as a gross integrity check — never to
     calibrate. `disturbed` means the frames-against-wall-time drift is larger
     than any real crystal, i.e. the stream is being starved or interrupted. */
  timingSeconds: number;
  timingDisturbed: boolean;
  /** Fraction of blocks the calibrator threw away, 0..1; null before any. */
  rejectionRate: number | null;

  processing: ProcessingWarning[];

  /* The watch, once it is on the sensor. */
  strength: SignalStrength;
  clipped: boolean;
  hot: boolean;
  measurementValid: boolean;
  /** Recent detected beat rates, to judge whether the lock is holding. */
  recentBph: number[];
  /** The chosen movement's beat rate; null for automatic or quartz. */
  expectedBph: number | null;
  quartz: boolean;
}

/** Below this a mismatch is just noise; a real window is needed to judge timing. */
export const MIN_TIMING_SECONDS = 8;
/*
   How unevenly audio blocks may arrive before it is worth mentioning.

   This measures delivery to the main thread against wall time — not the samples
   themselves, which the worklet keeps contiguous and the DSP works on
   regardless of when the main thread wakes to process them. So a high rate here
   mostly means a busy device or browser, not a compromised measurement, and the
   real starvation case is caught by `timingDisturbed` (an absurd drift), not by
   this. Anchored to two healthy readings — an iPhone at ~2% and a MacBook in
   Firefox with many tabs at ~10% — so the warning sits well above both; the
   fail is a stream barely arriving at all.
*/
export const REJECTION_WARN = 0.30;
export const REJECTION_FAIL = 0.60;
/** Below this the input is too coarse for a watch; well under 44.1 kHz. */
export const MIN_SAMPLE_RATE = 32_000;
export const GOOD_SAMPLE_RATE = 44_100;

/*
   A built-in microphone hears the room, not the movement. Recognised by label
   so the advice can be a warning rather than a block — it still works, just
   worse. Anything not obviously built-in is assumed to be the external pickup
   the operator chose.
*/
export function isBuiltInMic(label: string | null): boolean {
  if (!label) return false;
  return /built-?in|macbook|imac|iphone|ipad|internal|default/i.test(label);
}

function bphStable(recent: number[]): boolean {
  const seen = recent.filter((b) => b > 0);
  if (seen.length < 2) return false;
  return seen.every((b) => b === seen[0]);
}

function statusOf(items: CheckItem[]): ReadinessStatus {
  if (items.some((i) => i.state === 'fail')) return 'not-ready';
  if (items.some((i) => i.state === 'pending')) return 'pending';
  if (items.some((i) => i.state === 'warning' || i.state === 'unknown')) return 'warning';
  return 'ready';
}

function combine(a: ReadinessStatus, b: ReadinessStatus): ReadinessStatus {
  if (a === 'not-ready' || b === 'not-ready') return 'not-ready';
  if (a === 'pending' || b === 'pending') return 'pending';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'ready';
}

const PROCESSING_LABEL: Record<string, string> = {
  echoCancellation: 'Echo cancellation',
  autoGainControl: 'Automatic gain control',
  noiseSuppression: 'Noise suppression',
};

function processingItems(facts: ReadinessFacts): CheckItem[] {
  const byName = new Map(facts.processing.map((w) => [w.setting, w.state]));
  return (['echoCancellation', 'autoGainControl', 'noiseSuppression'] as const).map((name) => {
    const reported = byName.get(name);
    if (reported === 'applied') {
      // The one that matters most: AGC does not degrade amplitude, it
      // invalidates it. On is a hard fail, not a warning.
      return { id: name, label: PROCESSING_LABEL[name], state: 'fail' as const, detail: 'On — turn it off' };
    }
    if (reported === 'unreported') {
      return { id: name, label: PROCESSING_LABEL[name], state: 'unknown' as const, detail: 'Browser did not say' };
    }
    return { id: name, label: PROCESSING_LABEL[name], state: 'pass' as const, detail: 'Off' };
  });
}

export function assessReadiness(facts: ReadinessFacts): ReadinessReport {
  const device: CheckItem[] = [];

  // Input device
  if (!facts.deviceLabel) {
    device.push({ id: 'input', label: 'Input', state: 'fail', detail: 'No audio input found' });
  } else if (isBuiltInMic(facts.deviceLabel)) {
    device.push({ id: 'input', label: 'Input', state: 'warning', detail: `${facts.deviceLabel} — a built-in mic hears the room` });
  } else {
    device.push({ id: 'input', label: 'Input', state: 'pass', detail: facts.deviceLabel });
  }

  // Stream active
  device.push(
    !facts.capturing
      ? { id: 'stream', label: 'Audio stream', state: 'pending', detail: 'Not started' }
      : facts.timingSeconds > 0 || facts.rejectionRate !== null
        ? { id: 'stream', label: 'Audio stream', state: 'pass', detail: 'Active' }
        : { id: 'stream', label: 'Audio stream', state: 'pending', detail: 'Starting…' },
  );

  // Sample rate
  if (facts.sampleRate === null) {
    device.push({ id: 'rate', label: 'Sample rate', state: 'pending', detail: '—' });
  } else if (facts.sampleRate < MIN_SAMPLE_RATE) {
    device.push({ id: 'rate', label: 'Sample rate', state: 'fail', detail: `${facts.sampleRate.toLocaleString()} Hz — too low` });
  } else if (facts.sampleRate < GOOD_SAMPLE_RATE) {
    device.push({ id: 'rate', label: 'Sample rate', state: 'warning', detail: `${facts.sampleRate.toLocaleString()} Hz — low` });
  } else {
    device.push({ id: 'rate', label: 'Sample rate', state: 'pass', detail: `${facts.sampleRate.toLocaleString()} Hz` });
  }

  // Timing integrity — the resample/interruption catch.
  if (!facts.capturing || facts.timingSeconds < MIN_TIMING_SECONDS) {
    device.push({ id: 'timing', label: 'Audio timing', state: 'pending', detail: facts.capturing ? `Checking… ${facts.timingSeconds.toFixed(0)}s` : 'Not started' });
  } else if (facts.timingDisturbed) {
    device.push({ id: 'timing', label: 'Audio timing', state: 'fail', detail: 'Frames not keeping pace — stream starved or interrupted' });
  } else if (facts.rejectionRate !== null && facts.rejectionRate > REJECTION_FAIL) {
    device.push({ id: 'timing', label: 'Audio timing', state: 'fail', detail: 'Audio barely arriving — the stream is choked' });
  } else if (facts.rejectionRate !== null && facts.rejectionRate > REJECTION_WARN) {
    device.push({ id: 'timing', label: 'Audio timing', state: 'warning', detail: `Arriving unevenly (${(facts.rejectionRate * 100).toFixed(0)}%) — usually a busy device; the reading tolerates it` });
  } else {
    device.push({ id: 'timing', label: 'Audio timing', state: 'pass', detail: 'Stable' });
  }

  device.push(...processingItems(facts));

  // ---- Signal phase (watch on the sensor) ----
  const signal: CheckItem[] = [];

  if (!facts.capturing) {
    signal.push({ id: 'signal', label: 'Signal', state: 'pending', detail: 'Not started' });
  } else if (facts.strength === 'none') {
    signal.push({ id: 'signal', label: 'Signal', state: 'fail', detail: 'Nothing detected' });
  } else if (facts.strength === 'weak') {
    signal.push({ id: 'signal', label: 'Signal', state: 'fail', detail: 'Too weak — press the watch firmly to the pickup' });
  } else if (facts.strength === 'fair') {
    signal.push({ id: 'signal', label: 'Signal', state: 'warning', detail: 'Fair — usable, but firmer contact is better' });
  } else {
    signal.push({ id: 'signal', label: 'Signal', state: 'pass', detail: facts.strength === 'excellent' ? 'Excellent' : 'Good' });
  }

  // Clipping / headroom
  signal.push(
    !facts.capturing
      ? { id: 'clipping', label: 'Clipping', state: 'pending', detail: '—' }
      : facts.clipped
        ? { id: 'clipping', label: 'Clipping', state: 'fail', detail: 'Clipping — turn the input down' }
        : facts.hot
          ? { id: 'clipping', label: 'Clipping', state: 'warning', detail: 'Hot — close to clipping' }
          : { id: 'clipping', label: 'Clipping', state: 'pass', detail: 'Headroom to spare' },
  );

  // Escapement + lock. Quartz has no escapement to hear, so it is not judged.
  if (facts.quartz) {
    signal.push({ id: 'escapement', label: 'Escapement', state: 'unknown', detail: 'Quartz — no escapement to detect' });
  } else if (!facts.capturing) {
    signal.push({ id: 'escapement', label: 'Escapement', state: 'pending', detail: 'Not started' });
  } else if (!facts.measurementValid) {
    signal.push({ id: 'escapement', label: 'Escapement', state: 'fail', detail: 'No repeating beat found' });
  } else if (!bphStable(facts.recentBph)) {
    signal.push({ id: 'escapement', label: 'Escapement', state: 'warning', detail: 'Detected, but the rate is still jumping' });
  } else if (facts.expectedBph !== null && facts.recentBph[facts.recentBph.length - 1] !== facts.expectedBph) {
    signal.push({ id: 'escapement', label: 'Escapement', state: 'warning', detail: `Locked at ${facts.recentBph[facts.recentBph.length - 1].toLocaleString()} bph, not the ${facts.expectedBph.toLocaleString()} expected` });
  } else {
    const bph = facts.recentBph[facts.recentBph.length - 1];
    signal.push({ id: 'escapement', label: 'Escapement', state: 'pass', detail: `Locked at ${bph.toLocaleString()} bph` });
  }

  const deviceStatus = statusOf(device);
  const signalStatus = statusOf(signal);
  return {
    device,
    signal,
    deviceStatus,
    signalStatus,
    overall: combine(deviceStatus, signalStatus),
  };
}
