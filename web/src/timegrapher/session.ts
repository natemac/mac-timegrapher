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
  /*
     Named for where the 12 index points, which is how this bench calls them:
     crown left is 12 o'clock down (equivalently 6 up), crown right is 12
     o'clock up (6 down).

     Worth knowing that this overlaps the usual reading of the two above it —
     under most conventions "crown down" is itself 12-up. The names here are the
     ones the watchmaker signing the document uses, which is what a document is
     for. The ids are unchanged, so readings recorded under any previous name
     still resolve.
  */
  { id: 'crown-left', name: '12 o’clock down', short: '12D' },
  { id: 'crown-right', name: '12 o’clock up', short: '12U' },
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

/*
   What a run comes to, as averages and nothing else.

   Deliberately no spread, no lowest amplitude, no greatest beat error. Those
   are range statistics over six samples, which makes them the most
   outlier-sensitive figures it is possible to compute: one knock of the bench
   during one position moves every one of them and none of the averages. They
   were on the summary and they are not any more — a figure that a bumped table
   can set is not a figure to put on a document.

   Amplitude is null when the core never produced one — on quartz, or on a
   capture route that cannot read it.
*/
export interface SessionSummary {
  count: number;
  averageRate: number;
  averageAmplitude: number | null;
  averageBeatError: number;
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

  const beatErrors = readings.map((r) => r.beatError);
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

  return {
    count: readings.length,
    averageRate: mean(rates),
    averageAmplitude: amplitudes.length > 0 ? mean(amplitudes) : null,
    averageBeatError: mean(beatErrors),
  };
}

