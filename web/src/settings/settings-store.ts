/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { ZOOM_AUTO } from '../timegrapher/trace-zoom';

/** Light, dark, or whatever the device is set to. */
export type Appearance = 'light' | 'dark' | 'system';

export interface Settings {
  /*
     The app was dark-only. It is not any more, and the third option is the
     default because a bench under lights and a bench at night are the same
     bench, and the device already knows which one it is.
  */
  appearance: Appearance;
  /*
     Whether to ask the browser to keep the screen lit.

     Off by default, which is the design's call rather than the engine's: a
     reading takes twenty to thirty seconds to settle with the operator's hands
     on a watch, so a phone that dims mid-measurement is a real nuisance — but
     holding a screen awake is the operator's battery, and they are the ones who
     should decide to spend it.
  */
  keepAwake: boolean;
  /*
     Whether the MAC mark appears in the header.

     Off by default. Branding is not covered by the GPL the way the code is, and
     almost nobody running this is MAC — a stranger's logo on your own bench is
     worse than no logo at all. The source offer in the footer is a licence
     obligation and is not affected by this.
  */
  showLogo: boolean;
  /** Milliseconds of drift spanning the trace width. Smaller magnifies more. */
  zoomMs: number;
  /** Seconds of history the trace shows. */
  traceSeconds: number;
  /*
     What the audio device's clock gains per day, measured against a reference.
     Zero until measured. Every rate reading is wrong by this much while it is
     left at zero — a constant offset, invisible to the spread.
  */
  clockDriftSecondsPerDay: number;
}

/* Auto magnification by default: the operator should not have to work out that
   +17 s/day over thirty seconds needs more than ten milliseconds of strip. */
export const DEFAULT_SETTINGS: Settings = {
  appearance: 'system',
  keepAwake: false,
  showLogo: false,
  zoomMs: ZOOM_AUTO,
  traceSeconds: 30,
  clockDriftSecondsPerDay: 0,
};

const STORAGE_KEY = 'mac-timegrapher.settings';

/**
 * Stored settings merged over the defaults.
 *
 * Merged rather than replaced so a preference saved before a setting existed
 * keeps working, and so turning the mark back on is done once — the stored
 * value wins over the default, which is the whole point of the default being
 * off.
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? { ...DEFAULT_SETTINGS, ...parsed }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing or a full quota. A forgotten preference is not worth
    // failing over.
  }
}

/**
 * The theme actually in force, given the preference and what the device says.
 */
export function resolveTheme(appearance: Appearance, systemPrefersDark: boolean): 'light' | 'dark' {
  if (appearance === 'system') return systemPrefersDark ? 'dark' : 'light';
  return appearance;
}

/** The address bar's colour, so it matches the page rather than fighting it. */
export const THEME_COLOUR: Record<'light' | 'dark', string> = {
  light: '#eeeae0',
  dark: '#191a18',
};

/*
   A sound card's crystal is tens to a few hundred parts per million out. Two
   hundred seconds a day is 2,300 ppm — far beyond anything real, and past it a
   typed figure is a slipped decimal point rather than a measurement. Clamped
   because this one number silently rescales every reading taken afterwards.
*/
const MAX_DRIFT = 200;

function clampDrift(value: number): number {
  return Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, value));
}

/*
   Always signed, including zero — tg writes "+0.0" in the same field, and in a
   box you can type a negative number into, a bare "0.00" reads like a value
   that has not been set rather than one deliberately at zero.
*/
export function formatDrift(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/*
   Reads what someone might actually type: "1.7", "+1.7", "-0.25", and tg's own
   display format straight off its toolbar. Returns null for anything it cannot
   make a number of, which the caller treats as "leave it alone" rather than as
   zero — zero is a real correction, and losing one without saying so would
   shift every later reading.
*/
export function parseDrift(text: string): number | null {
  const normalized = text.trim().replace(/\s*s\/?d(?:ay)?$/i, '').trim();
  /* Number.parseFloat takes a numeric prefix and discards the rest, so "1.7oops"
     became 1.7 and "1..7" became 1 — and because whitespace was stripped first,
     "1 7" became 17. This figure scales every rate reading afterwards, so a
     partial entry has to be refused rather than half-read. */
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  return clampDrift(Number(normalized));
}
