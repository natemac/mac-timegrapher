/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import {
  POSITIONS, summarise, positionName,
  type PositionId, type Reading, type SessionSummary,
} from './session';

/*
   Inspections, and how a before is tied to an after.

   The first attempt kept one bucket of readings and tagged each with a phase,
   guessing that a second pass over a full set meant the watch had been
   regulated. It does not survive a bench. A watch goes out for service and
   comes back a fortnight later; a dozen other movements are measured in
   between; the guess has no way to know which run belonged to which watch, and
   one bucket cannot hold them anyway.

   So a run is a record of its own, it says outright whether it is before or
   after the work, and the two are paired by the thing that already identifies
   the watch — the reference the operator types for the document. Nothing has
   to happen in order, or on the same day, or even in the same week. Measure a
   watch as found, measure thirty others, come back a month later, mark the run
   as left, and the document has both.

   Matching is on the reference alone, trimmed and case-folded, because
   "MB-0142" and "mb-0142 " are one watch and a bench types both.
*/

/*
   Before and after the work, in plain words.

   These were "As found" and "As left" — what a service trade calls them, and
   nothing to anyone else. A tool a customer might read should not need a
   glossary, so the label says what it means.

   `short` is for a switch or a list, where "Before regulation" would wrap;
   `name` is for the printed document, where it should say so in full.
*/
export const PHASES = [
  { id: 'pre', name: 'Before regulation', short: 'Before' },
  { id: 'post', name: 'After regulation', short: 'After' },
] as const;

export type Phase = (typeof PHASES)[number]['id'];

export function phaseName(id: Phase): string {
  return PHASES.find((p) => p.id === id)?.name ?? id;
}

export function phaseShort(id: Phase): string {
  return PHASES.find((p) => p.id === id)?.short ?? id;
}

export function otherPhase(id: Phase): Phase {
  return id === 'pre' ? 'post' : 'pre';
}

export interface Inspection {
  id: string;
  /** What identifies the watch, and the only thing that pairs two runs. */
  reference: string;
  movementId: string | null;
  /** Kept as text so a record still reads correctly if a preset is renamed. */
  movementName: string | null;
  phase: Phase;
  readings: Reading[];
  technician: string;
  /** The watchmaker's line about this pass, printed beside its table. */
  notes: string;
  startedAt: string;
  updatedAt: string;
}

const STORE_KEY = 'mac-timegrapher.inspections';
const CURRENT_KEY = 'mac-timegrapher.current-inspection';

/** Older keys, read once so a session open across the change is not lost. */
const LEGACY_READINGS = 'mac-timegrapher.session';
const LEGACY_META = 'mac-timegrapher.session-meta';

/** How many runs are kept before the oldest is dropped. */
export const MAX_INSPECTIONS = 60;

