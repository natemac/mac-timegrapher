/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   One run's readings, and what they add up to.

   Which watch a run belongs to, whether it was taken before or after the work,
   and how two runs are paired all live in `inspections.ts`. This file is the
   arithmetic: six positions, and the summary that separates a watch needing
   the regulator from one with a poising problem.

   One reading tells you whether a watch is fast. Six tell you why. A movement
   that is perfect dial up and terrible crown down has a poising or pivot
   problem; one that is uniformly fast just needs the regulator moving. The
   spread between positions is the number that separates those two cases, and
   it is the reason a bench measures more than once.

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

export interface RunningRange {
  mean: number;
  min: number;
  max: number;
}

export interface RunningSummary {
  count: number;
  bph: number;
  rate: RunningRange;
  /** Null when no position has produced an amplitude the core could determine. */
  amplitude: RunningRange | null;
  beatError: RunningRange;
  /** Worst-to-best rate difference — the number that separates the two faults. */
  positionalSpread: number;
}

/**
 * What the run has found so far.
 *
 * An inspection stops capture between positions, so the readings go blank
 * exactly when there is something worth looking at. This fills that gap with
 * the set as it stands, which is also the first point at which the positional
 * spread means anything — one position cannot disagree with itself.
 */
export function runningSummary(readings: Reading[]): RunningSummary | null {
  if (readings.length === 0) return null;

  const range = (values: number[]): RunningRange => ({
    mean: values.reduce((s, v) => s + v, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  });

  const rates = readings.map((r) => r.rate);
  // Amplitude of 0 is the core saying it could not determine it, which is not
  // a movement that barely swings and must not drag an average down.
  const amplitudes = readings.map((r) => r.amplitude).filter((a) => a > 0);

  return {
    count: readings.length,
    bph: readings[0].bph,
    rate: range(rates),
    amplitude: amplitudes.length > 0 ? range(amplitudes) : null,
    beatError: range(readings.map((r) => r.beatError)),
    positionalSpread: Math.max(...rates) - Math.min(...rates),
  };
}
