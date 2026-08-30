/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './SettingsSheet';

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
    const chosen = { zoomMs: 10, traceSeconds: 60, showLogo: true };
    saveSettings(chosen);
    expect(loadSettings()).toEqual(chosen);
  });
});
