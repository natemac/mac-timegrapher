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

   The values below are the ones commonly published for these calibres. They
   are good enough to work with and worth confirming against the manufacturer's
   own data before a reading goes into a permanent record — service sheets
   occasionally disagree with the figures that circulate on forums.
*/

export interface Movement {
  id: string;
  name: string;
  maker: string;
  bph: number;
  /** Degrees. Amplitude scales directly with this. */
  liftAngle: number;
}

/** tg's own default, used when no movement has been chosen. */
export const DEFAULT_LIFT_ANGLE = 52;

export const MOVEMENTS: Movement[] = [
  // Seiko / TMI — the NH family shares an escapement, hence one lift angle.
  { id: 'nh35', name: 'NH35', maker: 'Seiko / TMI', bph: 21600, liftAngle: 53 },
  { id: 'nh34', name: 'NH34 (GMT)', maker: 'Seiko / TMI', bph: 21600, liftAngle: 53 },
  { id: 'nh38', name: 'NH38', maker: 'Seiko / TMI', bph: 21600, liftAngle: 53 },
  { id: 'nh39', name: 'NH39', maker: 'Seiko / TMI', bph: 21600, liftAngle: 53 },
  { id: 'nh05', name: 'NH05', maker: 'Seiko / TMI', bph: 21600, liftAngle: 53 },
  { id: 'nh70', name: 'NH70', maker: 'Seiko / TMI', bph: 21600, liftAngle: 53 },
  { id: 'nh71', name: 'NH71', maker: 'Seiko / TMI', bph: 21600, liftAngle: 53 },
  { id: 'nh72', name: 'NH72', maker: 'Seiko / TMI', bph: 21600, liftAngle: 53 },

  // Miyota
  { id: 'miyota8215', name: '8215', maker: 'Miyota', bph: 21600, liftAngle: 51 },
  { id: 'miyota8205', name: '8205', maker: 'Miyota', bph: 21600, liftAngle: 51 },
  { id: 'miyota9015', name: '9015', maker: 'Miyota', bph: 28800, liftAngle: 51 },

  // Chinese 2824-pattern
  { id: 'pt5000', name: 'PT5000', maker: 'Precision', bph: 28800, liftAngle: 52 },
  { id: 'pt5404', name: 'PT5404', maker: 'Precision', bph: 28800, liftAngle: 52 },
  { id: 'st2130', name: 'ST2130', maker: 'Sea-Gull', bph: 28800, liftAngle: 52 },

  // Swiss, for comparison work
  { id: 'eta2824', name: '2824-2', maker: 'ETA', bph: 28800, liftAngle: 50 },
  { id: 'sw200', name: 'SW200-1', maker: 'Sellita', bph: 28800, liftAngle: 50 },
];

export function findMovement(id: string | null): Movement | null {
  if (!id) return null;
  return MOVEMENTS.find((m) => m.id === id) ?? null;
}

/**
 * What to hand the engine. With no movement chosen the beat rate is detected
 * and the lift angle falls back to tg's default, which is what the app did
 * before presets existed.
 */
export function engineConfigFor(movement: Movement | null): { bph: number; liftAngle: number } {
  return movement
    ? { bph: movement.bph, liftAngle: movement.liftAngle }
    : { bph: 0, liftAngle: DEFAULT_LIFT_ANGLE };
}
