/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef } from 'react';
import type { Beat } from '../timegrapher/tg-engine';
import { PanelHead } from './PanelHead';
import type { Topic } from './guide-content';

/*
   The paper strip.

   Mechanical timegraphers printed each beat as a mark on a roll of paper
   creeping past a stylus. A watch keeping perfect time put every mark directly
   below the last; one running fast walked them sideways. The lean of the
   resulting line is the rate, and the horizontal gap between the two lines —
   tick and tock — is the beat error. A watchmaker reads a regulator adjustment
   from the slope changing, seconds before the numbers settle.

   Magnification is the whole trick, and getting it wrong makes the display
   useless rather than merely coarse. Showing a full beat period across the
   width sounds natural and is hopeless: at +10 s/day a watch drifts 3.5 ms in
   thirty seconds, against a 333 ms period, so the marks move about one percent
   of the width — two pixels, indistinguishable from vertical.

   So the strip is folded at the beat interval and shown a few milliseconds
   wide. Marks that run off one edge reappear on the other, exactly as paper
   scrolling past a stylus did.

   Time runs downward, newest at the top, the direction the paper moved.
*/

interface Props {
  beats: Beat[];
  /** Beats per hour; sets the fold interval. */
  bph: number;
  /** Milliseconds of drift spanning the full width. Smaller is more magnified. */
  zoomMs: number;
  /** Seconds of history to show. */
  windowSeconds?: number;
  capturing: boolean;
  onHelp: (t: Topic) => void;
}

/* Read from CSS custom properties so the strip follows the theme: bone on
   black in the dark, ink on paper in the light. Resolved per draw rather than
   cached, since the operator can change the system theme while measuring. */
function themeColours(el: HTMLElement) {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--trace-ink', '#e8e0cf'),
    inkFaded: v('--trace-ink-faded', 'rgba(232, 224, 207, 0.28)'),
    rule: v('--trace-rule', '#22262b'),
    ruleCentre: v('--trace-rule-centre', '#333a41'),
    dim: v('--text-dim', '#9aa2ab'),
  };
}

export function TraceCanvas({ beats, bph, zoomMs, windowSeconds = 30, capturing, onHelp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Back the canvas at device resolution: a half-pixel dot on a phone is the
    // difference between a crisp trace and a grey smear.
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 900;
    const cssHeight = canvas.clientHeight || 240;
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colour = themeColours(canvas);
    const w = cssWidth;
    const h = cssHeight;
    ctx.clearRect(0, 0, w, h);

    // Quarter rules, the centre one heavier: a watch on rate keeps its marks
    // parallel to it.
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.strokeStyle = i === 2 ? colour.ruleCentre : colour.rule;
      const x = Math.round((w * i) / 4) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    if (!capturing || beats.length === 0 || bph <= 0) {
      ctx.fillStyle = colour.dim;
      ctx.font = '12px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(capturing ? 'waiting for beats…' : 'press Start', w / 2, h / 2);
      return;
    }

    // Successive beats — tick then tock — are half an oscillation apart.
    const beatInterval = 7200 / bph / 2;
    const span = zoomMs / 1000;

    const newest = beats[beats.length - 1].time;
    const oldest = newest - windowSeconds;
    const visible = beats.filter((b) => b.time >= oldest);
    if (visible.length === 0) return;

    // Anchor on the oldest visible beat so the trace enters at the centre of
    // the bottom edge and leans away as it climbs. Without an anchor the strip
    // would slide sideways as the reference aged out of the window.
    const anchor = visible[0].time % beatInterval;

    for (const beat of visible) {
      const age = newest - beat.time;
      const y = (age / windowSeconds) * h;

      // Fold to the beat interval, then take the signed distance from the
      // anchor. A watch off rate makes this grow steadily — that is the slope.
      let delta = (beat.time % beatInterval) - anchor;
      if (delta > beatInterval / 2) delta -= beatInterval;
      if (delta < -beatInterval / 2) delta += beatInterval;

      // Wrap across the edges rather than clipping, the way paper did.
      let x = w / 2 + (delta / span) * w;
      x = ((x % w) + w) % w;

      // Older marks fade so the eye follows the current slope rather than
      // averaging over the whole strip.
      const fade = 1 - age / windowSeconds;
      ctx.fillStyle = fade > 0.75 ? colour.ink : colour.inkFaded;

      ctx.beginPath();
      ctx.arc(x, y, beat.isTick ? 1.7 : 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [beats, bph, zoomMs, windowSeconds, capturing]);

  return (
    <div
      className="panel panel--tight"
      style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <PanelHead
        label="Trace"
        topic="trace"
        onHelp={onHelp}
        right={
          <span className="dim mono" style={{ fontSize: 10 }}>
            {windowSeconds}s · {zoomMs}ms wide
          </span>
        }
      />
      {/* The canvas is the only thing that grows. */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', flex: '1 1 auto', minHeight: 0, display: 'block' }}
      />
    </div>
  );
}
