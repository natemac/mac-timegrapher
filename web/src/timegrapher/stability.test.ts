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

  /*
     The amplitude figures here were ±9 to ±12 when this was written, taken
     from the app before push() stopped averaging low-confidence samples in.
     They were never a measure of what the bench holds — they were that
     artefact, and asserting a reading swinging twenty-four degrees peak to
     peak ought to settle was asserting something untrue.

     Re-derived from the same two runs at full analysis confidence: ±0.6 and
     ±3.0. Rate and beat error were real and are unchanged.
  */
  it.each([
    ['live view',   { rate: 0.5, amp: 3.0, beat: 0.88 }],
    ['capture one', { rate: 0.2, amp: 1.4, beat: 0.82 }],
    ['capture two', { rate: 0.2, amp: 0.6, beat: 0.89 }],
  ])('settles: %s', (_label, spread) => {
    const t = new StabilityTracker();
    bench(t, spread);
    expect(t.settling(30)).toBe('settled');
  });

  /*
     And the reason the bound came down to 8. Sixteen degrees peak to peak is
     not a bench holding steady; ±15 would have recorded it as settled and
     printed it on a customer's document.
  */
  it('refuses an amplitude that would once have passed', () => {
    const t = new StabilityTracker();
    bench(t, { rate: 0.2, amp: 12, beat: 0.85 });
    expect(t.settling(30)).not.toBe('settled');
  });

  /*
     The point of the loosened beat-error bound is that it stops gating, not
     that nothing gates. Audio that is genuinely wandering must still read
     MOVING, and rate is what catches it.
  */
  it('still refuses a reading whose rate is wandering', () => {
    const t = new StabilityTracker();
    bench(t, { rate: 6, amp: 3, beat: 0.85 });
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
    bench(t, { rate: 0.3, amp: 3, beat: 4 });
    expect(t.settling(30)).not.toBe('settled');
  });
});

/*
   Replayed from a real inspection log: a USB pickup on an NH35, iPhone Safari,
   29 dB above the room. The rows are the ones where something changed.

   The fault it caught: the core reports its confidence in tiers as longer
   analysis windows converge, and the first tier produced 218.7° and then
   196.1° while the settled reading sat near 212°. Those two pinned the
   amplitude spread at ±11.3 for the whole run — four times what the bench
   holds once the analysis has its full window.
*/
describe('a reading as the core gains confidence', () => {
  const RUN: [number, number, number, number, number][] = [
    // t, rate, amplitude, beatError, quality
    [4.1, 13.04, 218.7, 1.49, 0.50],
    [4.6, 13.43, 218.5, 1.50, 0.50],
    [5.1, 13.04, 217.6, 1.49, 0.50],
    [5.6, 13.04, 197.1, 1.49, 0.50],
    [6.1, 13.04, 197.3, 1.50, 0.50],
    [6.6, 12.76, 196.8, 1.49, 0.50],
    [7.1, 12.76, 196.1, 1.45, 0.50],
    [7.6, 12.76, 196.3, 1.45, 0.50],
    [8.1, 12.95, 215.5, 1.58, 0.75],
    [8.6, 12.75, 215.3, 1.68, 0.75],
    [9.1, 12.83, 214.6, 1.68, 0.75],
    [9.6, 12.59, 214.0, 1.66, 0.75],
    [16.2, 12.51, 213.5, 1.61, 1.00],
    [16.6, 12.43, 212.9, 1.63, 1.00],
    [17.1, 12.40, 212.4, 1.65, 1.00],
    [17.6, 12.31, 212.2, 1.68, 1.00],
    [18.2, 12.25, 212.0, 1.70, 1.00],
    [18.7, 12.20, 211.7, 1.70, 1.00],
    [19.1, 12.16, 211.0, 1.70, 1.00],
    [19.6, 12.11, 210.8, 1.68, 1.00],
    [20.2, 11.99, 210.3, 1.70, 1.00],
    [20.7, 11.91, 209.7, 1.68, 1.00],
    [21.2, 11.81, 209.9, 1.68, 1.00],
    [21.7, 11.75, 215.7, 1.61, 1.00],
    [22.2, 11.67, 215.3, 1.66, 1.00],
  ];

  function replay(t: StabilityTracker) {
    for (const [at, rate, amp, beat, q] of RUN) t.push(at, rate, amp, beat, q);
  }

  it('reports what the bench holds at full confidence, not during the climb', () => {
    const t = new StabilityTracker();
    replay(t);

    // ±11.3 before the fix, from two samples the core itself flagged as its
    // least confident.
    expect(t.spread('amplitude')!.plusMinus).toBeCloseTo(3.0, 1);
    expect(t.spread('rate')!.plusMinus).toBeCloseTo(0.42, 2);
    expect(t.spread('beatError')!.plusMinus).toBeCloseTo(0.045, 2);
  });

  it('keeps only the samples measured at the confidence it ended on', () => {
    const t = new StabilityTracker();
    replay(t);
    expect(t.spread('rate')!.count).toBe(RUN.filter(([, , , , q]) => q === 1).length);
  });

  it('settles, which is the point', () => {
    const t = new StabilityTracker();
    replay(t);
    expect(t.settling(22.2)).toBe('settled');
  });

  /* A dip in confidence is the reading degrading, which is what the spread is
     for. Clearing on every dip would leave a wandering signal unable to fill a
     window at all. */
  it('does not throw the window away when confidence falls', () => {
    const t = new StabilityTracker();
    for (let i = 0; i < 10; i++) t.push(i * 0.5, 12, 210, 1.6, 1);
    const before = t.spread('rate')!.count;
    t.push(5.5, 12, 210, 1.6, 0.5);
    expect(t.spread('rate')!.count).toBe(before + 1);
  });

  it('starts a fresh window at each step up', () => {
    const t = new StabilityTracker();
    t.push(0.5, 99, 99, 9, 0.5);
    t.push(1.0, 12, 210, 1.6, 0.75);
    expect(t.spread('rate')!.count).toBe(1);
    t.push(1.5, 12, 210, 1.6, 1);
    expect(t.spread('rate')!.count).toBe(1);
    expect(t.spread('rate')!.mean).toBe(12);
  });

  it('forgets the confidence it reached when the average is restarted', () => {
    const t = new StabilityTracker();
    replay(t);
    t.reset();
    t.push(0.5, 13, 218, 1.5, 0.5);
    expect(t.spread('rate')!.count).toBe(1);
  });
});
