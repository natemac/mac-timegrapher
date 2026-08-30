/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   How settled a reading is.

   The obvious feature request is a menu of averaging windows — instant, 5s,
   10s, 30s. It is the wrong shape for two reasons. The algorithm already
   averages internally over windows of 2 to 16 seconds and reports the longest
   one that converged, so "instant" is not instant and a further average would
   be an average of an average. And a watchmaker does not think in windows;
   they are either adjusting, and want to see the effect of moving the
   regulator, or recording, and want a number they can write down.

   What is genuinely missing is spread. "255°" means nothing until you know
   whether it has been 253–257 or 230–280. So: keep the live reading, show
   what it has been doing, and say plainly when it has stopped moving.
*/

export interface Spread {
  /** Mean over the window. */
  mean: number;
  min: number;
  max: number;
  /** Half the peak-to-peak range — the ± figure shown beside the reading. */
  plusMinus: number;
  /** How many samples the window holds. */
  count: number;
}

export type Settling = 'waiting' | 'moving' | 'settling' | 'settled';

/** Seconds of history the spread is taken over. */
const WINDOW_SECONDS = 30;

/**
 * A reading is settled when its spread stays inside these bounds.
 *
 * Calibrated against real bench readings rather than picked for tidiness. A
 * hand-held sensor on a running NH35 produced rate spreads of 0.8-1.6 s/day and
 * beat-error spreads of 0.3-0.6 ms; the first attempt at these bounds (0.5 and
 * 0.1) was below that floor, so the indicator read MOVING permanently and told
 * the operator nothing.
 *
 * The numbers are still meaningful rather than merely achievable. A reading
 * repeatable to a second a day is far inside the ±10 s/day that decides whether
 * a watch needs regulating at all, so a settled reading is one you can act on.
 *
 * A rigid sensor mount should beat these comfortably; they are the threshold
 * for a watch held by hand, which is how the tool is actually used.
 */
export const SETTLED_BOUNDS = {
  rate: 1.0,        // s/day
  amplitude: 8,     // degrees
  beatError: 0.3,   // ms
};

export class StabilityTracker {
  private samples: { t: number; rate: number; amplitude: number; beatError: number }[] = [];

  reset(): void {
    this.samples = [];
  }

  /** `now` is seconds since capture started. */
  push(now: number, rate: number, amplitude: number, beatError: number): void {
    this.samples.push({ t: now, rate, amplitude, beatError });
    const cutoff = now - WINDOW_SECONDS;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) this.samples.shift();
  }

  spread(field: 'rate' | 'amplitude' | 'beatError'): Spread | null {
    if (this.samples.length === 0) return null;

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const s of this.samples) {
      const v = s[field];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return {
      mean: sum / this.samples.length,
      min,
      max,
      plusMinus: (max - min) / 2,
      count: this.samples.length,
    };
  }

  /**
   * Whether the reading has stopped moving. Amplitude is excluded when it
   * reads zero, which is the core's way of saying it could not determine it —
   * a run of zeroes is not a stable amplitude.
   */
  settling(secondsCaptured: number): Settling {
    if (this.samples.length < 4 || secondsCaptured < 8) return 'waiting';

    const rate = this.spread('rate');
    const beatError = this.spread('beatError');
    const amplitude = this.samples.every((s) => s.amplitude > 0) ? this.spread('amplitude') : null;
    if (!rate || !beatError) return 'waiting';

    const within =
      rate.plusMinus <= SETTLED_BOUNDS.rate &&
      beatError.plusMinus <= SETTLED_BOUNDS.beatError &&
      (amplitude === null || amplitude.plusMinus <= SETTLED_BOUNDS.amplitude);

    if (within) return secondsCaptured >= 20 ? 'settled' : 'settling';

    // Loosely within bounds counts as settling, so the label does not flap
    // between "moving" and "settled" on a borderline reading.
    const nearly =
      rate.plusMinus <= SETTLED_BOUNDS.rate * 3 &&
      beatError.plusMinus <= SETTLED_BOUNDS.beatError * 3;
    return nearly ? 'settling' : 'moving';
  }
}
