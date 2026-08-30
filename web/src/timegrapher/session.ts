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

export interface Reading {
  position: PositionId;
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
  notes: string;
}

export const EMPTY_META: SessionMeta = { reference: '', technician: '', notes: '' };

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

/** Re-measuring a position replaces its reading rather than adding a second. */
export function upsert(readings: Reading[], next: Reading): Reading[] {
  const without = readings.filter((r) => r.position !== next.position);
  return [...without, next].sort(
    (a, b) => POSITIONS.findIndex((p) => p.id === a.position) - POSITIONS.findIndex((p) => p.id === b.position),
  );
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

export function load(): Reading[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
