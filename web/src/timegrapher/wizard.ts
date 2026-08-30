/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { POSITIONS, positionName, type PositionId } from './session';
import type { Settling } from './stability';

/*
   The certification wizard.

   A six-position session is not six measurements; it is six measurements and
   five interruptions. Every time the watch is turned, a hand touches it — and
   that burst of handling noise is indistinguishable, to the analysis, from the
   movement misbehaving. It then sits in the thirty-second window poisoning
   everything measured after it.

   The manual view has a reset button for this, but a button you must remember
   to press is a button that gets forgotten precisely when the session matters.
   So the state machine is shaped around the interruption rather than around
   the measurement: the operator is told to move the watch, presses Go once it
   is settled in place, and only then does the average begin. Audio recorded
   while a hand was on the watch can never reach a reading.
*/

/*
   Ordered as the watch is physically turned, not as the positions are listed.
   Each step is a single rotation from the one before — flip, stand on edge,
   spin, quarter turn — so the operator is never working out what to do next.
*/
export const WIZARD_ORDER: PositionId[] = [
  'dial-up',
  'dial-down',
  'crown-down',
  'crown-up',
  'crown-left',
  'crown-right',
];

/*
   How to reach each position from the one before it.

   Kept to a glance — under thirty characters, so it sets on one line beside
   the Go button. Someone reading this has a watch in one hand and is looking
   at the watch, not the screen; a sentence they have to stop and parse is a
   sentence that gets skipped. Nothing here says "press Go", because the button
   next to it says Go.
*/
const PLACEMENT: Record<PositionId, string> = {
  'dial-up': 'Lay it flat, dial up.',
  'dial-down': 'Turn it over, dial down.',
  'crown-down': 'On edge, crown down.',
  'crown-up': 'Turn it round, crown up.',
  'crown-left': 'Quarter turn, 12 up.',
  'crown-right': 'Half turn, 6 up.',
};

export type WizardStage =
  /** Waiting for the operator to place the watch and press Go. */
  | 'prompt'
  /** The average has been restarted and is building. */
  | 'measuring'
  /** A reading was just recorded; showing it before moving on. */
  | 'captured'
  /** Every position in the run has been dealt with. */
  | 'done';

export interface WizardState {
  /** Index into WIZARD_ORDER. Equals its length once finished. */
  step: number;
  stage: WizardStage;
  /** Positions recorded by this run, for the closing summary. */
  recorded: PositionId[];
}

/**
 * Consecutive settled reports required before an unattended capture fires.
 *
 * `settling()` is already conservative — thirty seconds of history, twenty
 * seconds minimum — but it is evaluated twice a second, and a reading can
 * graze the bounds for a single report on its way through. Requiring the state
 * to hold costs half a second and removes that.
 */
export const AUTO_CAPTURE_CONFIRMATIONS = 2;

/**
 * Seconds of measuring after which the wizard stops promising it will settle.
 *
 * It does not capture anyway — it says so and hands the decision back. A watch
 * that will not settle is telling you something, and burying that under an
 * automatic capture would put the noise on a certificate.
 */
export const STALL_SECONDS = 75;

export function startWizard(): WizardState {
  return { step: 0, stage: 'prompt', recorded: [] };
}

/** The position a step measures, or null once the run is past the end. */
export function positionAt(step: number): PositionId | null {
  return WIZARD_ORDER[step] ?? null;
}

export function placementFor(position: PositionId): string {
  return PLACEMENT[position];
}

/** Human label for the current step, e.g. "Position 3 of 6 — Crown down". */
export function stepLabel(state: WizardState): string {
  const position = positionAt(state.step);
  if (!position) return 'Finished';
  return `Position ${state.step + 1} of ${WIZARD_ORDER.length} — ${positionName(position)}`;
}

/** Go: the watch is in place, restart the average and begin. */
export function begin(state: WizardState): WizardState {
  if (state.stage !== 'prompt') return state;
  return { ...state, stage: 'measuring' };
}

/** A reading was recorded for the current position. */
export function captured(state: WizardState): WizardState {
  const position = positionAt(state.step);
  if (state.stage !== 'measuring' || !position) return state;
  return {
    ...state,
    stage: 'captured',
    recorded: state.recorded.includes(position) ? state.recorded : [...state.recorded, position],
  };
}

/**
 * Move to the next position — after a capture, or because the operator skipped
 * one. Skipping is deliberate: not every job needs six positions, and a wizard
 * that cannot be stepped past is a wizard people abandon halfway.
 */
export function advance(state: WizardState): WizardState {
  const step = state.step + 1;
  if (step >= WIZARD_ORDER.length) return { ...state, step: WIZARD_ORDER.length, stage: 'done' };
  return { ...state, step, stage: 'prompt' };
}

/** Stop early, keeping whatever has been recorded. */
export function finish(state: WizardState): WizardState {
  return { ...state, step: WIZARD_ORDER.length, stage: 'done' };
}

/** Re-measure the position just captured rather than moving on. */
export function retry(state: WizardState): WizardState {
  if (state.stage !== 'captured') return state;
  return { ...state, stage: 'prompt' };
}

/**
 * Whether an unattended capture should fire now.
 *
 * Every condition has to hold: the run is measuring, the operator asked for
 * automatic capture, the core produced a usable reading, and the reading has
 * been settled for long enough to trust.
 */
export function shouldAutoCapture(opts: {
  stage: WizardStage;
  auto: boolean;
  valid: boolean;
  settling: Settling;
  settledRuns: number;
}): boolean {
  return (
    opts.stage === 'measuring' &&
    opts.auto &&
    opts.valid &&
    opts.settling === 'settled' &&
    opts.settledRuns >= AUTO_CAPTURE_CONFIRMATIONS
  );
}

/** True once the reading has been unsettled for long enough to say so. */
export function hasStalled(stage: WizardStage, settling: Settling, seconds: number): boolean {
  return stage === 'measuring' && settling !== 'settled' && seconds >= STALL_SECONDS;
}

/** Positions in the run that were stepped past without a reading. */
export function skipped(state: WizardState): PositionId[] {
  return WIZARD_ORDER.slice(0, state.step).filter((p) => !state.recorded.includes(p));
}

/* Every wizard position must exist in the session's position list, or a
   recorded reading would land somewhere the summary never reads it. */
export function orderIsValid(): boolean {
  const known = new Set(POSITIONS.map((p) => p.id as PositionId));
  return (
    WIZARD_ORDER.length === POSITIONS.length && WIZARD_ORDER.every((p) => known.has(p))
  );
}

const AUTO_KEY = 'mac-timegrapher.auto-capture';

/**
 * Automatic capture defaults on. It is the reason the wizard exists — with it
 * off, the operator still has to reach for the screen between every position,
 * which is the handling the run is built to avoid.
 */
export function loadAutoCapture(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveAutoCapture(auto: boolean): void {
  try {
    localStorage.setItem(AUTO_KEY, auto ? 'on' : 'off');
  } catch {
    // Private browsing or a full quota; a forgotten preference is not worth
    // failing over.
  }
}

/** Jump straight to a position — re-measuring one without re-running the set. */
export function jumpTo(state: WizardState, step: number): WizardState {
  if (step < 0 || step >= WIZARD_ORDER.length) return state;
  return { ...state, step, stage: 'prompt' };
}
