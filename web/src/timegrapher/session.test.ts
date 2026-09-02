/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { summarise, sessionTitle, runningSummary, currentRunSummary, type Reading, type PositionId } from './session';

const reading = (position: PositionId, rate: number, amplitude = 270, beatError = 0.2): Reading => ({
  position,
  rate,
  amplitude,
  beatError,
  bph: 21600,
  at: '2026-08-30T09:00:00.000Z',
});

describe('summarise', () => {
  it('returns null with nothing recorded', () => {
    expect(summarise([])).toBeNull();
  });

  it('averages the rate', () => {
    const s = summarise([reading('dial-up', 2), reading('dial-down', 6)]);
    expect(s!.averageRate).toBe(4);
  });

  it('reports positional spread as worst minus best', () => {
    // This is the number that separates "needs regulating" from "needs work".
    const s = summarise([
      reading('dial-up', 2), reading('dial-down', 4), reading('crown-up', -3),
    ]);
    expect(s!.positionalSpread).toBe(7);
  });

  it('reports the lowest amplitude', () => {
    const s = summarise([reading('dial-up', 0, 280), reading('crown-up', 0, 240)]);
    expect(s!.minAmplitude).toBe(240);
  });

  it('ignores unmeasurable amplitude rather than counting it as zero', () => {
    // The core reports 0 when it cannot determine amplitude; treating that as
    // a real reading would report a healthy watch as barely swinging.
    const s = summarise([reading('dial-up', 0, 280), reading('crown-up', 0, 0)]);
    expect(s!.minAmplitude).toBe(280);
  });

  it('reports zero amplitude only when nothing was measurable', () => {
    expect(summarise([reading('dial-up', 0, 0)])!.minAmplitude).toBe(0);
  });

  it('reports the worst beat error', () => {
    const s = summarise([reading('dial-up', 0, 270, 0.2), reading('crown-up', 0, 270, 0.9)]);
    expect(s!.maxBeatError).toBe(0.9);
  });
});

describe('sessionTitle', () => {
  it('names the session after the reference once there is one', () => {
    expect(sessionTitle('MB-0142', 'Seiko / TMI NH35')).toBe('MB-0142 — Seiko / TMI NH35');
  });

  it('falls back to Session before a reference is entered', () => {
    expect(sessionTitle('', 'Seiko / TMI NH35')).toBe('Session — Seiko / TMI NH35');
  });

  /* A field the operator half-typed into and cleared is not a reference. */
  it('treats whitespace as no reference', () => {
    expect(sessionTitle('   ', 'Seiko / TMI NH35')).toBe('Session — Seiko / TMI NH35');
  });

  it('trims a reference rather than rendering the padding', () => {
    expect(sessionTitle('  MB-0142 ', null)).toBe('MB-0142');
  });

  it('stands alone when no movement is chosen', () => {
    expect(sessionTitle('MB-0142', null)).toBe('MB-0142');
    expect(sessionTitle('', null)).toBe('Session');
  });
});

describe('runningSummary', () => {
  it('is null before anything is recorded', () => {
    expect(runningSummary([])).toBeNull();
  });

  it('averages what has been measured so far', () => {
    const s = runningSummary([reading('dial-up', 10), reading('dial-down', 20)])!;
    expect(s.count).toBe(2);
    expect(s.rate.mean).toBe(15);
    expect(s.rate.min).toBe(10);
    expect(s.rate.max).toBe(20);
  });

  /* One position cannot disagree with itself, and the display should not
     suggest otherwise. */
  it('reports no spread from a single position', () => {
    const s = runningSummary([reading('dial-up', 10)])!;
    expect(s.positionalSpread).toBe(0);
    expect(s.rate.mean).toBe(10);
  });

  it('reports the spread once there are two to compare', () => {
    const s = runningSummary([reading('dial-up', 10), reading('dial-down', 22)])!;
    expect(s.positionalSpread).toBe(12);
  });

  /* Amplitude of 0 is the core saying it could not determine it, not a
     movement that barely swings — averaging it in would halve a healthy
     reading. */
  it('leaves undetermined amplitude out of the average', () => {
    const s = runningSummary([
      reading('dial-up', 10, 260),
      reading('dial-down', 10, 0),
    ])!;
    expect(s.amplitude!.mean).toBe(260);
    expect(s.amplitude!.min).toBe(260);
  });

  it('reports no amplitude at all when none was determined', () => {
    expect(runningSummary([reading('dial-up', 10, 0)])!.amplitude).toBeNull();
  });

  it('carries the beat rate and the beat error range', () => {
    const s = runningSummary([
      reading('dial-up', 10, 260, 0.4),
      reading('dial-down', 10, 260, 1.6),
    ])!;
    expect(s.bph).toBe(21600);
    expect(s.beatError.mean).toBeCloseTo(1.0, 5);
    expect(s.beatError.max).toBe(1.6);
  });
});

describe('the average shown between positions', () => {
  /* Six positions already stored from an earlier pass over the same watch. */
  const previousRun: Reading[] = [
    reading('dial-up', 10), reading('dial-down', 12), reading('crown-down', 14),
    reading('crown-up', 16), reading('crown-left', 18), reading('crown-right', 20),
  ];

  /*
     The fault this exists to catch. A reading is replaced in place when its
     position is measured again, so a second pass begins with all six of the
     first pass's figures still in the record. Averaging the record showed a
     fresh dial-up blended with five stale positions and called it one run.
  */
  it('ignores positions the current run has not measured', () => {
    // Second pass: dial-up re-measured at 40, nothing else touched yet.
    const readings = [reading('dial-up', 40), ...previousRun.slice(1)];

    expect(runningSummary(readings)!.rate.mean).toBeCloseTo(20, 6); // the old bug
    const s = currentRunSummary(readings, ['dial-up'])!;
    expect(s.count).toBe(1);
    expect(s.rate.mean).toBe(40);
  });

  /* Restarting a run empties `recorded`, so the preview clears with it rather
     than showing the previous pass until the first new position lands. */
  it('shows nothing at the start of a fresh run', () => {
    expect(currentRunSummary(previousRun, [])).toBeNull();
  });

  it('grows as the run records each position', () => {
    const readings = [reading('dial-up', 40), reading('dial-down', 20), ...previousRun.slice(2)];
    expect(currentRunSummary(readings, ['dial-up'])!.count).toBe(1);
    const two = currentRunSummary(readings, ['dial-up', 'dial-down'])!;
    expect(two.count).toBe(2);
    expect(two.rate.mean).toBe(30);
  });

  /* Skipping a position leaves it out of `recorded`, so a figure the record
     still holds for it from an earlier pass cannot creep into the average. */
  it('leaves a skipped position out of the average', () => {
    const readings = [reading('dial-up', 40), reading('dial-down', 30), ...previousRun.slice(2)];
    const s = currentRunSummary(readings, ['dial-up'])!;
    expect(s.count).toBe(1);
    expect(s.rate.mean).toBe(40);
  });
});
