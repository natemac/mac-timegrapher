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

/**
 * The tightest spread seen so far, per reading. null where nothing has
 * qualified yet.
 *
 * This exists to answer a question the thresholds cannot answer for
 * themselves: what is *this* bench capable of? A hand-held sensor and a rigid
 * mount are different instruments, and a threshold that suits one is either
 * unreachable or meaningless on the other. Watching the best figure a session
 * achieves is how you find out where to put the line.
 */
export interface BestSpread {
  rate: number | null;
  amplitude: number | null;
  beatError: number | null;
}

/**
 * Samples a window must hold before its spread counts towards the best.
 *
 * Two reports a second, so this is ten seconds. A window holding three samples
 * is trivially tight — it has not had time to disagree with itself yet — and
 * letting those set the record would suggest a threshold nothing could meet.
 */
export const MIN_SAMPLES_FOR_BEST = 20;

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
  /*
     Kept across reset() on purpose. The average is thrown away between
     positions, but what the bench can hold is a property of the bench, and it
     takes a whole session to see it.
  */
  private tightest: BestSpread = { rate: null, amplitude: null, beatError: null };

  reset(): void {
    this.samples = [];
  }

  /** Forget what this bench has managed — a new watch on a new mount. */
  resetBest(): void {
    this.tightest = { rate: null, amplitude: null, beatError: null };
  }

  best(): BestSpread {
    return { ...this.tightest };
  }

  private recordBest(field: keyof BestSpread, spread: Spread | null): void {
    if (!spread || spread.count < MIN_SAMPLES_FOR_BEST) return;
    const current = this.tightest[field];
    if (current === null || spread.plusMinus < current) {
      this.tightest[field] = spread.plusMinus;
    }
  }

  /** `now` is seconds since capture started. */
  push(now: number, rate: number, amplitude: number, beatError: number): void {
    this.samples.push({ t: now, rate, amplitude, beatError });
    const cutoff = now - WINDOW_SECONDS;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) this.samples.shift();

    this.recordBest('rate', this.spread('rate'));
    this.recordBest('beatError', this.spread('beatError'));
    // Amplitude of 0 is the core saying it could not determine it; a run of
    // those is not a steady amplitude and must not set the record.
    if (this.samples.every((s) => s.amplitude > 0)) {
      this.recordBest('amplitude', this.spread('amplitude'));
    }
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
