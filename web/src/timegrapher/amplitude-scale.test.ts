/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { amplitudeMsBefore, msBeforeToAmplitude } from './amplitude-scale';

/* One beat of a 21600 bph movement. */
const PERIOD = 7200 / 21600;
const LIFT = 52;

describe('the amplitude ruler', () => {
  /*
     The ruler and the marker must agree, because the display's whole claim is
     that reading the marker against the ruler gives you the amplitude. If the
     two disagree by so much as a rounding, the picture lies about the number
     beside it.
  */
  it('places a marker where the ruler says that amplitude is', () => {
    for (const degrees of [150, 200, 250, 300, 350]) {
      const ms = amplitudeMsBefore(LIFT, degrees, PERIOD);
      expect(ms).not.toBeNull();
      expect(msBeforeToAmplitude(LIFT, ms as number, PERIOD)).toBeCloseTo(degrees, 6);
    }
  });

  /*
     tg_measure.c computes amplitude as lift_angle * p->amp, where amp is the
     ratio the algorithm recovers. Here the same geometry runs forwards. This
     pins the direction: a bigger swing unlocks EARLIER, so it sits further
     from the beat, further left.
  */
  it('puts a larger amplitude closer to the beat, not further from it', () => {
    /* Counter-intuitive until you see why: a balance with a wide swing is
       moving fast, so it crosses the lift arc in less time. The unlocking
       lands nearer the impulse, not further from it. Getting this backwards
       would mirror the whole ruler and still look plausible. */
    const wide = amplitudeMsBefore(LIFT, 300, PERIOD) as number;
    const narrow = amplitudeMsBefore(LIFT, 200, PERIOD) as number;
    expect(wide).toBeGreaterThan(0);
    expect(wide).toBeLessThan(narrow);
  });

  it('scales with the lift angle, which is why a wrong preset is a wrong reading', () => {
    const at52 = amplitudeMsBefore(52, 270, PERIOD) as number;
    const at44 = amplitudeMsBefore(44, 270, PERIOD) as number;
    expect(at44).toBeLessThan(at52);
    // The same marker position read with the wrong lift angle is a different
    // amplitude — about 15% out for these two, which is the whole argument for
    // the movement preset.
    expect(msBeforeToAmplitude(44, at52, PERIOD) as number).toBeCloseTo(270 * (44 / 52), 6);
  });

  it('has no answer below half the lift angle, where the arcsine runs out', () => {
    expect(amplitudeMsBefore(52, 25, PERIOD)).toBeNull();
    expect(amplitudeMsBefore(52, 26, PERIOD)).not.toBeNull();
  });

  it('rejects a period it cannot have', () => {
    expect(amplitudeMsBefore(LIFT, 270, 0)).toBeNull();
    expect(msBeforeToAmplitude(LIFT, 10, 0)).toBeNull();
    expect(msBeforeToAmplitude(LIFT, 0, PERIOD)).toBeNull();
  });

  /*
     Upstream draws no marker outside 100..360 degrees, and neither does this:
     a figure derived from a spurious impulse is not an amplitude, and printing
     one next to the curve would be worse than printing nothing.
  */
  it('refuses to label an impulse outside the believable range', () => {
    const tooLate = amplitudeMsBefore(LIFT, 400, PERIOD) as number;
    expect(msBeforeToAmplitude(LIFT, tooLate, PERIOD)).toBeNull();
    const tooEarly = amplitudeMsBefore(LIFT, 90, PERIOD) as number;
    expect(msBeforeToAmplitude(LIFT, tooEarly, PERIOD)).toBeNull();
  });
});
