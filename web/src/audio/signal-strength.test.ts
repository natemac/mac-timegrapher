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
