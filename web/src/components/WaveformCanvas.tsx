/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef } from 'react';

const HISTORY_FRAMES = 48_000; // roughly one second at 48 kHz

/**
 * Scrolling raw waveform. Watch ticks appear as isolated vertical spikes
 * against a flat floor; that shape is what Phase 0 is looking for.
 */
export function WaveformCanvas({ latest }: { latest: Float32Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef(new Float32Array(HISTORY_FRAMES));
  const writeIndex = useRef(0);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const context = canvasEl?.getContext('2d');

    // Colours come from the theme rather than being hardcoded, so the trace
    // reads correctly whether the operator's system is light or dark. Resolved
    // per draw, since that setting can change while measuring.
    const style = canvasEl ? getComputedStyle(canvasEl) : null;
    const line = style?.getPropertyValue('--wave-line').trim() || '#e9ebee';
    const axis = style?.getPropertyValue('--wave-axis').trim() || '#262b31';

    // No block means capture has stopped. Returning early here would leave the
    // last pre-stop frame painted, which is the frozen display this is meant
    // to avoid — clearing the state does not clear the pixels. Reset the ring
    // buffer too, or the next capture's first second draws against this one's
    // tail.
    if (!latest) {
      history.current.fill(0);
      writeIndex.current = 0;
      if (canvasEl && context) {
        const mid = canvasEl.height / 2;
        context.clearRect(0, 0, canvasEl.width, canvasEl.height);
        context.strokeStyle = axis;
        context.beginPath();
        context.moveTo(0, mid);
        context.lineTo(canvasEl.width, mid);
        context.stroke();
      }
      return;
    }

    const buf = history.current;
    for (let i = 0; i < latest.length; i++) {
      buf[writeIndex.current] = latest[i];
      writeIndex.current = (writeIndex.current + 1) % HISTORY_FRAMES;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height } = canvas;
    const mid = height / 2;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = axis;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // One column per pixel, drawn as the min/max envelope of its frames so
    // single-sample impulses cannot be missed by decimation.
    //
    // Column bounds are derived from the column index rather than from a
    // fixed stride: floor(48000 / 900) is 53, and 900 columns of 53 frames
    // cover only 47,700 of the 48,000, so the newest ~300 frames — the ones
    // that just arrived — would never be drawn.
    ctx.strokeStyle = line;
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const start = Math.round((x * HISTORY_FRAMES) / width);
      const end = Math.round(((x + 1) * HISTORY_FRAMES) / width);
      if (end <= start) continue; // canvas wider than the history buffer

      // Seeded from the first sample, not from ±1: a sample past full scale
      // is exactly what the clip indicator exists to show, and clamping the
      // envelope to ±1 would hide it.
      let min = buf[(writeIndex.current + start) % HISTORY_FRAMES];
      let max = min;
      for (let f = start + 1; f < end; f++) {
        const v = buf[(writeIndex.current + f) % HISTORY_FRAMES];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x + 0.5, mid - max * mid);
      ctx.lineTo(x + 0.5, mid - min * mid);
    }
    ctx.stroke();
  }, [latest]);

  return (
    <div
      className="panel panel--tight"
      style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="eyebrow">Waveform</span>
        <span className="dim mono" style={{ fontSize: 10 }}>1s</span>
      </div>
      <canvas
        ref={canvasRef}
        width={900}
        height={240}
        style={{ width: '100%', flex: '1 1 auto', minHeight: 0, display: 'block' }}
      />
    </div>
  );
}
