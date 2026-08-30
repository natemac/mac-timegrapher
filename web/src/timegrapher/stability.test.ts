/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { StabilityTracker, SETTLED_BOUNDS, MIN_SAMPLES_FOR_BEST } from './stability';

/** Two reports a second, alternating either side of a steady value. */
function fill(
  t: StabilityTracker,
  n: number,
  jitter: number,
  { from = 0, amplitude = 260 }: { from?: number; amplitude?: number } = {},
) {
  for (let i = 0; i < n; i++) {
    const sign = i % 2 ? 1 : -1;
    t.push(from + i * 0.5, 10 + sign * jitter, amplitude + sign * jitter, 0.3 + sign * jitter * 0.01);
  }
}

describe('spread', () => {
  it('is null before anything has been pushed', () => {
    expect(new StabilityTracker().spread('rate')).toBeNull();
  });

  it('reports half the peak-to-peak range', () => {
    const t = new StabilityTracker();
    fill(t, 10, 0.5);
    expect(t.spread('rate')!.plusMinus).toBeCloseTo(0.5, 5);
    expect(t.spread('rate')!.mean).toBeCloseTo(10, 5);
  });

  /* The window is thirty seconds; a reading from a minute ago says nothing
     about whether the watch is steady now. */
  it('drops samples that fall out of the window', () => {
    const t = new StabilityTracker();
    fill(t, 10, 5);
    fill(t, 10, 0.1, { from: 100 });
    expect(t.spread('rate')!.count).toBe(10);
    expect(t.spread('rate')!.plusMinus).toBeCloseTo(0.1, 5);
  });
});

describe('settling', () => {
  it('waits until there is enough to judge', () => {
    const t = new StabilityTracker();
    fill(t, 2, 0.1);
    expect(t.settling(1)).toBe('waiting');
  });

  it('reads settled once a steady reading has run long enough', () => {
    const t = new StabilityTracker();
    fill(t, 60, SETTLED_BOUNDS.rate / 4);
    expect(t.settling(30)).toBe('settled');
  });

  /* Twenty seconds minimum: a reading can be briefly steady on its way past
     the value it is heading for. */
  it('is only settling until twenty seconds have passed', () => {
    const t = new StabilityTracker();
    fill(t, 30, SETTLED_BOUNDS.rate / 4);
    expect(t.settling(15)).toBe('settling');
  });

  it('reads moving when the reading is wandering', () => {
    const t = new StabilityTracker();
    fill(t, 60, SETTLED_BOUNDS.rate * 10);
    expect(t.settling(30)).toBe('moving');
  });

  /* The label must not flap between moving and settled on a borderline
     reading, so loosely-within counts as settling. */
  it('reads settling just outside the bounds', () => {
    const t = new StabilityTracker();
    fill(t, 60, SETTLED_BOUNDS.rate * 1.5);
    expect(t.settling(30)).toBe('settling');
  });

  it('does not let a run of undetermined amplitude count as steady', () => {
    const t = new StabilityTracker();
    for (let i = 0; i < 60; i++) t.push(i * 0.5, 10, 0, 0.3);
    // Rate and beat error are rock steady, so this settles on those alone
    // rather than being held back by an amplitude that was never measured.
    expect(t.settling(30)).toBe('settled');
  });
});

