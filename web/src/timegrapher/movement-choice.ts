/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { findMovement, type Movement, MOVEMENTS } from './movements';

/*
   What the movement control resolves to.

   Three kinds of answer, not two. A preset supplies both numbers. Manual takes
   both from the operator. Automatic supplies neither by itself — it detects the
   beat rate from the signal, and takes the lift angle from the manual figure,
   because a lift angle cannot be heard. That last point is the one worth
   labouring: automatic is not "the app works it out", it is "the app works out
   the half it can", and amplitude still depends on a number a person typed.
*/

/** Stored in place of a calibre id when automatic detection is chosen. */
export const AUTO_ID = null;
/** Stored in place of a calibre id when both numbers are typed in. */
export const MANUAL_ID = 'manual';

export interface ManualMovement {
  /** Beats per hour. Whole beats — a fractional beat rate is a typo. */
  bph: number;
  liftAngle: number;
}

/*
   NH35 at 21,600 and 53°, which is what the bench sees most of and what the
   preset list defaults to. Somebody reaching for Manual is usually adjusting
   one of the two, not entering both from nothing.
*/
export const MANUAL_DEFAULTS: ManualMovement = { bph: 21600, liftAngle: 53 };

const MANUAL_KEY = 'mac-timegrapher.manual-movement';

export function loadManualMovement(): ManualMovement {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (!raw) return MANUAL_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return MANUAL_DEFAULTS;
    const { bph, liftAngle } = parsed as Partial<ManualMovement>;
    if (!isValidBph(bph) || !isValidLiftAngle(liftAngle)) return MANUAL_DEFAULTS;
    return { bph, liftAngle };
  } catch {
    return MANUAL_DEFAULTS;
  }
}

export function saveManualMovement(m: ManualMovement): void {
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(m));
  } catch {
    // Private browsing or a full quota. A forgotten preference is not worth
    // failing over.
  }
}

export function isValidBph(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isValidLiftAngle(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 360;
}

export const BAD_BPH = 'Enter a positive whole-number beat rate.';
export const BAD_LIFT_ANGLE = 'Enter a lift angle greater than 0° and no more than 360°.';

export interface ManualDraft {
  bph: string;
  liftAngle: string;
}

export interface ManualValidation {
  /** The values to keep, or null when either field is unusable. */
  value: ManualMovement | null;
  badBph: boolean;
  badLiftAngle: boolean;
  error: string | null;
}

/**
 * Judge what has been typed.
 *
 * The beat rate is only judged under Manual: under automatic it is detected, so
 * an empty or half-typed figure in a field that is not being used must not
 * paint the panel red or block the lift angle from being saved.
 */
export function validateManual(draft: ManualDraft, manualMode: boolean): ManualValidation {
  const bph = Number(draft.bph);
  const liftAngle = Number(draft.liftAngle);
  const badBph = manualMode && !isValidBph(bph);
  const badLiftAngle = !isValidLiftAngle(liftAngle);

  if (badBph || badLiftAngle) {
    return {
      value: null,
      badBph,
      badLiftAngle,
      // The beat rate first: it is the field above, so a reader looking for the
      // fault they were just told about finds it without scanning.
      error: badBph ? BAD_BPH : BAD_LIFT_ANGLE,
    };
  }

  return {
    value: { bph: manualMode ? bph : MANUAL_DEFAULTS.bph, liftAngle },
    badBph: false,
    badLiftAngle: false,
    error: null,
  };
}

export interface MovementConfig {
  /** Beats per hour, or 0 to let the core detect it. */
  bph: number;
  liftAngle: number;
  /** Whether the beat rate is being detected rather than declared. */
  detected: boolean;
}

/**
 * The two numbers the engine is built from.
 *
 * A wrong lift angle is a wrong amplitude — the reading is derived directly
 * from it — so there is no safe fallback here, only a stated one.
 */
export function resolveMovementConfig(
  movementId: string | null,
  manual: ManualMovement,
): MovementConfig {
  if (movementId === MANUAL_ID) {
    return { bph: manual.bph, liftAngle: manual.liftAngle, detected: false };
  }

  const preset = findMovement(movementId);
  if (preset && preset.bph !== null && preset.liftAngle !== null) {
    return { bph: preset.bph, liftAngle: preset.liftAngle, detected: false };
  }

  /* Automatic — and anything that resolves to nothing, such as a stored id from
     a build whose preset list has since changed. The beat rate is detected; the
     lift angle comes from the manual figure, because nothing in the signal
     carries it. */
  return { bph: 0, liftAngle: manual.liftAngle, detected: true };
}

function bph(value: number): string {
  return `${value.toLocaleString('en-US')} bph`;
}

/** The line under the Movement control in Settings. */
export function movementSummary(movementId: string | null, manual: ManualMovement): string {
  const config = resolveMovementConfig(movementId, manual);
  const rate = config.detected ? 'Auto (awaiting signal)' : bph(config.bph);
  return `Beat Rate: ${rate} · Lift Angle: ${config.liftAngle}°`;
}

/** Name and figures for the compact movement button in the toolbar. */
export function movementBadge(
  movementId: string | null,
  manual: ManualMovement,
): { name: string; meta: string } {
  const config = resolveMovementConfig(movementId, manual);
  const meta = `${config.detected ? 'Auto' : bph(config.bph)} · ${config.liftAngle}°`;

  if (movementId === MANUAL_ID) return { name: 'Manual', meta };
  const preset = findMovement(movementId);
  if (preset) return { name: preset.name, meta };
  return { name: 'Auto', meta };
}

/** The preset list, grouped by maker in the order the makers first appear. */
export function movementsByMaker(): { maker: string; movements: Movement[] }[] {
  const groups: { maker: string; movements: Movement[] }[] = [];
  for (const m of MOVEMENTS) {
    // Quartz calibres carry no beat rate or lift angle, so there is nothing for
    // a movement preset to supply. See docs/updateui.md, A9.
    if (m.bph === null || m.liftAngle === null) continue;
    const group = groups.find((g) => g.maker === m.maker);
    if (group) group.movements.push(m);
    else groups.push({ maker: m.maker, movements: [m] });
  }
  return groups;
}
