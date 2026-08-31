/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   Movement presets.

   Two numbers matter. The beat rate the app can work out for itself, but
   telling it removes any chance of latching onto a wrong multiple. The lift
   angle it cannot: it is a property of the escapement geometry, not of the
   sound, and amplitude is calculated directly from it. Get it wrong by a
   degree and every amplitude reading is out by about two percent.

   The angles here are the bench's own figures. Two are marked unverified in
   `liftAngleVerified` — they are working values that have not been confirmed
   against manufacturer data, and the app says so rather than presenting them
   with the same confidence as the rest.
*/

export interface Movement {
  id: string;
  name: string;
  maker: string;
  /**
   * Beats per hour, or null for a quartz movement — there is no escapement to
   * assume a rate for, and the step frequency varies by calibre.
   */
  bph: number | null;
  /**
   * Degrees, or null for quartz. A quartz movement has no balance wheel, so
   * amplitude is not a small number or an unknown one: it does not exist.
   */
  liftAngle: number | null;
  /**
   * Whether the lift angle has been confirmed against manufacturer service
   * data. False means it is a working figure and the amplitude derived from it
   * inherits that uncertainty.
   */
  liftAngleVerified: boolean;
}

/** tg's own default, used when no movement has been chosen. */
export const DEFAULT_LIFT_ANGLE = 52;

const mech = (
  id: string, name: string, maker: string, bph: number, liftAngle: number,
  liftAngleVerified = true,
): Movement => ({ id, name, maker, bph, liftAngle, liftAngleVerified });

const quartz = (id: string, name: string, maker: string): Movement =>
  ({ id, name, maker, bph: null, liftAngle: null, liftAngleVerified: true });

export const MOVEMENTS: Movement[] = [
  // Seiko / TMI. The NH3x and NH7x share an escapement at 53°; the NH0x sits
  // a degree lower.
  mech('nh05', 'NH05', 'Seiko / TMI', 21600, 52),
  mech('nh06', 'NH06', 'Seiko / TMI', 21600, 52),
  mech('nh34', 'NH34 (GMT)', 'Seiko / TMI', 21600, 53),
  mech('nh35', 'NH35', 'Seiko / TMI', 21600, 53),
  mech('nh36', 'NH36', 'Seiko / TMI', 21600, 53),
  mech('nh37', 'NH37', 'Seiko / TMI', 21600, 53),
  mech('nh38', 'NH38', 'Seiko / TMI', 21600, 53),
  mech('nh39', 'NH39', 'Seiko / TMI', 21600, 53),
  mech('nh70', 'NH70', 'Seiko / TMI', 21600, 53),
  mech('nh71', 'NH71', 'Seiko / TMI', 21600, 53),
  mech('nh72', 'NH72', 'Seiko / TMI', 21600, 53),

  // Miyota
  mech('miyota8215', '8215', 'Miyota', 21600, 49),
  mech('miyota8205', '8205', 'Miyota', 21600, 49),
  mech('miyota9015', '9015', 'Miyota', 28800, 51),

  // Chinese 2824-pattern
  mech('pt5000', 'PT5000', 'Precision', 28800, 50),
  mech('pt5404', 'PT5404', 'Precision', 28800, 50, false),
  mech('st2130', 'ST2130', 'Sea-Gull', 28800, 50, false),

  // Swiss, kept for comparison work against a known reference.
  mech('eta2824', '2824-2', 'ETA', 28800, 50),
  mech('sw200', 'SW200-1', 'Sellita', 28800, 50),

  /*
     Quartz. Listed so the calibre can be named on an inspection, not because
     the analysis applies to it — see `isQuartz`.
  */
  quartz('vk61', 'VK61', 'Seiko / TMI'),
  quartz('vk63', 'VK63', 'Seiko / TMI'),
  quartz('vk64', 'VK64', 'Seiko / TMI'),
  quartz('vk67', 'VK67', 'Seiko / TMI'),
  quartz('vk68', 'VK68', 'Seiko / TMI'),
  quartz('vk73', 'VK73', 'Seiko / TMI'),
  quartz('vh31', 'VH31', 'Seiko / TMI'),
];

/**
 * A quartz movement, where the mechanical readings do not apply.
 *
 * Amplitude and beat error both describe a balance wheel — how far it swings,
 * and whether its two half-turns are even. A stepper motor has neither, so
 * those figures are not merely unknown here, they are meaningless, and the app
 * withholds them rather than printing a number that could be read as one.
 *
 * Rate is a different matter and is the one figure that would mean something.
 * The analysis will not produce it for most quartz movements: it looks for an
 * escapement between 8,100 and 72,000 beats an hour, and a seconds hand
 * stepping once a second is 3,600 — under the floor. A calibre that steps
 * often enough (upwards of about two and a quarter times a second) falls inside
 * the range, so this is worth measuring rather than assuming either way.
 */
export function isQuartz(movement: Movement | null): boolean {
  return movement !== null && movement.liftAngle === null;
}

/*
   What a bench sees on first run, before anything is chosen.

   Automatic beat-rate detection sounds like the safer default and is not: it
   detects the beat rate but cannot detect the lift angle, so amplitude falls
   back to a generic figure and is quietly wrong for whatever is on the sensor.
   A named calibre is at least wrong in a way you can see and change.
*/
export const DEFAULT_MOVEMENT_ID = 'nh35';

/* Stored in place of a calibre when automatic detection is chosen on purpose.
   Without it, "I picked automatic" and "I have never chosen" are the same
   absent key, and the default would overwrite a deliberate choice on reload. */
export const AUTO_MOVEMENT_ID = 'auto';

const MOVEMENT_KEY = 'mac-timegrapher.movement';

/* null means automatic detection. Nothing stored is a first run, which gets
   the default; a stored AUTO_MOVEMENT_ID is a deliberate choice and is kept. */
export function loadMovementId(): string | null {
  try {
    const stored = localStorage.getItem(MOVEMENT_KEY);
    if (stored === AUTO_MOVEMENT_ID) return null;
    return stored ?? DEFAULT_MOVEMENT_ID;
  } catch {
    return DEFAULT_MOVEMENT_ID;
  }
}

export function saveMovementId(id: string | null): void {
  try {
    localStorage.setItem(MOVEMENT_KEY, id ?? AUTO_MOVEMENT_ID);
  } catch {
    // Private browsing or a full quota; a forgotten preference is not worth
    // failing over.
  }
}

export function findMovement(id: string | null): Movement | null {
  if (!id) return null;
  return MOVEMENTS.find((m) => m.id === id) ?? null;
}

/**
 * What to hand the engine. With no movement chosen — or a quartz one, which
 * has no escapement to describe — the beat rate is detected and the lift angle
 * falls back to tg's default, which is what the app did before presets existed.
 */
export function engineConfigFor(movement: Movement | null): { bph: number; liftAngle: number } {
  return movement && movement.bph !== null && movement.liftAngle !== null
    ? { bph: movement.bph, liftAngle: movement.liftAngle }
    : { bph: 0, liftAngle: DEFAULT_LIFT_ANGLE };
}
