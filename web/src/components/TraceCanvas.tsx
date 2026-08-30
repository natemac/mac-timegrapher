/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef } from 'react';
import type { Beat } from '../timegrapher/tg-engine';

/*
   The paper strip.

   Mechanical timegraphers printed each beat as a mark on a roll of paper
   creeping past a stylus. If the watch keeps perfect time every mark lands
   directly below the last and the trace runs straight down. If it gains, each
   beat arrives fractionally early and the marks walk sideways — the line
   leans. The steeper the lean, the further off the rate.

   That is the whole instrument in one picture, and it is why this is the
   primary display rather than the raw waveform: slope is rate, and the gap
   between the two lines is beat error. A watchmaker reads a regulator
   adjustment here within a few seconds, without looking at a number.

   Time runs downward, newest at the top, which is the direction the paper
   actually moved.
*/

interface Props {
  beats: Beat[];
  /** Beats per hour; sets how wide one sweep of the strip is. */
  bph: number;
  /** Seconds of history to show. */
  windowSeconds?: number;
  capturing: boolean;
}

/** How many beat periods wide the strip is. Two keeps tick and tock apart. */
const SWEEP_PERIODS = 2;

const INK = '#e8e0cf';        // warm bone, the colour of ink on paper tape
const INK_FADED = 'rgba(232, 224, 207, 0.28)';
const RULE = '#22262b';
const RULE_CENTRE = '#333a41';

export function TraceCanvas({ beats, bph, windowSeconds = 30, capturing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Back the canvas at device resolution: a half-pixel dot on a phone is the
    // difference between a crisp trace and a grey smear.
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 900;
    const cssHeight = canvas.clientHeight || 320;
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssWidth;
    const h = cssHeight;
    ctx.clearRect(0, 0, w, h);

    // Vertical rules mark the sweep. The centre one is the reference: a watch
    // running dead on time keeps its marks parallel to it.
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.strokeStyle = i === 2 ? RULE_CENTRE : RULE;
      const x = Math.round((w * i) / 4) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    if (!capturing || beats.length === 0 || bph <= 0) {
      ctx.fillStyle = 'rgba(154, 162, 171, 0.65)';
      ctx.font = '13px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        capturing ? 'waiting for beats…' : 'press Start',
        w / 2,
        h / 2,
      );
      return;
    }

    // One full oscillation, tick to tick, in seconds.
    const period = 7200 / bph;
    const sweep = period * SWEEP_PERIODS;

    const newest = beats[beats.length - 1].time;
    const oldest = newest - windowSeconds;

    for (const beat of beats) {
      if (beat.time < oldest) continue;

      const age = newest - beat.time;
      const y = (age / windowSeconds) * h;

      // Position within the sweep. Because the sweep is derived from the
      // *nominal* rate, a watch running fast advances a little further each
      // beat and the marks drift — that drift is the slope.
      const phase = ((beat.time % sweep) + sweep) % sweep;
      const x = (phase / sweep) * w;

      // Older marks fade, so the eye follows the current slope rather than
      // averaging over the whole strip.
      const fade = 1 - age / windowSeconds;
      ctx.fillStyle = fade > 0.75 ? INK : INK_FADED;

      // Ticks read as marks, tocks as lighter ones — the pair is what makes
      // beat error legible as the gap between two lines.
      const r = beat.isTick ? 1.6 : 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [beats, bph, windowSeconds, capturing]);

  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0 }}>Trace</h2>
        <span className="dim mono" style={{ fontSize: 12 }}>
          {windowSeconds}s · {SWEEP_PERIODS} beats wide
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 320, display: 'block' }}
      />
      <p className="dim" style={{ fontSize: 13, marginBottom: 0, marginTop: 10 }}>
        Two lines, tick and tock. Straight down means on time; leaning right
        means gaining, left means losing. The horizontal gap between the lines
        is the beat error.
      </p>
    </div>
  );
}
