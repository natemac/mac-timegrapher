/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { driftMs, resolveZoom, ZOOM_AUTO, ZOOM_STEPS } from './trace-zoom';

describe('driftMs', () => {
  it('is zero for a watch on rate', () => {
    expect(driftMs(0, 30)).toBe(0);
  });

  it('does not care which way the watch is out', () => {
    expect(driftMs(-12, 30)).toBeCloseTo(driftMs(12, 30), 10);
  });

  it('matches the arithmetic by hand', () => {
    // +16.8 s/day over 30 s is 16.8 * 30 / 86400 s = 5.83 ms.
    expect(driftMs(16.8, 30)).toBeCloseTo(5.83, 2);
  });

  it('scales with the window', () => {
    expect(driftMs(10, 60)).toBeCloseTo(2 * driftMs(10, 30), 10);
  });
});

describe('resolveZoom', () => {
  it('passes a chosen magnification through untouched', () => {
    expect(resolveZoom(20, 500, 30)).toBe(20);
  });

  it('picks the tightest magnification a near-perfect watch fits in', () => {
    expect(resolveZoom(ZOOM_AUTO, 0.5, 30)).toBe(5);
  });

  it('opens up enough for the reading that prompted this', () => {
    // +16.8 s/day drifts 5.83 ms in 30 s, which overran a 10 ms strip.
    const z = resolveZoom(ZOOM_AUTO, 16.8, 30);
    expect(z).toBeGreaterThanOrEqual(10);
    expect(driftMs(16.8, 30)).toBeLessThan(z * 0.8 + 0.001);
  });

  it('keeps the drift inside the strip across a wide range of rates', () => {
    for (const rate of [1, 5, 9.4, 16.8, 30, 60, 120]) {
      const z = resolveZoom(ZOOM_AUTO, rate, 30);
      expect(driftMs(rate, 30)).toBeLessThanOrEqual(z * 0.8 + 0.001);
    }
  });

  it('falls back to the widest step rather than failing on a wild reading', () => {
    expect(resolveZoom(ZOOM_AUTO, 100000, 30)).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1]);
  });

  it('treats a losing watch the same as a gaining one', () => {
    expect(resolveZoom(ZOOM_AUTO, -16.8, 30)).toBe(resolveZoom(ZOOM_AUTO, 16.8, 30));
  });
});