function id(): string {
  return `insp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createInspection(over: Partial<Inspection> = {}): Inspection {
  const now = new Date().toISOString();
  return {
    id: id(),
    reference: '',
    movementId: null,
    movementName: null,
    phase: 'pre',
    readings: [],
    technician: '',
    notes: '',
    startedAt: now,
    updatedAt: now,
    ...over,
  };
}

/** Re-measuring a position replaces its reading rather than adding a second. */
export function upsertReading(inspection: Inspection, next: Reading): Inspection {
  const without = inspection.readings.filter((r) => r.position !== next.position);
  const readings = [...without, next].sort(
    (a, b) =>
      POSITIONS.findIndex((p) => p.id === a.position) -
      POSITIONS.findIndex((p) => p.id === b.position),
  );
  return { ...inspection, readings, updatedAt: new Date().toISOString() };
}

/** Two references name the same watch when they differ only in case or space. */
export function sameWatch(a: string, b: string): boolean {
  const norm = (v: string) => v.trim().toLowerCase();
  return norm(a) !== '' && norm(a) === norm(b);
}

/**
 * The opposite-phase run for the same watch — the other half of a
 * before-and-after.
 *
 * The most recent one, because a watch regulated twice should be reported
 * against the state it was actually in when this pass began. Null when the
 * reference is blank: an unnamed run pairs with nothing, or every unnamed run
 * would pair with every other.
 */
export function findPair(all: Inspection[], current: Inspection): Inspection | null {
  const wanted = otherPhase(current.phase);
  const matches = all
    .filter(
      (i) =>
        i.id !== current.id &&
        i.phase === wanted &&
        sameWatch(i.reference, current.reference) &&
        i.readings.length > 0,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return matches[0] ?? null;
}

/** Before regulation first, whichever way round the pair was measured. */
export function orderPair(a: Inspection, b: Inspection | null): Inspection[] {
  if (!b) return [a];
  return a.phase === 'pre' ? [a, b] : [b, a];
}

export interface PairComparison {
  positions: number;
  rateBefore: number;
  rateAfter: number;
  spreadBefore: number;
  spreadAfter: number;
}

/**
 * What the work achieved, over the positions measured in both runs.
 *
 * Null when they share none: a before drawn from dial up and an after drawn
 * from crown down would be reporting the difference between two positions, not
 * the difference the regulation made.
 */
export function comparePair(before: Inspection, after: Inspection): PairComparison | null {
  const shared = before.readings
    .filter((b) => after.readings.some((a) => a.position === b.position))
    .map((b) => b.position);

  if (shared.length === 0) return null;

  const rates = (i: Inspection) =>
    i.readings.filter((r) => shared.includes(r.position)).map((r) => r.rate);
  const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length;
  const spread = (v: number[]) => Math.max(...v) - Math.min(...v);

  const b = rates(before);
  const a = rates(after);
  return {
    positions: shared.length,
    rateBefore: mean(b),
    rateAfter: mean(a),
    spreadBefore: spread(b),
    spreadAfter: spread(a),
  };
}

export function summariseInspection(i: Inspection): SessionSummary | null {
  return summarise(i.readings);
}

/** What to call a run in a list: the watch, then which pass it was. */
export function inspectionTitle(i: Inspection): string {
  const name = i.reference.trim() || 'Unnamed';
  return `${name} — ${phaseName(i.phase)}`;
}

/* ---------- storage ---------- */

function readLegacy(): Inspection[] {
  try {
    const rawReadings = localStorage.getItem(LEGACY_READINGS);
    if (!rawReadings) return [];

    const parsed = JSON.parse(rawReadings);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const meta = JSON.parse(localStorage.getItem(LEGACY_META) ?? '{}') ?? {};
    const out: Inspection[] = [];

    // The old shape tagged each reading with its phase. Split them back apart
    // into a run each, so a session open across the change survives it.
    for (const phase of PHASES.map((p) => p.id)) {
      const readings = parsed
        .filter((r: Reading & { phase?: string }) => renamePhase(r.phase) === phase)
        .map(({ phase: _drop, ...r }: Reading & { phase?: string }) => r as Reading);
      if (readings.length === 0) continue;

      out.push(createInspection({
        reference: meta.reference ?? '',
        technician: meta.technician ?? '',
        notes: meta.notes ?? '',
        phase,
        readings,
      }));
    }
    return out;
  } catch {
    return [];
  }
}

/** The phases were named for the trade before they were named for the reader. */
function renamePhase(value: unknown): Phase {
  if (value === 'as-left' || value === 'post') return 'post';
  return 'pre';
}

export function loadInspections(): Inspection[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((i: Inspection) => ({ ...i, phase: renamePhase(i.phase) }));
      }
      return [];
    }
    // Nothing in the new store: bring anything from the old one across once.
    const migrated = readLegacy();
    if (migrated.length > 0) saveInspections(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export function saveInspections(all: Inspection[]): void {
  try {
    // Newest kept. A bench that never clears should not fill its storage.
    const trimmed = [...all]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_INSPECTIONS);
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {
    // Private browsing or a full quota. The run still works in memory; losing
    // it on reload is better than refusing to record at all.
  }
}

export function loadCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function saveCurrentId(value: string | null): void {
  try {
    if (value) localStorage.setItem(CURRENT_KEY, value);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Replace one run in the list, or add it if it is new. */
export function putInspection(all: Inspection[], next: Inspection): Inspection[] {
  const without = all.filter((i) => i.id !== next.id);
  return [next, ...without];
}

export function removeInspection(all: Inspection[], id: string): Inspection[] {
  return all.filter((i) => i.id !== id);
}

/** Newest first, which is the order a bench wants to look through them. */
export function byRecency(all: Inspection[]): Inspection[] {
  return [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Tab-separated, which pastes straight into a spreadsheet or a build record. */
export function pairToTable(runs: Inspection[]): string {
  const lines: string[] = [];
  for (const run of runs) {
    lines.push(`${phaseName(run.phase)}\t${run.reference || 'Unnamed'}\t${run.movementName ?? ''}`);
    lines.push(['Position', 'Rate (s/day)', 'Amplitude (deg)', 'Beat error (ms)'].join('\t'));
    for (const r of run.readings) {
      lines.push([
        positionName(r.position),
        r.rate.toFixed(1),
        r.amplitude > 0 ? r.amplitude.toFixed(0) : '—',
        r.beatError.toFixed(2),
      ].join('\t'));
    }
    const s = summarise(run.readings);
    if (s) {
      lines.push(`Average rate\t${s.averageRate.toFixed(1)}`);
      lines.push(`Positional spread\t${s.positionalSpread.toFixed(1)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export type { PositionId, Reading };
