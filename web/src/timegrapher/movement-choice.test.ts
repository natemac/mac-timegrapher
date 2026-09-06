/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MANUAL_ID, MANUAL_DEFAULTS, loadManualMovement, saveManualMovement,
  resolveMovementConfig, validateManual, movementSummary, movementBadge, movementsByMaker,
} from './movement-choice';

beforeEach(() => localStorage.clear());

describe('resolving the two numbers the engine is built from', () => {
  it('takes both from a preset', () => {
    expect(resolveMovementConfig('nh35', MANUAL_DEFAULTS))
      .toEqual({ bph: 21600, liftAngle: 53, detected: false });
  });

  it('takes both from the operator under Manual', () => {
    expect(resolveMovementConfig(MANUAL_ID, { bph: 18000, liftAngle: 44 }))
      .toEqual({ bph: 18000, liftAngle: 44, detected: false });
  });

  /*
     The point of the whole module. Automatic detects the beat rate and cannot
     detect the lift angle — nothing in the sound carries it — so it falls back
     to the manual figure rather than to a generic constant that would be
     quietly wrong for whatever is on the sensor.
  */
  it('detects the beat rate but still needs a lift angle from somewhere', () => {
    expect(resolveMovementConfig(null, { bph: 21600, liftAngle: 51 }))
      .toEqual({ bph: 0, liftAngle: 51, detected: true });
  });

  it('falls back to automatic for a stored calibre that no longer exists', () => {
    expect(resolveMovementConfig('nh99-withdrawn', MANUAL_DEFAULTS).detected).toBe(true);
  });
});

describe('what the operator typed', () => {
  it('accepts a whole beat rate and a plausible lift angle', () => {
    const judged = validateManual({ bph: '28800', liftAngle: '50' }, true);
    expect(judged.value).toEqual({ bph: 28800, liftAngle: 50 });
    expect(judged.error).toBeNull();
  });

  it('refuses a fractional beat rate rather than rounding it', () => {
    expect(validateManual({ bph: '21600.5', liftAngle: '53' }, true).value).toBeNull();
  });

  it('refuses a lift angle outside a half turn', () => {
    expect(validateManual({ bph: '21600', liftAngle: '361' }, true).badLiftAngle).toBe(true);
    expect(validateManual({ bph: '21600', liftAngle: '0' }, true).badLiftAngle).toBe(true);
  });

  /*
     Under automatic the beat rate field is not shown and not used, so a stale
     or empty value in it must not paint the panel red or block the lift angle
     — the one figure automatic genuinely needs — from being saved.
  */
  it('ignores the beat rate when the beat rate is being detected', () => {
    const judged = validateManual({ bph: '', liftAngle: '53' }, false);
    expect(judged.badBph).toBe(false);
    expect(judged.value?.liftAngle).toBe(53);
  });
});

describe('stored manual figures', () => {
  it('round-trips', () => {
    saveManualMovement({ bph: 36000, liftAngle: 38 });
    expect(loadManualMovement()).toEqual({ bph: 36000, liftAngle: 38 });
  });

  it('refuses nonsense from storage rather than measuring against it', () => {
    localStorage.setItem('mac-timegrapher.manual-movement', JSON.stringify({ bph: -1, liftAngle: 900 }));
    expect(loadManualMovement()).toEqual(MANUAL_DEFAULTS);
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('mac-timegrapher.manual-movement', 'not json');
    expect(loadManualMovement()).toEqual(MANUAL_DEFAULTS);
  });
});

describe('how the choice reads on screen', () => {
  it('names the beat rate as awaiting a signal under automatic', () => {
    expect(movementSummary(null, { bph: 21600, liftAngle: 53 }))
      .toBe('Beat Rate: Auto (awaiting signal) · Lift Angle: 53°');
  });

  it('spells out both figures for a preset', () => {
    expect(movementSummary('nh35', MANUAL_DEFAULTS))
      .toBe('Beat Rate: 21,600 bph · Lift Angle: 53°');
  });

  it('labels the toolbar badge by calibre', () => {
    expect(movementBadge('nh35', MANUAL_DEFAULTS)).toEqual({ name: 'NH35', meta: '21,600 bph · 53°' });
    expect(movementBadge(MANUAL_ID, { bph: 28800, liftAngle: 50 }).name).toBe('Manual');
    expect(movementBadge(null, MANUAL_DEFAULTS).name).toBe('Auto');
  });
});

describe('the preset list', () => {
  it('groups by maker in the order the makers first appear', () => {
    expect(movementsByMaker().map((g) => g.maker))
      .toEqual(['Seiko / TMI', 'Miyota', 'Precision', 'Sea-Gull', 'ETA', 'Sellita']);
  });

  /* A quartz movement has no escapement and no balance wheel, so there are no
     numbers for a preset to supply. See docs/updateui.md, A9. */
  it('offers nothing that has no beat rate or lift angle to give', () => {
    for (const group of movementsByMaker()) {
      for (const m of group.movements) {
        expect(m.bph).not.toBeNull();
        expect(m.liftAngle).not.toBeNull();
      }
    }
  });
});
