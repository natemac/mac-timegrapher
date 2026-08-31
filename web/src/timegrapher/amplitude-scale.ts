/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   Amplitude as a position in time, which is what it physically is.

   The balance swings symmetrically about the impulse, so the escape wheel
   unlocks asin(lift angle / 2A) / pi of a period before the impact. Inverting
   that is how amplitude is measured at all — tg_measure.c does exactly this,
   backwards, from the impulse the algorithm found.

   Run forwards it lays out the degrees ruler on the beat display, which is why
   it lives here and not in the canvas: it is escapement geometry, and the same
   arithmetic the core relies on.
*/

/** Where an amplitude falls, as milliseconds before the beat. */
export function amplitudeMsBefore(liftAngle: number, amplitude: number, periodSeconds: number) {
  // Below half the lift angle the arcsine has no answer, and upstream skips it.
  if (!(periodSeconds > 0) || 2 * amplitude < liftAngle) return null;
  return ((periodSeconds * Math.asin(liftAngle / (2 * amplitude))) / Math.PI) * 1000;
}

/** The reverse: the swing an impulse this far before the beat implies. */
export function msBeforeToAmplitude(liftAngle: number, msBefore: number, periodSeconds: number) {
  if (!(periodSeconds > 0) || !(msBefore > 0)) return null;
  const s = Math.sin((Math.PI * (msBefore / 1000)) / periodSeconds);
  if (!(s > 0)) return null;
  const amplitude = liftAngle / (2 * s);
  /* Outside this window the figure is not an amplitude — it came from a
     spurious impulse, and labelling the curve with it would be worse than
     labelling it with nothing. The core applies the same range to the number
     it reports. */
  return amplitude >= 100 && amplitude <= 360 ? amplitude : null;
}
