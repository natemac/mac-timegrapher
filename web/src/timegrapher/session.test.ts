/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { summarise, sessionTitle, type Reading, type PositionId } from './session';

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
