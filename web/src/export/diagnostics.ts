/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { Settling } from '../timegrapher/stability';

/*
   A written record of what a session actually did.

   Everything that decides whether a reading is trustworthy happens twice a
   second and is gone by the time anyone notices something is wrong. Screenshots
   catch one instant of it; this catches the run. It exists because a threshold
   was set three times tighter than the bench could hold and the only evidence
   was a photograph of a phone.

   Two streams, because the failures live in different ones. The samples say
   what the numbers were doing. The events say what the app believed and when —
   when the average was thrown away, when a reading was recorded, when it gave
   up waiting. A fault is usually the disagreement between the two.

   Bounded, because a long session should not grow without limit; the oldest
   samples are dropped rather than the newest, since the interesting part is
   almost always what just happened.
*/

/** Twice a second, so this is a little over twenty minutes. */
const MAX_SAMPLES = 2600;
const MAX_EVENTS = 400;

export interface DiagnosticSample {
  /** Seconds since capture started, as the engine counts them. */
  t: number;
  valid: boolean;
  rate: number;
  amplitude: number;
  beatError: number;
  detectedBph: number;
  signalQuality: number;
  settling: Settling;
  /** Half the peak-to-peak range over the window, or null before there is one. */
  rateSpread: number | null;
  amplitudeSpread: number | null;
  beatErrorSpread: number | null;
  /** How far the ticks stand above the room, in dB. */
  headroomDb: number | null;
  levelDb: number | null;
  clipped: boolean;
}

export interface DiagnosticEvent {
  /** Milliseconds since the log was opened. */
  at: number;
  label: string;
  detail?: string;
}

export interface DiagnosticContext {
  device: string | null;
  sampleRate: number | null;
  requestedSampleRate: number | null;
  /** Anything the browser admitted to applying to the signal. */
  processing: string[];
  movement: string | null;
  liftAngle: number | null;
  bph: number | null;
  quartz: boolean;
  mode: string;
  settledBounds: { rate: number; amplitude: number; beatError: number };
}

function fmt(n: number | null, places: number): string {
  return n === null || Number.isNaN(n) ? '' : n.toFixed(places);
}

export class DiagnosticsLog {
  private samples: DiagnosticSample[] = [];
  private events: DiagnosticEvent[] = [];
  private opened = Date.now();
  private context: DiagnosticContext | null = null;

  reset(): void {
    this.samples = [];
    this.events = [];
    this.opened = Date.now();
    this.context = null;
  }

  setContext(context: DiagnosticContext): void {
    this.context = context;
  }

  event(label: string, detail?: string): void {
    this.events.push({ at: Date.now() - this.opened, label, detail });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  sample(s: DiagnosticSample): void {
    this.samples.push(s);
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  get size(): number {
    return this.samples.length;
  }

  /**
   * Range and mean of one column over the whole log, which is what says
   * whether a bound was reachable at all. Only valid samples count — an
   * invalid one carries whatever the core last had, not a measurement.
   */
  private stat(pick: (s: DiagnosticSample) => number | null): string {
    const values = this.samples
      .filter((s) => s.valid)
      .map(pick)
      .filter((v): v is number => v !== null && !Number.isNaN(v));

    if (values.length === 0) return 'no valid samples';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return `min ${min.toFixed(2)}  max ${max.toFixed(2)}  mean ${mean.toFixed(2)}  n ${values.length}`;
  }

  toText(): string {
    const c = this.context;
    const lines: string[] = [];

    lines.push('MAC Bespoke Web Timegrapher — session diagnostics');
    lines.push(new Date().toISOString());
    lines.push('');
    /*
       Said in the file rather than only in the app, because the person
       deciding whether to pass one on is often not the person who exported it.
       It is worth being able to see at a glance what is in it.
    */
    lines.push('Contains: the audio device name, the browser version, and every');
    lines.push('reading the analysis produced. It does not contain the build');
    lines.push('number, the technician, any notes, or any audio.');
    lines.push('');

    lines.push('## Setup');
    lines.push(`device            ${c?.device ?? 'unknown'}`);
    lines.push(`sample rate       ${c?.sampleRate ?? '?'} Hz${
      c?.requestedSampleRate && c.requestedSampleRate !== c.sampleRate
        ? ` (asked for ${c.requestedSampleRate} — the browser resampled)`
        : ''
    }`);
    // The audio constraints are the first thing to check when numbers look
    // wrong: automatic gain control does not degrade amplitude, it invalidates
    // it.
    lines.push(`processing        ${c?.processing.length ? c.processing.join(', ') : 'none reported'}`);
    lines.push(`movement          ${c?.movement ?? 'not chosen'}`);
    lines.push(`lift angle        ${c?.quartz ? 'n/a — quartz' : `${c?.liftAngle ?? '?'}°`}`);
    lines.push(`beat rate         ${c?.bph ? `${c.bph} bph` : 'detected'}`);
    lines.push(`mode              ${c?.mode ?? '?'}`);
    lines.push(`settled bounds    rate ±${c?.settledBounds.rate}  amplitude ±${c?.settledBounds.amplitude}  beat ±${c?.settledBounds.beatError}`);
    lines.push(`user agent        ${typeof navigator === 'undefined' ? '?' : navigator.userAgent}`);
    lines.push('');

    lines.push('## What the spreads managed');
    lines.push('The bound has to sit above these or a reading can never settle.');
    lines.push(`rate spread       ${this.stat((s) => s.rateSpread)}`);
    lines.push(`amplitude spread  ${this.stat((s) => s.amplitudeSpread)}`);
    lines.push(`beat spread       ${this.stat((s) => s.beatErrorSpread)}`);
    lines.push('');
    lines.push('## What the readings themselves did');
    lines.push(`rate              ${this.stat((s) => s.rate)}`);
    lines.push(`amplitude         ${this.stat((s) => s.amplitude)}`);
    lines.push(`beat error        ${this.stat((s) => s.beatError)}`);
    lines.push(`headroom dB       ${this.stat((s) => s.headroomDb)}`);
    lines.push('');

    const settledFor = this.samples.filter((s) => s.settling === 'settled').length;
    lines.push(`samples           ${this.samples.length}`);
    lines.push(`settled in        ${settledFor} of them${
      settledFor === 0 ? '  <- never settled' : ''
    }`);
    lines.push('');

    lines.push('## Events');
    if (this.events.length === 0) lines.push('(none)');
    for (const e of this.events) {
      lines.push(`${(e.at / 1000).toFixed(1).padStart(8)}s  ${e.label}${e.detail ? `  ${e.detail}` : ''}`);
    }
    lines.push('');

    lines.push('## Samples');
    lines.push([
      't', 'valid', 'rate', 'amp', 'beat', 'bph', 'qual',
      'settling', 'dRate', 'dAmp', 'dBeat', 'headroom', 'level', 'clip',
    ].join('\t'));

    for (const s of this.samples) {
      lines.push([
        s.t.toFixed(1),
        s.valid ? '1' : '0',
        fmt(s.rate, 2),
        fmt(s.amplitude, 1),
        fmt(s.beatError, 2),
        String(Math.round(s.detectedBph)),
        fmt(s.signalQuality, 2),
        s.settling,
        fmt(s.rateSpread, 2),
        fmt(s.amplitudeSpread, 1),
        fmt(s.beatErrorSpread, 2),
        fmt(s.headroomDb, 1),
        fmt(s.levelDb, 1),
        s.clipped ? '1' : '0',
      ].join('\t'));
    }

    return lines.join('\n');
  }
}

export function diagnosticsFilename(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `timegrapher-diagnostics-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.txt`;
}
