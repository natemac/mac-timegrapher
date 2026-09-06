/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  stabilityPosition, stabilityLimiter, stabilityState,
  LOCKED_FROM, SETTLED_AFTER_SECONDS, type StabilityFacts,
} from './stability-position';
import { SETTLED_BOUNDS, StabilityTracker, type Spread } from './stability';

const spread = (plusMinus: number): Spread =>
  ({ min: -plusMinus, max: plusMinus, mean: 0, plusMinus, count: 40 });

/** Every bound comfortably met, so a test can vary one thing at a time. */
const steady = (over: Partial<StabilityFacts> = {}): StabilityFacts => ({
  settling: 'settled',
  seconds: 30,
  rate: spread(SETTLED_BOUNDS.rate * 0.1),
  beatError: spread(SETTLED_BOUNDS.beatError * 0.1),
  amplitude: spread(SETTLED_BOUNDS.amplitude * 0.1),
  ...over,
});

describe('the stability cursor', () => {
  it('has nowhere to sit before a reading exists', () => {
    expect(stabilityPosition(steady({ settling: 'waiting', rate: null }))).toBeNull();
  });

  it('reaches the far end only for a reading that has stopped moving', () => {
    expect(stabilityPosition(steady({
      rate: spread(0), beatError: spread(0), amplitude: spread(0),
    }))).toBe(1);
  });

  it('sits just inside the oval for a reading exactly at the bound', () => {
    const at = stabilityPosition(steady({ rate: spread(SETTLED_BOUNDS.rate) }));
    expect(at).toBeCloseTo(LOCKED_FROM, 6);
  });

  it('is at the far left once a spread is three times its bound', () => {
    expect(stabilityPosition(steady({
      settling: 'moving', rate: spread(SETTLED_BOUNDS.rate * 3),
    }))).toBe(0);
  });

  it('does not fall off the scale for a wildly unstable reading', () => {
    expect(stabilityPosition(steady({
      settling: 'moving', rate: spread(SETTLED_BOUNDS.rate * 500),
    }))).toBe(0);
  });

  it('moves right as the spread tightens', () => {
    const loose = stabilityPosition(steady({ settling: 'moving', rate: spread(SETTLED_BOUNDS.rate * 2) }))!;
    const tighter = stabilityPosition(steady({ settling: 'moving', rate: spread(SETTLED_BOUNDS.rate * 1.2) }))!;
    expect(tighter).toBeGreaterThan(loose);
  });

  /*
     The point of the rewrite. Rate is the criterion, but the verdict also
     waits on the two sanity bounds, and a bar driven by rate alone told the
     operator a reading was nearly settled while amplitude was still swinging
     sixteen degrees peak to peak.
  */
  it('reports the worst of the criteria, not just the rate', () => {
    const rateOnly = steady({ settling: 'moving', amplitude: spread(SETTLED_BOUNDS.amplitude * 2.5) });
    const allGood = steady({ settling: 'moving', seconds: 10 });
    expect(stabilityPosition(rateOnly)!).toBeLessThan(stabilityPosition(allGood)!);
  });

  it('waits on beat error too', () => {
    const noisyBeat = steady({ settling: 'moving', beatError: spread(SETTLED_BOUNDS.beatError * 2.5) });
    expect(stabilityPosition(noisyBeat)!).toBeLessThan(LOCKED_FROM * 0.5);
  });

  /*
     Amplitude is absent on quartz and on a capture route that cannot read it.
     `settling()` leaves it out of the verdict there, so the bar must too —
     otherwise the cursor pins left for a figure nobody is waiting on.
  */
  it('ignores an amplitude the core never produced', () => {
    const withNone = steady({ settling: 'moving', seconds: 10, amplitude: null });
    const withGood = steady({ settling: 'moving', seconds: 10 });
    expect(stabilityPosition(withNone)).toBe(stabilityPosition(withGood));
  });

  it('counts the time still to run as one of the things being waited on', () => {
    const early = stabilityPosition(steady({ settling: 'settling', seconds: 5 }))!;
    const later = stabilityPosition(steady({ settling: 'settling', seconds: 15 }))!;
    expect(early).toBeLessThan(later);
    expect(later).toBeLessThan(LOCKED_FROM);
    expect(early).toBeCloseTo(LOCKED_FROM * 0.985 * (5 / SETTLED_AFTER_SECONDS), 6);
  });

  /*
     The bar and the two words beside it are one statement. Entering the oval
     IS the locked verdict, so nothing short of that verdict may reach it.
  */
  it('never reaches the oval unless the verdict is settled', () => {
    for (const settling of ['waiting', 'moving', 'settling'] as const) {
      const p = stabilityPosition(steady({ settling }))!;
      expect(p).toBeLessThan(LOCKED_FROM);
    }
  });

  it('is always inside the oval when the verdict is settled', () => {
    const p = stabilityPosition(steady({ rate: spread(SETTLED_BOUNDS.rate) }))!;
    expect(p).toBeGreaterThanOrEqual(LOCKED_FROM);
    expect(p).toBeLessThanOrEqual(1);
  });

  /*
     Guards the one number this module repeats rather than imports. If
     stability.ts ever stops offering a settled verdict at twenty seconds, the
     bar would fill early and sit against the oval waiting — so pin it against
     the real tracker rather than against a comment.
  */
  it('agrees with the tracker about when a settled verdict becomes possible', () => {
    const tracker = new StabilityTracker();
    for (let t = 0; t <= 40; t += 0.5) tracker.push(t, 1.0, 280, 0.3, 1);
    expect(tracker.settling(SETTLED_AFTER_SECONDS - 0.5)).not.toBe('settled');
    expect(tracker.settling(SETTLED_AFTER_SECONDS)).toBe('settled');
  });
});

