/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { MOVEMENTS, findMovement, engineConfigFor, DEFAULT_LIFT_ANGLE } from './movements';

describe('movement presets', () => {
  it('has unique ids', () => {
    const ids = MOVEMENTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses beat rates the core recognises', () => {
    // guess_bph() snaps to this list, so a preset outside it would set a rate
    // the detector could never agree with.
    const preset = [12000, 14400, 17280, 18000, 19800, 21600, 25200, 28800, 36000, 43200, 72000];
    for (const m of MOVEMENTS) expect(preset).toContain(m.bph);
  });

  it('keeps lift angles inside the range the core accepts', () => {
    // tg_init rejects anything outside 10-90 degrees, so a bad value here
    // would fail to start capture rather than merely read oddly.
    for (const m of MOVEMENTS) {
      expect(m.liftAngle).toBeGreaterThanOrEqual(10);
      expect(m.liftAngle).toBeLessThanOrEqual(90);
    }
  });

  it('gives the whole NH family one lift angle', () => {
    // They share an escapement; a difference here would be a typo, not a fact.
    const nh = MOVEMENTS.filter((m) => m.id.startsWith('nh'));
    expect(nh.length).toBeGreaterThan(4);
    expect(new Set(nh.map((m) => m.liftAngle)).size).toBe(1);
  });

  it('finds a movement by id', () => {
    expect(findMovement('nh35')?.bph).toBe(21600);
  });

  it('returns null for an unknown or absent id', () => {
    expect(findMovement('nope')).toBeNull();
    expect(findMovement(null)).toBeNull();
  });

  it('detects the beat rate when no movement is chosen', () => {
    // bph 0 is the core's "work it out yourself".
    expect(engineConfigFor(null)).toEqual({ bph: 0, liftAngle: DEFAULT_LIFT_ANGLE });
  });

  it('pins both numbers when a movement is chosen', () => {
    expect(engineConfigFor(findMovement('nh35'))).toEqual({ bph: 21600, liftAngle: 53 });
  });
});
