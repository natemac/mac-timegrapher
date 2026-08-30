/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   A multi-position session.

   One reading tells you whether a watch is fast. Six tell you why. A movement
   that is perfect dial up and terrible crown down has a poising or pivot
   problem; one that is uniformly fast just needs the regulator moving. The
   spread between positions is the number that separates those two cases, and
   it is the reason a bench measures more than once.

   Kept in local storage so closing the tab mid-session — or a phone deciding
   to reload the page — does not throw away twenty minutes of work.
*/

export const POSITIONS = [
  { id: 'dial-up', name: 'Dial up', short: 'DU' },
  { id: 'dial-down', name: 'Dial down', short: 'DD' },
  { id: 'crown-up', name: 'Crown up', short: 'CU' },
  { id: 'crown-down', name: 'Crown down', short: 'CD' },
  { id: 'crown-left', name: '12 up', short: '12U' },
  { id: 'crown-right', name: '6 up', short: '6U' },
] as const;

export type PositionId = (typeof POSITIONS)[number]['id'];

/*
   When a reading was taken relative to the work.

   A single set of numbers says what a watch does. Two sets say what was done
   to it — and that is the more useful document, because "it now runs at +2"
   means little without "it arrived at +25". The two are kept side by side
   rather than one overwriting the other.
*/
export const PHASES = [
  { id: 'as-found', name: 'As found', short: 'Before' },
  { id: 'as-left', name: 'As left', short: 'After' },
] as const;

export type Phase = (typeof PHASES)[number]['id'];

export function phaseName(id: Phase): string {
  return PHASES.find((p) => p.id === id)?.name ?? id;
}

export interface Reading {
  position: PositionId;
  /** Before the work or after it. */
  phase: Phase;
  rate: number;
  amplitude: number;
  beatError: number;
  bph: number;
  /** ISO timestamp, so a reading can be told apart from a re-measure. */
  at: string;
}

export interface SessionSummary {
  count: number;
  averageRate: number;
  /** Worst-to-best rate difference across positions — the diagnostic number. */
  positionalSpread: number;
  minAmplitude: number;
  maxBeatError: number;
}

/*
   What identifies the watch, rather than what was measured. Kept beside the
   readings because a certificate without a reference is just a table of
   numbers — it has to say which watch it describes.
*/
export interface SessionMeta {
  /** Build number, movement serial, job number — whatever the shop uses. */
  reference: string;
  /** Who took the readings. Printed on the certificate. */
  technician: string;
  /*
     What the watch was doing before the work and after it, in the
     watchmaker's own words.

     Free text rather than a computed figure. The tables already carry every
     number; what these add is the one-line summary someone reads first, and
     that is a judgement — "+27, uniformly fast" and "+27, all over the place"
     are the same average and different watches. The Fill button next to each
     puts the measured average in, so it is a shortcut rather than a form to
     complete.
  */
  preRegulation: string;
  postRegulation: string;
  notes: string;
}

export const EMPTY_META: SessionMeta = {
  reference: '',
  technician: '',
  preRegulation: '',
  postRegulation: '',
  notes: '',
};

const STORAGE_KEY = 'mac-timegrapher.session';
const META_KEY = 'mac-timegrapher.session-meta';

/**
 * What to call this session.
 *
 * The reference is the operator's own name for the job — a build number, a
 * movement serial, a job number — so once they have typed one it is the name,
 * and "Session" stops being useful. Falling back the other way round would
 * label every session on the bench identically.
 */
export function sessionTitle(reference: string, movementName: string | null): string {
  const name = reference.trim() || 'Session';
  return movementName ? `${name} — ${movementName}` : name;
}

export function positionName(id: PositionId): string {
  return POSITIONS.find((p) => p.id === id)?.name ?? id;
}

/**
 * Re-measuring a position replaces its reading rather than adding a second —
 * but only within the same phase. An as-left reading must never overwrite the
 * as-found one it is meant to be compared against.
 */
export function upsert(readings: Reading[], next: Reading): Reading[] {
  const without = readings.filter(
    (r) => !(r.position === next.position && r.phase === next.phase),
  );
  return [...without, next].sort((a, b) => {
    const phase = PHASES.findIndex((p) => p.id === a.phase) - PHASES.findIndex((p) => p.id === b.phase);
    if (phase !== 0) return phase;
    return POSITIONS.findIndex((p) => p.id === a.position) - POSITIONS.findIndex((p) => p.id === b.position);
  });
}

/** Just the readings from one phase. */
export function readingsIn(readings: Reading[], phase: Phase): Reading[] {
  return readings.filter((r) => r.phase === phase);
}

/** Which phases have anything recorded, in order. */
export function phasesPresent(readings: Reading[]): Phase[] {
  return PHASES.map((p) => p.id).filter((id) => readings.some((r) => r.phase === id));
}

/**
 * The phase a new run should record into.
 *
 * As found until every position has one, then as left — because the second
 * pass over a watch is the one after the work. It is a starting point, not a
 * ruling: the phase is shown wherever readings are recorded and can be set by
 * hand when the session did not go that way.
 */
