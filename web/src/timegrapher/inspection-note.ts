/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { WizardStage } from './wizard';

/*
   The one line telling the operator what to do or what to wait for.

   It is a pure function of the run's state because it is the only instruction
   on the panel — the six markers are progress and cannot be pressed — and a
   line that says the wrong thing here sends somebody to reposition a watch that
   was already being measured.
*/
export interface NoteFacts {
  stage: WizardStage;
  /** Seconds left of the get-clear grace, while the stage is 'countdown'. */
  countdown: number;
  /** Whether audio is actually running. */
  capturing: boolean;
  /** Whether the reading has held steady long enough to be worth keeping. */
  settled: boolean;
  /** The position now being asked for, or null once every one is recorded. */
  currentName: string | null;
  /** The position just recorded, if that is what has happened. */
  lastCapturedName: string | null;
  /** How many of the six are recorded. */
  recorded: number;
  total: number;
}

export function inspectionNote(f: NoteFacts): string {
  if (f.recorded >= f.total || f.stage === 'done') {
    return 'All six positions captured. Review your summary.';
  }

  if (f.stage === 'countdown') {
    return `Starting in ${f.countdown}… Move away and let vibrations settle.`;
  }

  if (f.stage === 'measuring') {
    return f.settled
      ? 'Reading locked. Ready to capture.'
      : 'Keep the watch still. Waiting for a stable reading…';
  }

  if (f.stage === 'captured' && f.lastCapturedName) {
    return `${f.lastCapturedName} captured.`;
  }

  const where = f.currentName ? f.currentName.toLowerCase() : 'in position';

  /* Stopped part-way through a position. Saying "paused" rather than repeating
     the placement instruction matters: the watch has not moved, and telling
     somebody to place it again invites them to disturb it. */
  if (!f.capturing && f.lastCapturedName === null && f.recorded === 0 && f.stage === 'prompt') {
    return `Place the watch ${where}, then press Start.`;
  }

  if (f.lastCapturedName) {
    return `${f.lastCapturedName} captured. Place the watch ${where}, then press Start.`;
  }

  return `Place the watch ${where}, then press Start.`;
}