describe('what the reading is waiting on', () => {
  it('says nothing once it is settled', () => {
    expect(stabilityLimiter(steady())).toBeNull();
  });

  it('names the criterion that is furthest off', () => {
    expect(stabilityLimiter(steady({
      settling: 'moving', amplitude: spread(SETTLED_BOUNDS.amplitude * 2.8),
    }))).toBe('amplitude');
    expect(stabilityLimiter(steady({
      settling: 'moving', beatError: spread(SETTLED_BOUNDS.beatError * 2.8),
    }))).toBe('beatError');
    expect(stabilityLimiter(steady({
      settling: 'moving', rate: spread(SETTLED_BOUNDS.rate * 2.8),
    }))).toBe('rate');
  });

  it('says it just needs longer when everything else is already in bounds', () => {
    expect(stabilityLimiter(steady({ settling: 'settling', seconds: 6 }))).toBe('time');
  });

  /* Rate is the criterion; the sanity bounds are not. When two are equally far
     off, the one that decides the verdict is the one worth naming. */
  it('names rate ahead of a sanity bound at equal distance', () => {
    expect(stabilityLimiter(steady({
      settling: 'moving',
      rate: spread(SETTLED_BOUNDS.rate * 2),
      beatError: spread(SETTLED_BOUNDS.beatError * 2),
    }))).toBe('rate');
  });
});

describe('what the bar is showing', () => {
  it('is idle with nothing measured and nothing running', () => {
    expect(stabilityState(false, false, 'waiting')).toBe('idle');
  });

  /*
     Stopping no longer wipes the panel — the last reading is the one you write
     down — so the bar has to say the figures are no longer live without
     removing them.
  */
  it('is paused when a reading is left on screen after stopping', () => {
    expect(stabilityState(false, true, 'settled')).toBe('paused');
  });

  it('is locked only when the reading has actually settled', () => {
    expect(stabilityState(true, true, 'settled')).toBe('locked');
    expect(stabilityState(true, true, 'settling')).toBe('moving');
    expect(stabilityState(true, true, 'moving')).toBe('moving');
  });
});
