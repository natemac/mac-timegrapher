/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

import { describe, it, expect } from 'vitest';
import { measureLevel, toDb } from './level-meter';

function sine(amplitude: number, frames: number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = amplitude * Math.sin((2 * Math.PI * i) / frames);
  return out;
}

describe('toDb', () => {
  it('maps full scale to 0 dBFS', () => expect(toDb(1)).toBeCloseTo(0, 6));
  it('maps half scale to about -6 dBFS', () => expect(toDb(0.5)).toBeCloseTo(-6.0206, 3));
  it('maps silence to negative infinity', () => expect(toDb(0)).toBe(-Infinity));
});

describe('measureLevel', () => {
  it('reports silence as zero and -Infinity dB', () => {
    const r = measureLevel(new Float32Array(1024));
    expect(r.peak).toBe(0);
    expect(r.rms).toBe(0);
    expect(r.peakDb).toBe(-Infinity);
    expect(r.clipped).toBe(false);
  });

  it('reports the peak of a 0.5 amplitude sine', () => {
    expect(measureLevel(sine(0.5, 1024)).peak).toBeCloseTo(0.5, 3);
  });

  it('reports RMS of a sine as amplitude over root two', () => {
    // A sine's RMS is A/sqrt(2). This is the check that catches a mean-of-
    // absolute-values implementation masquerading as RMS.
    expect(measureLevel(sine(0.5, 1024)).rms).toBeCloseTo(0.5 / Math.SQRT2, 3);
  });

  it('flags clipping at full scale', () => {
    const block = new Float32Array([0.1, 1.0, -0.2]);
    expect(measureLevel(block).clipped).toBe(true);
  });

  it('flags samples beyond full scale', () => {
    expect(measureLevel(new Float32Array([0.1, -1.4])).clipped).toBe(true);
  });

  it('does not flag clipping just below full scale', () => {
    expect(measureLevel(new Float32Array([0.999, -0.999])).clipped).toBe(false);
  });

  it('returns zeroes rather than NaN for an empty block', () => {
    const r = measureLevel(new Float32Array(0));
    expect(r.rms).toBe(0);
    expect(Number.isNaN(r.rms)).toBe(false);
  });
});