describe('best spread', () => {
  it('reports nothing before any window has qualified', () => {
    const t = new StabilityTracker();
    fill(t, 5, 0.2);
    expect(t.best().rate).toBeNull();
  });

  /*
     A window holding three samples is trivially tight — it has not had time to
     disagree with itself. Letting those set the record would suggest a
     threshold nothing could ever meet.
  */
  it('ignores windows too short to mean anything', () => {
    const t = new StabilityTracker();
    fill(t, MIN_SAMPLES_FOR_BEST - 1, 0.05);
    expect(t.best().rate).toBeNull();
  });

  it('records the tightest window once enough samples exist', () => {
    const t = new StabilityTracker();
    fill(t, MIN_SAMPLES_FOR_BEST + 4, 0.4);
    expect(t.best().rate).toBeCloseTo(0.4, 5);
  });

  it('keeps the best rather than the latest', () => {
    const t = new StabilityTracker();
    fill(t, MIN_SAMPLES_FOR_BEST + 4, 0.2);
    const tight = t.best().rate!;
    fill(t, MIN_SAMPLES_FOR_BEST + 4, 3, { from: 100 });
    expect(t.best().rate).toBeCloseTo(tight, 5);
  });

  /*
     reset() runs between every position in an inspection. What the bench can
     hold is a property of the bench, not of one position, and it takes a whole
     session to see — so it has to survive.
  */
  it('survives the between-position reset', () => {
    const t = new StabilityTracker();
    fill(t, MIN_SAMPLES_FOR_BEST + 4, 0.3);
    const before = t.best().rate;
    t.reset();
    expect(t.best().rate).toBe(before);
  });

  it('can be cleared deliberately', () => {
    const t = new StabilityTracker();
    fill(t, MIN_SAMPLES_FOR_BEST + 4, 0.3);
    t.resetBest();
    expect(t.best()).toEqual({ rate: null, amplitude: null, beatError: null });
  });

  /* Amplitude of 0 is the core saying it could not determine it. A run of
     those is not a steady amplitude. */
  it('does not let undetermined amplitude set the record', () => {
    const t = new StabilityTracker();
    for (let i = 0; i < MIN_SAMPLES_FOR_BEST + 4; i++) t.push(i * 0.5, 10, 0, 0.3);
    expect(t.best().amplitude).toBeNull();
    expect(t.best().rate).not.toBeNull();
  });
});

/*
   Replays what a USB pickup on a running NH35 actually produced, at 29 dB
   above the room. Every one of these read MOVING for ever under the earlier
   bounds, so an automatic inspection could never record a position — beat
   error was allowed ±0.3 against a bench that holds ±0.85.
*/
describe('a real bench reading', () => {
  /** Spreads are half the peak-to-peak range, so the swing is twice this. */
  function bench(t: StabilityTracker, spread: { rate: number; amp: number; beat: number }) {
    for (let i = 0; i < 60; i++) {
      const sign = i % 2 ? 1 : -1;
      t.push(
        i * 0.5,
        14.5 + sign * spread.rate,
        232 + sign * spread.amp,
        1.0 + sign * spread.beat,
      );
    }
  }

  it.each([
    ['live view',  { rate: 0.5, amp: 9, beat: 0.88 }],
    ['capture one', { rate: 0.2, amp: 10, beat: 0.82 }],
    ['capture two', { rate: 0.2, amp: 12, beat: 0.89 }],
  ])('settles: %s', (_label, spread) => {
    const t = new StabilityTracker();
    bench(t, spread);
    expect(t.settling(30)).toBe('settled');
  });

  /*
     The point of the loosened beat-error bound is that it stops gating, not
     that nothing gates. Audio that is genuinely wandering must still read
     MOVING, and rate is what catches it.
  */
  it('still refuses a reading whose rate is wandering', () => {
    const t = new StabilityTracker();
    bench(t, { rate: 6, amp: 10, beat: 0.85 });
    expect(t.settling(30)).toBe('moving');
  });

  it('still refuses an amplitude that is swinging wildly', () => {
    const t = new StabilityTracker();
    bench(t, { rate: 0.3, amp: 40, beat: 0.85 });
    expect(t.settling(30)).not.toBe('settled');
  });

  /* A beat error that will not sit still at all is a different fault from one
     resolving near zero, and is worth withholding a Settled on. */
  it('still refuses a beat error far beyond the bench floor', () => {
    const t = new StabilityTracker();
    bench(t, { rate: 0.3, amp: 10, beat: 4 });
    expect(t.settling(30)).not.toBe('settled');
  });
});
