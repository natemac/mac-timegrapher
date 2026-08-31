/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef } from 'react';
import type { BeatWaveform } from '../timegrapher/tg-engine';
import { amplitudeMsBefore, msBeforeToAmplitude } from '../timegrapher/amplitude-scale';

/*
   The beat itself, averaged over the analysis window and drawn twice: once
   around the tick, once around the tock.

   Rate, amplitude and beat error each collapse the whole escapement into one
   number. This does not. The three impacts of a beat — the unlocking, the
   impulse and the drop — arrive as separate bursts a few milliseconds apart,
   and their shape is diagnostic in a way no single figure is: a chipped pallet
   stone smears the impulse, a poor lock buries it in the unlocking, rebanking
   puts a fourth burst where nothing should be. Every one of those reads as
   normal to the numbers.

   Two rulers, because the horizontal axis means two things at once. Below, the
   time before the beat in milliseconds. Above, that same position read as
   amplitude: the swing is recovered from how long before the impact the
   unlocking happened, so the impulse marker landing under "250" IS the
   amplitude — the number in the readings is this position, measured.

   The scales are shared by both curves rather than repeated under each, which
   costs half the height upstream spends and makes the two directly comparable.
   Tick and tock should look alike; when they do not, the escapement is not
   symmetrical.
*/

/*
   Amplitude gridlines, in degrees. Ticked every 50, ruled and labelled every
   100 — the arcsine crowds the high end together, and at phone width three
   digits every 50 collide and get silently dropped, which reads as a bug.
   Fifty is fine enough to place an impulse by eye; the exact figure is in the
   readings.
*/
const DEG_TICK = 50;
const DEG_LABEL = 100;
const DEG_MAX = 360;

/*
   The core scales the envelope so the tallest feature of the whole beat reads
   0.4 — output_panel.c's headroom factor, kept so the curve has the same
   proportions here as in the GTK panel. Dividing by it maps the peak to 1.
*/
const FULL_SCALE = 0.4;

const LABEL_ROW = 15;
const PANEL_GAP = 8;

interface Props {
  waveform: BeatWaveform | null;
  /** Degrees. The amplitude ruler is a function of it — no lift angle, no ruler. */
  liftAngle: number;
  capturing: boolean;
}

function themeColours(el: HTMLElement) {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--trace-ink', '#e8e0cf'),
    inkFaded: v('--trace-ink-faded', 'rgba(232, 224, 207, 0.28)'),
    rule: v('--trace-rule', '#22262b'),
    ruleCentre: v('--trace-rule-centre', '#333a41'),
    dim: v('--text-dim', '#9aa2ab'),
    faint: v('--text-faint', '#656d76'),
    mark: v('--ok', '#4ea87a'),
  };
}

