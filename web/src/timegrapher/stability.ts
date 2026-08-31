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
 * Two reports a second, so this is five seconds. A window holding three
 * samples is trivially tight — it has not had time to disagree with itself yet
 * — and letting those set the record would suggest a threshold nothing could
 * meet. Five rather than ten, because a window now starts over when the core's
 * confidence rises, and a full-confidence window has to be able to qualify
 * inside a reading of ordinary length.
 */
export const MIN_SAMPLES_FOR_BEST = 10;

/** Seconds of history the spread is taken over. */
const WINDOW_SECONDS = 30;

/**
 * A reading is settled when its spread stays inside these bounds.
 *
 * Measured, not chosen. A USB pickup on a running NH35 with an excellent
 * signal — 29 dB above the room — holds:
 *
 *     rate         ±0.2 to ±0.5 s/day
 *     amplitude    ±9 to ±12 degrees
 *     beat error   ±0.82 to ±0.89 ms
 *
 * The three are not equally steady, and the earlier bounds treated them as
 * though they were. Rate was given ±1.0, which that bench beats twice over;
 * beat error was given ±0.3, which it cannot reach at all. A watch on a good
 * sensor read MOVING for ever, and an automatic inspection never recorded
 * anything.
 *
 * Why beat error is the loose one is worth stating, because it looks like the
 * measurement being poor. It is the opposite. Beat error is the asymmetry
 * between a tic and a toc, reported as a magnitude, so it cannot go below
 * zero — and its noise does not shrink as the true value approaches zero. A
 * watch that is genuinely well in beat therefore reads 0.2, then 1.7, then
 * 0.7, jumping about the floor of what can be resolved. Demanding tight
 * *stability* there punishes exactly the watches that deserve it most.
 *
 * Rate is the signal that proves the lock is good. Holding ±0.2 s/day is two
 * parts per million of timing — no acoustic lock that loose could produce it.
 * So rate is the criterion that matters, and the other two are sanity bounds
 * set from what the bench actually manages, with headroom.
 *
 * Read them against "Steadiness of this bench" in the settings sheet, which
 * prints the tightest each has held this session.
 */
export const SETTLED_BOUNDS = {
  /* The criterion. Comfortably beaten by a decent sensor, and still a reading
     repeatable to a second a day — far inside the ±10 that decides whether a
     watch needs regulating at all. */
  rate: 1.0,        // s/day  (bench: ±0.2 to ±0.5)
  /* Derived from impulse shape rather than timing, so inherently noisier.
     15° on a 240° reading is six percent — it still answers the question
     amplitude is asked, which is whether the swing is healthy. */
  amplitude: 15,    // degrees (bench: ±9 to ±12)
  /* A sanity bound, not a criterion. See above: near zero this figure is at
     its resolution floor and will not sit still, however good the watch. */
  beatError: 1.5,   // ms      (bench: ±0.82 to ±0.89)
};

export class StabilityTracker {
  private samples: { t: number; rate: number; amplitude: number; beatError: number }[] = [];
  /*
     The core's confidence in its last report, which is really a statement of
     how much of its analysis window converged: a short window first, longer
     ones as the audio accumulates. It arrives quantised — 0.5, then 0.75, then
     1.0 — and each step is a different measurement, not a better guess at the
     same one.
  */
  private quality = 0;
  /*
     Kept across reset() on purpose. The average is thrown away between
     positions, but what the bench can hold is a property of the bench, and it
     takes a whole session to see it.
  */
  private tightest: BestSpread = { rate: null, amplitude: null, beatError: null };

  reset(): void {
    this.samples = [];
    this.quality = 0;
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

  /**
   * `now` is seconds since capture started. `quality` is the core's own
   * confidence in this report.
   *
   * A rise in quality throws the window away. The core has switched to a
   * longer analysis window, and the readings it produced from a shorter one
   * are not worse estimates of the same quantity — they are a different, less
   * informed measurement, and averaging the two misreports both.
   *
   * This is not theoretical. On a real NH35 the first seconds of a reading
   * gave 218.7° and then 196.1°, both at the lowest confidence, while the
   * settled reading sat around 212°. Those two pinned the amplitude spread at
   * ±11.3 for the rest of the run — four times what the bench actually holds
   * once the analysis has its full window, which is ±3.
   *
   * A fall in quality does not clear anything. That is the reading degrading,
   * which is exactly what the spread exists to show, and clearing on every dip
   * would leave a wandering signal permanently unable to fill a window.
   */
  push(now: number, rate: number, amplitude: number, beatError: number, quality = 1): void {
    if (quality > this.quality) {
      this.samples = [];
      this.quality = quality;
    }

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

    /*
       Loosely within counts as settling, so the label does not flap on a
       borderline reading.

       Only rate is loosened. Beat error is already a sanity bound rather than
       a criterion, and multiplying it further would let genuinely unstable
       audio read as though it were converging.
    */
    const nearly = rate.plusMinus <= SETTLED_BOUNDS.rate * 3;
    return nearly ? 'settling' : 'moving';
  }
}
