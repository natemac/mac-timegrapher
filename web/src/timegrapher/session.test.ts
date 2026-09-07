/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  sessionTitle,
  summarise,
  type PositionId,
  type Reading,
} from './session';

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

  /*
     No spread, no lowest amplitude, no greatest beat error.

     Every one of those is a range over six samples, which makes them the most
     outlier-sensitive figures it is possible to compute: one knock of the bench
     during one position sets all three and none of the averages. They were on
     the summary and were taken off it — a figure a bumped table can decide has
     no business on a document somebody signs.
  */
  it('reports averages and nothing that a single knock could set', () => {
    const s = summarise([
      reading('dial-up', 2, 280, 0.2), reading('dial-down', 6, 240, 0.8),
    ])!;
    expect(s).toEqual({ count: 2, averageRate: 4, averageAmplitude: 260, averageBeatError: 0.5 });
  });

  it('ignores unmeasurable amplitude rather than counting it as zero', () => {
    // The core reports 0 when it cannot determine amplitude; averaging that in
    // would report a healthy watch as barely swinging.
    const s = summarise([reading('dial-up', 0, 280), reading('crown-up', 0, 0)]);
    expect(s!.averageAmplitude).toBe(280);
  });

  it('reports no amplitude at all when none was measurable', () => {
    expect(summarise([reading('dial-up', 0, 0)])!.averageAmplitude).toBeNull();
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

