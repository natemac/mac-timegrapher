/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  ClockCalibrator, correctedSampleRate, SECONDS_PER_DAY, MIN_SECONDS,
} from './clock-calibration';

/**
 * Feed a run where the device's clock runs at `ppm` parts per million fast.
 *
 * `currentTime` is quantised to a render quantum, as a real one is — the whole
 * reason the fit is a regression rather than a division of endpoints.
 */
function run(
  c: ClockCalibrator,
  { ppm, seconds, everyMs = 500, quantum = 128 / 44100, from = 0 }:
  { ppm: number; seconds: number; everyMs?: number; quantum?: number; from?: number },
) {
  const ratio = 1 + ppm / 1e6;
  c.beginSession();
  for (let ms = 0; ms <= seconds * 1000; ms += everyMs) {
    const wall = from * 1000 + ms;
    const exact = (ms / 1000) * ratio;
    c.sample(Math.floor(exact / quantum) * quantum, wall);
  }
}

describe('measuring the clock', () => {
  it('says nothing before there is enough of a run', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: MIN_SECONDS / 2 });
    expect(c.result()).toBeNull();
  });

  it('says nothing on too few points, however long the run', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: 300, everyMs: 20_000 });
    expect(c.result()).toBeNull();
  });

  it('recovers a clock running fast', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: 180 });
    const r = c.result()!;
    // 50 ppm is 4.32 s/day.
    expect(r.driftSecondsPerDay).toBeCloseTo(50e-6 * SECONDS_PER_DAY, 1);
  });

  it('recovers a clock running slow, with the sign the right way round', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: -30, seconds: 180 });
    expect(c.result()!.driftSecondsPerDay).toBeCloseTo(-30e-6 * SECONDS_PER_DAY, 1);
  });

  it('recovers an exact clock as no drift at all', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 0, seconds: 180 });
    expect(c.result()!.driftSecondsPerDay).toBeCloseTo(0, 1);
  });

  /*
     The point of fitting rather than dividing two endpoints. currentTime moves
     in steps of about 2.9 ms; dividing endpoints inherits all of it, which over
     two minutes is 24 ppm — worse than the error being measured.
  */
  it('beats the quantisation it is measuring through', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: 180 });
    const r = c.result()!;
    expect(r.errorSecondsPerDay).toBeLessThan(0.5);
  });

  it('reports how long it has been measuring', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 10, seconds: 120 });
    expect(c.result()!.seconds).toBeGreaterThan(119);
  });
});

describe('interruptions', () => {
  /*
     A suspended context, a backgrounded tab or a sleeping machine all appear
     as one enormous step. Counted, a single one of them would swamp the fit.
  */
  it('throws away a step where the audio clock stalled', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: 120 });
    const before = c.result()!.driftSecondsPerDay;

    // Wall time advances a minute; the audio clock does not.
    c.sample(120 * 1.00005, 240_000);
    c.sample(120 * 1.00005 + 0.5, 240_500);

    expect(c.result()!.driftSecondsPerDay).toBeCloseTo(before, 1);
  });

  it('throws away a gap longer than a sampling interval', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: 120 });
    const seconds = c.result()!.seconds;
    c.sample(200, 400_000);
    expect(c.result()!.seconds).toBeCloseTo(seconds, 1);
  });

  /*
     The regression this guards. Accumulating short runs is biased: currentTime
     is floored to a render quantum, so each run under-reports its own elapsed
     audio by a mean of half a quantum. Within one run that is a constant offset
     and does not touch the slope; across runs the offsets compound. Four
     twenty-five-second positions came out sixty parts per million low — larger
     than the error being measured, and the wrong way round.
  */
  it('measures one continuous run, not several stitched together', () => {
    const c = new ClockCalibrator();
    for (let i = 0; i < 4; i++) run(c, { ppm: 50, seconds: 25, from: i * 300 });

    // Only the last run counts, and it is too short to report anything.
    expect(c.result()).toBeNull();
  });

  it('starts over when a new capture opens a new context', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: 180 });
    expect(c.result()).not.toBeNull();

    c.beginSession();
    expect(c.result()).toBeNull();
    expect(c.seconds).toBe(0);
  });

  it('forgets everything when reset', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: 120 });
    c.reset();
    expect(c.result()).toBeNull();
    expect(c.seconds).toBe(0);
  });
});

describe('correctedSampleRate', () => {
  it('leaves a nominal device alone', () => {
    expect(correctedSampleRate(44100, 0)).toBe(44100);
  });

  /*
     A clock running fast means more real samples per second than assumed, so
     the rate handed to the core goes up — and a watch that looked slow reads
     true.
  */
  it('raises the rate for a clock running fast', () => {
    const corrected = correctedSampleRate(44100, 4.32); // 50 ppm
    expect(corrected).toBeCloseTo(44100 * 1.00005, 3);
    expect(corrected).toBeGreaterThan(44100);
  });

  it('lowers it for a clock running slow', () => {
    expect(correctedSampleRate(44100, -4.32)).toBeLessThan(44100);
  });

  /*
     The correction cancels the error it was measured from, to within the
     uncertainty the measurement itself reports — which is the honest bar. A
     tighter assertion than the reported standard error would be asserting
     something the method does not claim.
  */
  it('cancels the drift it was measured from', () => {
    const c = new ClockCalibrator();
    run(c, { ppm: 50, seconds: 180 });
    const r = c.result()!;

    const trueRate = 44100 * (1 + 50 / 1e6);
    const corrected = correctedSampleRate(44100, r.driftSecondsPerDay);

    // Both sides expressed as seconds a day, so the tolerance means something.
    const residual = ((corrected - trueRate) / 44100) * SECONDS_PER_DAY;
    expect(Math.abs(residual)).toBeLessThanOrEqual(Math.max(r.errorSecondsPerDay, 0.1));
  });
});
