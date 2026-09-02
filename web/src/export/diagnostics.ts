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
  floorDb: number | null;
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
  /** The clock correction in force, which scales every rate in the file. */
  clockDriftSecondsPerDay: number;
  /*
     Everything the browser said about the track, verbatim, plus what it says
     the device is capable of.

     Reduced summaries answer the questions we thought to ask. The reports that
     are hard to act on are the ones where a platform quietly did something
     else — chose a different audio source, ignored a constraint, or cannot
     honour one at all — and those only show up in the keys nobody predicted.
  */
  trackSettings?: Record<string, unknown> | null;
  trackCapabilities?: Record<string, unknown> | null;
  /*
     The input-gain comparison, when one has been run. It needs no watch, so it
     is often the only measurement available from a device that cannot measure
     at all — which is exactly the report that is hardest to act on otherwise.
  */
  gainProbe?: {
    offRmsDb: number;
    onRmsDb: number;
    differenceDb: number;
    secondsEach: number;
  } | null;
}

/*
   Whether the app was opened from the home screen or in a browser tab.

   The user agent cannot tell these apart — it is byte-identical either way —
   but they behave differently in exactly the ways a bug report is about. An
   installed app has no address bar, no reload and no pull-to-refresh, and it
   picks up a new deploy on its own service-worker cycle rather than when the
   page is refreshed. "It still looks the same" means something different in
   each, and without this line it cannot be told which.

   navigator.standalone is Apple's and is the signal that actually works on
   iOS; the media query is the standard one everywhere else. The arguments
   default to the real globals and exist so this can be tested without
   stubbing them.
*/
export function launchedAs(
  standalone: boolean | undefined =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { standalone?: boolean }).standalone,
  matchMedia: ((query: string) => { matches: boolean }) | undefined =
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? undefined
      : (query: string) => window.matchMedia(query),
): string {
  if (standalone) return 'installed app (home screen)';
  if (matchMedia) {
    for (const mode of ['standalone', 'fullscreen', 'minimal-ui'] as const) {
      if (matchMedia(`(display-mode: ${mode})`).matches) return `installed app (${mode})`;
    }
  }
  // Also what a browser too old to report either looks like, which is fine:
  // a browser that old is a browser tab.
  return 'browser tab';
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
  /*
     `validOnly` is the default because a rate or amplitude from a sample the
     core rejected is not a reading of anything.

     The signal figures are the exception, and the reason is the case they
     exist for: an input too weak to lock onto produces no valid samples at
     all, so filtering by validity blanked out the level and floor in exactly
     the situation they were added to explain. What the microphone was
     delivering is a fact whether or not the analysis could use it.
  */
  private stat(
    pick: (s: DiagnosticSample) => number | null,
    validOnly = true,
  ): string {
    const values = this.samples
      .filter((s) => (validOnly ? s.valid : true))
      .map(pick)
      .filter((v): v is number => v !== null && !Number.isNaN(v) && Number.isFinite(v));

    if (values.length === 0) return validOnly ? 'no valid samples' : 'nothing recorded';
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
    lines.push('Contains: the audio device name and what the browser reported');
    lines.push('about it, the browser version and how it was launched, and every');
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
    /* Rate figures below are scaled by this, so a log is only comparable with
       another once both are known. */
    lines.push(`clock correction  ${
      c?.clockDriftSecondsPerDay
        ? `${c.clockDriftSecondsPerDay > 0 ? '+' : ''}${c.clockDriftSecondsPerDay.toFixed(2)} s/day`
        : 'none — rate is uncorrected for sound-card clock error'
    }`);
    lines.push(`settled bounds    rate ±${c?.settledBounds.rate}  amplitude ±${c?.settledBounds.amplitude}  beat ±${c?.settledBounds.beatError}`);
    lines.push(`user agent        ${typeof navigator === 'undefined' ? '?' : navigator.userAgent}`);
    lines.push(`launched as       ${launchedAs()}`);
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
    /* Over every sample, valid or not — see stat(). */
    lines.push(`headroom dB       ${this.stat((s) => s.headroomDb, false)}`);
    /* Level and floor separately, not just their difference. A signal too
       small to lock onto and one buried in noise both show poor headroom, and
       only the absolute pair says which — a quiet floor under a quiet tick is
       a gain problem, a loud floor is not. */
    lines.push(`level dBFS        ${this.stat((s) => s.levelDb, false)}`);
    lines.push(`noise floor dBFS  ${this.stat((s) => s.floorDb, false)}`);
    lines.push('');

    const settledFor = this.samples.filter((s) => s.settling === 'settled').length;
    lines.push(`samples           ${this.samples.length}`);
    lines.push(`settled in        ${settledFor} of them${
      settledFor === 0 ? '  <- never settled' : ''
    }`);
    lines.push('');

    /* Verbatim, because the useful key is the one nobody predicted. */
    const dump = (label: string, value: Record<string, unknown> | null | undefined) => {
      lines.push(`## ${label}`);
      if (!value || Object.keys(value).length === 0) {
        lines.push('(the browser reported none)');
      } else {
        for (const key of Object.keys(value).sort()) {
          lines.push(`${key.padEnd(22)}${JSON.stringify(value[key])}`);
        }
      }
      lines.push('');
    };
    if (c?.gainProbe) {
      const g = c.gainProbe;
      const n = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} dBFS` : 'silent');
      lines.push('## Input gain, processing off against on');
      lines.push(`same microphone, ${g.secondsEach}s each, same room`);
      lines.push(`processing off        ${n(g.offRmsDb)}   <- what this app asks for`);
      lines.push(`processing on         ${n(g.onRmsDb)}`);
      lines.push(`difference            ${g.differenceDb > 0 ? '+' : ''}${g.differenceDb.toFixed(1)} dB`);
      lines.push('');
    }

    dump('Audio track, as granted', c?.trackSettings);
    dump('Audio track, what the device can do', c?.trackCapabilities);

    lines.push('## Events');
    if (this.events.length === 0) lines.push('(none)');
    for (const e of this.events) {
      lines.push(`${(e.at / 1000).toFixed(1).padStart(8)}s  ${e.label}${e.detail ? `  ${e.detail}` : ''}`);
    }
    lines.push('');

    lines.push('## Samples');
    lines.push([
      't', 'valid', 'rate', 'amp', 'beat', 'bph', 'qual',
      'settling', 'dRate', 'dAmp', 'dBeat', 'headroom', 'level', 'floor', 'clip',
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
        fmt(s.floorDb, 1),
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
