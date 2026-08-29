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
    if (!latest) return;
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

    ctx.strokeStyle = '#262b31';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // One column per pixel, drawn as the min/max envelope of its frames so
    // single-sample impulses cannot be missed by decimation.
    const framesPerColumn = Math.max(1, Math.floor(HISTORY_FRAMES / width));
    ctx.strokeStyle = '#e9ebee';
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      let min = 1;
      let max = -1;
      for (let f = 0; f < framesPerColumn; f++) {
        const idx = (writeIndex.current + x * framesPerColumn + f) % HISTORY_FRAMES;
        const v = buf[idx];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x + 0.5, mid - max * mid);
      ctx.lineTo(x + 0.5, mid - min * mid);
    }
    ctx.stroke();
  }, [latest]);

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Waveform</h2>
      <canvas ref={canvasRef} width={900} height={220} style={{ width: '100%', height: 220 }} />
      <p className="dim" style={{ marginBottom: 0, fontSize: 13 }}>
        About one second of audio. A healthy movement shows evenly spaced
        impulse pairs.
      </p>
    </div>
  );
}
