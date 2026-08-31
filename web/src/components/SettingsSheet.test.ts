/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, parseDrift, formatDrift } from './SettingsSheet';

beforeEach(() => localStorage.clear());

describe('the MAC mark', () => {
  /*
     A deliberate product decision, not an oversight: almost nobody running
     this is MAC, and a stranger's logo on your own timing certificate is worse
     than no logo. Pinned so it cannot be flipped back by accident.
  */
  it('is off for someone arriving for the first time', () => {
    expect(DEFAULT_SETTINGS.showLogo).toBe(false);
    expect(loadSettings().showLogo).toBe(false);
  });

  it('stays on once turned on, so it is turned on once', () => {
    saveSettings({ ...DEFAULT_SETTINGS, showLogo: true });
    expect(loadSettings().showLogo).toBe(true);
  });
});

describe('loadSettings', () => {
  it('keeps a preference saved before a setting existed', () => {
    localStorage.setItem('mac-timegrapher.settings', JSON.stringify({ traceSeconds: 60 }));
    const loaded = loadSettings();
    expect(loaded.traceSeconds).toBe(60);
    expect(loaded.showLogo).toBe(DEFAULT_SETTINGS.showLogo);
    expect(loaded.zoomMs).toBe(DEFAULT_SETTINGS.zoomMs);
  });

  it('falls back rather than throwing on unreadable storage', () => {
    localStorage.setItem('mac-timegrapher.settings', 'not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores a stored value that is not an object', () => {
    localStorage.setItem('mac-timegrapher.settings', '42');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips every setting', () => {
    const chosen = { zoomMs: 10, traceSeconds: 60, showLogo: true, clockDriftSecondsPerDay: 4.32 };
    saveSettings(chosen);
    expect(loadSettings()).toEqual(chosen);
  });
});

describe('the audio clock correction, typed by hand', () => {
  /*
     tg prints its calibration on the toolbar as a signed figure in seconds per
     day, and applies it as sample_rate = nominal * (1 + cal / 86400) — the
     same formula and the same sign as correctedSampleRate() here. So tg's
     number can be typed straight into this field and mean the same thing.
     These pin the formats someone would copy across.
  */
  it('reads what tg puts on its toolbar', () => {
    expect(parseDrift('+1.7')).toBe(1.7);
    expect(parseDrift('-1.7')).toBe(-1.7);
    expect(parseDrift('+0.0')).toBe(0);
    expect(parseDrift('4.66')).toBeCloseTo(4.66, 10);
  });

  it('tolerates the unit being typed along with it', () => {
    expect(parseDrift('1.7 s/d')).toBe(1.7);
    expect(parseDrift('1.7 s/day')).toBe(1.7);
    expect(parseDrift(' 1.7 ')).toBe(1.7);
  });

  /*
     Zero is a real correction — it means "measured, and this device is good".
     Treating an unreadable entry as zero would throw away a real correction
     without saying so, and every reading afterwards would be shifted with no
     sign that anything happened. null means "leave it alone".
  */
  it('refuses an unreadable entry rather than calling it zero', () => {
    expect(parseDrift('')).toBeNull();
    expect(parseDrift('abc')).toBeNull();
    expect(parseDrift('-')).toBeNull();
    expect(parseDrift('+')).toBeNull();
    // But an explicit zero is kept.
    expect(parseDrift('0')).toBe(0);
  });

  /*
     A slipped decimal point is the failure that matters: 170 instead of 1.7
     rescales every reading by two parts per thousand and looks like nothing.
     Two hundred s/day is 2,300 ppm, far beyond any real crystal.
  */
  it('clamps a figure no sound card could produce', () => {
    expect(parseDrift('5000')).toBe(200);
    expect(parseDrift('-5000')).toBe(-200);
    expect(parseDrift('200')).toBe(200);
  });

  /* Signed even at zero, as tg writes it: in a field that accepts a negative
     number, a bare "0.00" reads as unset rather than as deliberately zero. */
  it('always shows a sign, including at zero', () => {
    expect(formatDrift(0)).toBe('+0.00');
    expect(formatDrift(1.7)).toBe('+1.70');
    expect(formatDrift(-1.7)).toBe('-1.70');
  });

  /* The round trip has to hold, or opening the sheet would edit the value. */
  it('survives being formatted and read back', () => {
    for (const v of [0, 1.7, -1.7, 12.34, -0.25]) {
      expect(parseDrift(formatDrift(v))).toBeCloseTo(v, 10);
    }
  });
});