export function suggestPhase(readings: Reading[]): Phase {
  const found = readingsIn(readings, 'as-found');
  return found.length >= POSITIONS.length ? 'as-left' : 'as-found';
}

/**
 * What the work achieved, where both phases measured the same position.
 *
 * Null when there is nothing to compare — one phase missing, or no position
 * measured in both. A comparison drawn from a different set of positions
 * before and after would be measuring the positions, not the regulation.
 */
export function comparePhases(readings: Reading[]): {
  positions: number;
  rateBefore: number;
  rateAfter: number;
  spreadBefore: number;
  spreadAfter: number;
} | null {
  const before = readingsIn(readings, 'as-found');
  const after = readingsIn(readings, 'as-left');
  const shared = before
    .filter((b) => after.some((a) => a.position === b.position))
    .map((b) => b.position);

  if (shared.length === 0) return null;

  const pick = (rs: Reading[]) => rs.filter((r) => shared.includes(r.position)).map((r) => r.rate);
  const b = pick(before);
  const a = pick(after);
  const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
  const spread = (v: number[]) => Math.max(...v) - Math.min(...v);

  return {
    positions: shared.length,
    rateBefore: mean(b),
    rateAfter: mean(a),
    spreadBefore: spread(b),
    spreadAfter: spread(a),
  };
}

export function summarise(readings: Reading[]): SessionSummary | null {
  if (readings.length === 0) return null;

  const rates = readings.map((r) => r.rate);
  // Amplitude of 0 means the core could not determine it, so it must not be
  // mistaken for a movement that barely swings.
  const amplitudes = readings.map((r) => r.amplitude).filter((a) => a > 0);

  return {
    count: readings.length,
    averageRate: rates.reduce((s, v) => s + v, 0) / rates.length,
    positionalSpread: Math.max(...rates) - Math.min(...rates),
    minAmplitude: amplitudes.length > 0 ? Math.min(...amplitudes) : 0,
    maxBeatError: Math.max(...readings.map((r) => r.beatError)),
  };
}

/**
 * The average rate of whatever was measured most recently.
 *
 * "Most recently" is decided by timestamp rather than by phase, so Fill means
 * the same thing whichever field it is pressed beside: run the set, fill the
 * before line, regulate, run it again, fill the after line. It does not need
 * to know which pass the operator thought they were on.
 */
export function latestAverage(readings: Reading[]): {
  rate: number;
  positions: number;
  phase: Phase;
} | null {
  if (readings.length === 0) return null;

  const newest = readings.reduce((a, b) => (a.at >= b.at ? a : b));
  const group = readingsIn(readings, newest.phase);
  if (group.length === 0) return null;

  return {
    rate: group.reduce((sum, r) => sum + r.rate, 0) / group.length,
    positions: group.length,
    phase: newest.phase,
  };
}

/** How Fill writes a measured average into a free-text field. */
export function formatAverage(a: { rate: number; positions: number }): string {
  const sign = a.rate >= 0 ? '+' : '';
  return `${sign}${a.rate.toFixed(1)} s/day average over ${a.positions} position${
    a.positions === 1 ? '' : 's'
  }`;
}

export function load(): Reading[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Readings saved before phases existed were all taken as found — that is
    // what a single pass is. Defaulting them keeps a session that was open
    // across the change rather than discarding it.
    return parsed.map((r: Reading) => (r.phase ? r : { ...r, phase: 'as-found' as Phase }));
  } catch {
    return [];
  }
}

export function save(readings: Reading[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
  } catch {
    // Private browsing or a full quota. The session still works in memory;
    // losing it on reload is better than refusing to record at all.
  }
}

export function loadMeta(): SessionMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return EMPTY_META;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { ...EMPTY_META, ...parsed } : EMPTY_META;
  } catch {
    return EMPTY_META;
  }
}

export function saveMeta(meta: SessionMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* nothing to do */
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(META_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Tab-separated, which pastes straight into a spreadsheet or a build record. */
export function toTable(readings: Reading[], movementName: string | null): string {
  const head = ['Position', 'Rate (s/day)', 'Amplitude (deg)', 'Beat error (ms)'].join('\t');
  const rows = readings.map((r) =>
    [
      positionName(r.position),
      r.rate.toFixed(1),
      r.amplitude > 0 ? r.amplitude.toFixed(0) : '—',
      r.beatError.toFixed(2),
    ].join('\t'),
  );

  const s = summarise(readings);
  const footer = s
    ? [
        '',
        `Average rate\t${s.averageRate.toFixed(1)}`,
        `Positional spread\t${s.positionalSpread.toFixed(1)}`,
        `Minimum amplitude\t${s.minAmplitude > 0 ? s.minAmplitude.toFixed(0) : '—'}`,
        `Maximum beat error\t${s.maxBeatError.toFixed(2)}`,
      ]
    : [];

  const header = [
    movementName ? `Movement\t${movementName}` : null,
    `Measured\t${new Date().toISOString().slice(0, 10)}`,
    '',
  ].filter(Boolean) as string[];

  return [...header, head, ...rows, ...footer].join('\n');
}
