/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MOVEMENTS, findMovement, engineConfigFor, isQuartz, DEFAULT_LIFT_ANGLE,
  DEFAULT_MOVEMENT_ID, AUTO_MOVEMENT_ID, loadMovementId, saveMovementId,
} from './movements';

const mechanical = MOVEMENTS.filter((m) => !isQuartz(m));
const quartz = MOVEMENTS.filter(isQuartz);

describe('movement presets', () => {
  it('has unique ids', () => {
    const ids = MOVEMENTS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses beat rates the core recognises', () => {
    // guess_bph() snaps to this list, so a preset outside it would set a rate
    // the detector could never agree with.
    const preset = [12000, 14400, 17280, 18000, 19800, 21600, 25200, 28800, 36000, 43200, 72000];
    for (const m of mechanical) expect(preset).toContain(m.bph);
  });

  it('keeps lift angles inside the range the core accepts', () => {
    // tg_init rejects anything outside 10-90 degrees, so a bad value here
    // would fail to start capture rather than merely read oddly.
    for (const m of mechanical) {
      expect(m.liftAngle).toBeGreaterThanOrEqual(10);
      expect(m.liftAngle).toBeLessThanOrEqual(90);
    }
  });

  /*
     The NH3x and NH7x share an escapement, so a difference inside those groups
     would be a typo. The NH0x is a genuinely different figure, which is why
     this is not one assertion over every id beginning "nh" — an earlier version
     was, and it was asserting something untrue.
  */
  it('gives each NH group its own consistent lift angle', () => {
    const angles = (prefix: string) =>
      new Set(MOVEMENTS.filter((m) => m.id.startsWith(prefix)).map((m) => m.liftAngle));

    expect(angles('nh3')).toEqual(new Set([53]));
    expect(angles('nh7')).toEqual(new Set([53]));
    expect(angles('nh0')).toEqual(new Set([52]));
  });

  it('flags the angles that have not been confirmed', () => {
    const unverified = MOVEMENTS.filter((m) => !m.liftAngleVerified).map((m) => m.id);
    expect(unverified).toEqual(['pt5404', 'st2130']);
  });

  it('finds a movement by id', () => {
    expect(findMovement('nh35')?.bph).toBe(21600);
  });

  it('returns null for an unknown or absent id', () => {
    expect(findMovement('nope')).toBeNull();
    expect(findMovement(null)).toBeNull();
  });
});

describe('quartz presets', () => {
  it('are listed', () => {
    expect(quartz.map((m) => m.id)).toEqual(
      ['vk61', 'vk63', 'vk64', 'vk67', 'vk68', 'vk73', 'vh31'],
    );
  });

  /*
     A stepper motor has no balance wheel, so amplitude and beat error are not
     unknown here — they do not exist. null rather than 0 is the difference
     between "no such quantity" and "a movement that barely swings".
  */
  it('claim neither a lift angle nor a beat rate', () => {
    for (const m of quartz) {
      expect(m.liftAngle).toBeNull();
      expect(m.bph).toBeNull();
    }
  });

  it('are what isQuartz recognises, and nothing else', () => {
    expect(quartz.every(isQuartz)).toBe(true);
    expect(mechanical.some(isQuartz)).toBe(false);
    expect(isQuartz(null)).toBe(false);
  });
});

describe('engineConfigFor', () => {
  it('detects the beat rate when no movement is chosen', () => {
    // bph 0 is the core's "work it out yourself".
    expect(engineConfigFor(null)).toEqual({ bph: 0, liftAngle: DEFAULT_LIFT_ANGLE });
  });

  it('pins both numbers when a mechanical movement is chosen', () => {
    expect(engineConfigFor(findMovement('nh35'))).toEqual({ bph: 21600, liftAngle: 53 });
  });

  /*
     The core cannot be handed a null. A quartz preset falls back to detection
     and tg's default angle — the angle goes unused, because the app withholds
     amplitude for quartz rather than deriving it from a number that means
     nothing.
  */
  it('falls back rather than passing null to the core', () => {
    expect(engineConfigFor(findMovement('vk63')))
      .toEqual({ bph: 0, liftAngle: DEFAULT_LIFT_ANGLE });
  });
});

describe('the bench figures', () => {
  /* Transcribed from the bench's own table; pinned so a later edit is a
     deliberate act rather than a slip. */
  const EXPECTED: Record<string, number> = {
    nh05: 52, nh06: 52,
    nh34: 53, nh35: 53, nh36: 53, nh37: 53, nh38: 53, nh39: 53,
    nh70: 53, nh71: 53, nh72: 53,
    miyota8215: 49, miyota8205: 49, miyota9015: 51,
    pt5000: 50, pt5404: 50, st2130: 50,
  };

  it.each(Object.entries(EXPECTED))('%s lifts at %i degrees', (id, angle) => {
    expect(findMovement(id)?.liftAngle).toBe(angle);
  });

  it('has the Miyota 9015 at the higher beat rate', () => {
    expect(findMovement('miyota9015')?.bph).toBe(28800);
    expect(findMovement('miyota8215')?.bph).toBe(21600);
  });
});

describe('which calibre a bench starts on', () => {
  beforeEach(() => localStorage.clear());

  /*
     Automatic detection sounds like the safer default and is not. It finds the
     beat rate but cannot find the lift angle — that is escapement geometry, not
     something you can hear — so amplitude falls back to a generic figure and is
     quietly wrong for whatever is on the sensor. A named calibre is at least
     wrong in a way you can see and correct.
  */
  it('is a real calibre rather than automatic detection', () => {
    expect(loadMovementId()).toBe(DEFAULT_MOVEMENT_ID);
    expect(findMovement(DEFAULT_MOVEMENT_ID)).toBeTruthy();
    expect(findMovement(DEFAULT_MOVEMENT_ID)?.liftAngle).toBeGreaterThan(0);
  });

  it('remembers a chosen calibre', () => {
    saveMovementId('eta2824');
    expect(loadMovementId()).toBe('eta2824');
  });

  /*
     The regression this exists to catch. Automatic used to be stored by
     removing the key, which made "I chose automatic" and "I have never chosen"
     the same state — so introducing a default would silently overwrite a
     deliberate choice on the next reload.
  */
  it('keeps automatic detection when it was chosen on purpose', () => {
    saveMovementId(null);
    expect(localStorage.getItem('mac-timegrapher.movement')).toBe(AUTO_MOVEMENT_ID);
    expect(loadMovementId()).toBeNull();
  });

  it('survives storage being unavailable', () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('denied'); };
    try {
      expect(loadMovementId()).toBe(DEFAULT_MOVEMENT_ID);
    } finally {
      Storage.prototype.getItem = real;
    }
  });
});
