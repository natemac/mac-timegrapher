/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/** The magnifications offered, in milliseconds of drift across the strip. */
export const ZOOM_STEPS = [5, 10, 20, 50, 100] as const;

/** Stored as 0, because "pick for me" is not a number of milliseconds. */
export const ZOOM_AUTO = 0;

/**
 * How far a watch at this rate drifts over the visible window, in
 * milliseconds. A day is 86,400 seconds, so a watch off by `rate` seconds a
 * day is off by rate/86.4 milliseconds per second of observation.
 */
export function driftMs(rate: number, windowSeconds: number): number {
  return (Math.abs(rate) * windowSeconds) / 86.4;
}

/**
 * The magnification to actually draw at.
 *
 * Auto picks the smallest step the drift still fits inside, so the trace leans
 * as steeply as it can while staying on the strip. Without it the operator has
 * to work out that +17 s/day over thirty seconds needs more than ten
 * milliseconds of width — which is exactly the arithmetic the display exists
 * to save them.
 *
 * The 0.8 leaves room for the beat-error gap between the two lines and for the
 * rate wandering while it settles.
 */
export function resolveZoom(setting: number, rate: number, windowSeconds: number): number {
  if (setting !== ZOOM_AUTO) return setting;
  const needed = driftMs(rate, windowSeconds) / 0.8;
  return ZOOM_STEPS.find((s) => s >= needed) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
}
