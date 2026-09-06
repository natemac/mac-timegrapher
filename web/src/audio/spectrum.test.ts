/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { bandLevelDb, BandAverager, VOICE_BAND, TICK_BAND } from './spectrum';

/** 4096-point analyser at 48 kHz: 2048 bins, 11.7 Hz apart. */
const SAMPLE_RATE = 48_000;
const FFT = 4096;

function bins(fill: (hz: number) => number): Float32Array {
  const out = new Float32Array(FFT / 2);
  for (let i = 0; i < out.length; i++) out[i] = fill((i * SAMPLE_RATE) / FFT);
  return out;
}

describe('band levels', () => {
  it('averages the bins that fall inside the band', () => {
    const flat = bins(() => -40);
    expect(bandLevelDb(flat, SAMPLE_RATE, FFT, 500, 2000)).toBeCloseTo(-40, 6);
  });

  it('separates a band that is loud from one that is not', () => {
    const stepped = bins((hz) => (hz < 4000 ? -40 : -95));
    expect(bandLevelDb(stepped, SAMPLE_RATE, FFT, VOICE_BAND.from, VOICE_BAND.to)).toBeCloseTo(-40, 1);
    expect(bandLevelDb(stepped, SAMPLE_RATE, FFT, TICK_BAND.from, TICK_BAND.to)).toBeCloseTo(-95, 1);
  });

  /* The analyser writes -Infinity into empty bins. Averaging those in would
     drag a whole band to -Infinity on the strength of one silent bin. */
  it('skips empty bins rather than being poisoned by them', () => {
    const patchy = bins((hz) => (Math.round(hz / (SAMPLE_RATE / FFT)) % 2 === 0 ? -50 : -Infinity));
    expect(bandLevelDb(patchy, SAMPLE_RATE, FFT, 500, 2000)).toBeCloseTo(-50, 6);
  });

  it('returns negative infinity for a band with nothing in it', () => {
    const empty = bins(() => -Infinity);
    expect(bandLevelDb(empty, SAMPLE_RATE, FFT, 500, 2000)).toBe(-Infinity);
  });

  it('returns negative infinity for a band entirely above Nyquist', () => {
    const flat = bins(() => -40);
    expect(bandLevelDb(flat, SAMPLE_RATE, FFT, 30_000, 40_000)).toBe(-Infinity);
  });
});

describe('averaging a band over a window', () => {
  it('takes the mean of what it was given', () => {
    const a = new BandAverager();
    a.add('tick', -40);
    a.add('tick', -60);
    expect(a.mean('tick')).toBeCloseTo(-50, 6);
  });

  it('ignores empty readings instead of counting them as silence', () => {
    const a = new BandAverager();
    a.add('tick', -40);
    a.add('tick', -Infinity);
    expect(a.mean('tick')).toBeCloseTo(-40, 6);
  });

  it('reports nothing for a band it never saw', () => {
    expect(new BandAverager().mean('tick')).toBe(-Infinity);
  });
});
