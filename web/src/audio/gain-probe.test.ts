/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { summariseBlocks, gainDifferenceDb } from './gain-probe';

const tone = (amplitude: number, n = 2048) =>
  Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin((2 * Math.PI * i) / 64));

describe('summarising a probe window', () => {
  it('reports the RMS of a sine as its amplitude less 3 dB', () => {
    const { rmsDb, peakDb } = summariseBlocks([tone(0.5)]);
    // A sine's RMS is its peak over root two, which is 3.01 dB down.
    expect(peakDb).toBeCloseTo(20 * Math.log10(0.5), 1);
    expect(rmsDb).toBeCloseTo(20 * Math.log10(0.5) - 3.01, 1);
  });

  it('averages across blocks rather than taking the last one', () => {
    const loudThenQuiet = summariseBlocks([tone(0.5), tone(0.05)]);
    const quietOnly = summariseBlocks([tone(0.05)]);
    expect(loudThenQuiet.rmsDb).toBeGreaterThan(quietOnly.rmsDb);
    // The peak belongs to the loudest sample anywhere in the run.
    expect(loudThenQuiet.peakDb).toBeCloseTo(20 * Math.log10(0.5), 1);
  });

  it('calls true silence -Infinity rather than zero dB', () => {
    const s = summariseBlocks([new Float32Array(512)]);
    expect(s.rmsDb).toBe(-Infinity);
    expect(s.peakDb).toBe(-Infinity);
  });

  it('has nothing to say about an empty run', () => {
    expect(summariseBlocks([]).rmsDb).toBe(-Infinity);
  });
});

describe('the difference the probe reports', () => {
  /*
     The number the whole probe exists for. A large positive figure means the
     platform's voice chain supplies gain that this app declines — which is how
     a pickup can be comfortable in a voice app and unusable here.
  */
  it('is how much louder processing on came out', () => {
    expect(gainDifferenceDb(-48, -26)).toBeCloseTo(22, 6);
  });

  it('is negative when our own constraints were the louder pair', () => {
    expect(gainDifferenceDb(-26, -30)).toBeCloseTo(-4, 6);
  });

  /* Silence on either side is not a 'difference of infinity'; it is a run that
     measured nothing, and reporting a number would invite reading one. */
  it('refuses to turn silence into a figure', () => {
    expect(gainDifferenceDb(-Infinity, -26)).toBe(0);
    expect(gainDifferenceDb(-48, -Infinity)).toBe(0);
  });
});