export function BeatCanvas({ waveform, liftAngle, capturing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Device resolution, or the millisecond rules come out as a grey wash.
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 900;
    const cssHeight = canvas.clientHeight || 240;
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const c = themeColours(canvas);
    const w = cssWidth;
    const h = cssHeight;
    ctx.clearRect(0, 0, w, h);

    const msBefore = waveform?.msBefore ?? 25;
    const msAfter = waveform?.msAfter ?? 10;
    const span = msBefore + msAfter;
    /* Milliseconds before the beat to a pixel column. The beat itself sits at
       msBefore, and everything of interest is to its left. */
    const xOf = (before: number) => ((msBefore - before) * w) / span;

    const plotTop = LABEL_ROW;
    const plotBottom = h - LABEL_ROW;
    const plotHeight = plotBottom - plotTop;
    const panelHeight = (plotHeight - PANEL_GAP) / 2;

    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.lineWidth = 1;

    // Millisecond rules, one per ms, every fifth heavier and labelled.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let ms = -Math.round(msBefore); ms <= Math.round(msAfter); ms++) {
      const major = ms % 5 === 0;
      const x = Math.round(xOf(-ms)) + 0.5;
      ctx.strokeStyle = major ? c.ruleCentre : c.rule;
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = c.faint;
        ctx.fillText(String(ms), x, plotBottom + 3);
      }
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = c.dim;
    ctx.fillText('ms', w - 2, plotBottom + 3);

    /* The amplitude ruler needs a period, which only a converged reading has.
       Before then the millisecond scale stands on its own. */
    const period = waveform?.periodSeconds ?? 0;
    if (period > 0 && liftAngle > 0) {
      ctx.textBaseline = 'bottom';
      let lastLabelRight = 0;
      for (let deg = DEG_TICK; deg <= DEG_MAX; deg += DEG_TICK) {
        const at = amplitudeMsBefore(liftAngle, deg, period);
        if (at === null || at > msBefore) continue;
        const x = Math.round(xOf(at)) + 0.5;

        /* Dashed, and solid for time. The two rulers share one axis and mean
           different things, so they cannot look alike — ruled the same way
           they read as one scale with a broken interval. */
        ctx.strokeStyle = c.ruleCentre;
        ctx.beginPath();
        if (deg % DEG_LABEL === 0) {
          ctx.setLineDash([2, 4]);
          ctx.moveTo(x, plotTop);
          ctx.lineTo(x, plotBottom);
        } else {
          ctx.moveTo(x, plotTop);
          ctx.lineTo(x, plotTop + 5);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        if (deg % DEG_LABEL !== 0) continue;
        // A backstop for a very narrow canvas: better a missing label than
        // two written over each other.
        const label = String(deg);
        const width = ctx.measureText(label).width;
        if (x - width / 2 <= lastLabelRight) continue;
        ctx.textAlign = 'center';
        ctx.fillStyle = c.faint;
        ctx.fillText(label, x, plotTop - 3);
        lastLabelRight = x + width / 2 + 4;
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = c.dim;
      ctx.fillText('°', w - 2, plotTop - 3);
    }

    if (!capturing || !waveform) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.dim;
      ctx.fillText(capturing ? 'Listening for the beat…' : 'Not measuring', w / 2, h / 2);
      return;
    }

    const drawPanel = (
      values: Float32Array,
      pulseMs: number | null,
      name: string,
      top: number,
    ) => {
      const mid = top + panelHeight / 2;
      const reach = panelHeight / 2 - 1;

      ctx.strokeStyle = c.rule;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(mid) + 0.5);
      ctx.lineTo(w, Math.round(mid) + 0.5);
      ctx.stroke();

      /* Mirrored about the centre line and filled, as draw_graph() does it:
         out along the top, back along the bottom, one closed shape. The
         envelope is one-sided — mirroring is what makes it read as a
         waveform rather than a row of bumps. */
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = (i * w) / (values.length - 1);
        const y = mid - (values[i] / FULL_SCALE) * reach;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = values.length - 1; i >= 0; i--) {
        const x = (i * w) / (values.length - 1);
        ctx.lineTo(x, mid + (values[i] / FULL_SCALE) * reach);
      }
      ctx.closePath();
      ctx.fillStyle = c.inkFaded;
      ctx.fill();
      ctx.strokeStyle = c.ink;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = c.dim;
      ctx.fillText(name, 3, top + 2);

      if (pulseMs === null) return;
      // The impulse. Where it falls on the degrees ruler above is this half
      // of the beat's own amplitude, which the single reading averages away.
      const x = Math.round(xOf(pulseMs)) + 0.5;
      ctx.strokeStyle = c.mark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + panelHeight);
      ctx.stroke();
      ctx.lineWidth = 1;

      const amplitude = msBeforeToAmplitude(liftAngle, pulseMs, waveform.periodSeconds);
      if (amplitude === null) return;
      const label = `${Math.round(amplitude)}°`;
      ctx.fillStyle = c.mark;
      // Flip to the left of the marker when the label would run off the edge.
      const room = w - x - 4 > ctx.measureText(label).width;
      ctx.textAlign = room ? 'left' : 'right';
      ctx.fillText(label, room ? x + 4 : x - 4, top + 2);
    };

    drawPanel(waveform.tic, waveform.ticPulseMs, 'TICK', plotTop);
    drawPanel(waveform.toc, waveform.tocPulseMs, 'TOCK', plotTop + panelHeight + PANEL_GAP);
  }, [waveform, liftAngle, capturing]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', flex: '1 1 auto', minHeight: 0, display: 'block' }}
    />
  );
}
