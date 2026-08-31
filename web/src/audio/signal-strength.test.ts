/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { SignalMeter } from './signal-strength';

const DT = 2048 / 48000; // one capture block

function block(fill: (i: number) => number, n = 2048): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fill(i);
  return out;
}

const silence = () => block(() => 0);
const steady = (a: number) => block((i) => a * Math.sin((2 * Math.PI * i) / 64));

/** A tick: one short burst, then quiet. This is the shape that made the raw meter thrash. */
const impulse = (a: number, floor: number) =>
  block((i) => (i < 100 ? a * Math.sin(i / 3) : floor * (Math.random() * 2 - 1)));

describe('SignalMeter ballistics', () => {
  it('reads silence as no signal', () => {
    const m = new SignalMeter();
    expect(m.push(silence(), DT).strength).toBe('none');
  });

  it('rises quickly on a transient', () => {
    const m = new SignalMeter();
    const after = m.push(steady(0.5), DT);
    // Attack is 10 ms against a ~43 ms block, so most of the way in one block.
    expect(after.level).toBeGreaterThan(0.3);
  });

  it('falls slowly, so the bar does not flicker between ticks', () => {
    const m = new SignalMeter();
    m.push(steady(0.8), DT);
    const afterOneQuietBlock = m.push(silence(), DT).level;
    // Release is 350 ms: one 43 ms block of quiet must barely move it.
    expect(afterOneQuietBlock).toBeGreaterThan(0.4);
  });

  it('holds the peak marker above the falling level', () => {
    const m = new SignalMeter();
    m.push(steady(0.9), DT);
    const s = m.push(silence(), DT);
    expect(s.peakHold).toBeGreaterThan(s.level);
  });

  it('latches clipping so a single clipped block is still reported', () => {
    const m = new SignalMeter();
    m.push(block((i) => (i === 0 ? 1.2 : 0.1)), DT);
    // Still flagged several blocks later.
    let s = m.push(steady(0.1), DT);
    s = m.push(steady(0.1), DT);
    expect(s.clipped).toBe(true);
  });

  it('rates a tick standing well clear of the floor as strong', () => {
    const m = new SignalMeter();
    let s = m.push(silence(), DT);
    for (let i = 0; i < 40; i++) s = m.push(impulse(0.6, 0.002), DT);
    expect(['good', 'excellent']).toContain(s.strength);
  });

  it('rates a tick barely above the floor as weak', () => {
    const m = new SignalMeter();
    let s = m.push(silence(), DT);
    // Peaks only a shade above a loud floor: the detector has little to use.
    for (let i = 0; i < 40; i++) s = m.push(impulse(0.22, 0.15), DT);
    expect(['weak', 'fair']).toContain(s.strength);
  });

  it('reports no signal for input below the noise floor', () => {
    const m = new SignalMeter();
    let s = m.push(silence(), DT);
    for (let i = 0; i < 10; i++) s = m.push(steady(0.00002), DT);
    expect(s.strength).toBe('none');
  });
});

describe('an input close to full scale', () => {
  /* Peak levels from three exports on the same pickup: a MacBook at -1.1 dBFS
     against an iPad at -6.3 and an iPhone at -7.5. The threshold has to
     separate them, and with room to spare on both sides. */
  const at = (dbfs: number) => {
    const meter = new SignalMeter();
    const amplitude = Math.pow(10, dbfs / 20);
    const block = new Float32Array(512);
    let state = meter.push(block, 0.01);
    // Long enough for the fast attack to reach the level.
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < block.length; j++) block[j] = j % 64 === 0 ? amplitude : amplitude * 0.01;
      state = meter.push(block, 0.01);
    }
    return state;
  };

  it('is flagged hot where a laptop sat', () => {
    expect(at(-1.1).hot).toBe(true);
  });

  it('is not flagged where the iOS devices sat', () => {
    expect(at(-6.3).hot).toBe(false);
    expect(at(-7.5).hot).toBe(false);
  });

  /* Hot is about headroom before clipping; strength is about the tick standing
     clear of the room. The MacBook had excellent headroom AND was a decibel
     from clipping, so folding one into the other would have hidden it. */
  it('is independent of how well the ticks stand out', () => {
    const s = at(-1.1);
    expect(s.hot).toBe(true);
    // A healthy tier, not a poor one: the point is that a signal can be
    // standing clear of the room AND about to clip at the same time, which is
    // exactly what the MacBook did — 26 to 32 dB of headroom at -1.1 dBFS.
    expect(['good', 'excellent']).toContain(s.strength);
  });

  it('is false when there is no signal at all', () => {
    expect(new SignalMeter().push(new Float32Array(512), 0.01).hot).toBe(false);
  });
});
