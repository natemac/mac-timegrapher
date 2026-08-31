/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   How fast the sound card's clock actually runs.

   A device that reports 44,100 Hz is not running at 44,100 Hz. Crystals are
   ten to a hundred parts per million out, and every part per million is 0.0864
   seconds a day of error in rate — so a hundred is 8.6 s/day, which is the
   difference between a watch that needs regulating and one that does not.

   It hides from everything else the app measures. The error is a constant
   scale factor, so it is perfectly repeatable: the spread stays tight, the
   reading settles, and the whole scale is shifted. It also makes the
   synthetic-signal tests useless against it, because they generate and measure
   at the same assumed rate.

   Upstream measures this against an accurate 1 Hz source — a quartz watch
   ticking seconds, held to the sensor. A browser can do better without asking
   for anything: `AudioContext.currentTime` advances with the sound card, and
   `performance.now()` advances with the system clock, which is disciplined and
   orders of magnitude steadier than any sound-card crystal. Comparing the two
   over a few minutes gives the ratio directly.

   The comparison is a least-squares fit rather than a division of endpoints,
   because `currentTime` moves in steps of a render quantum — about 2.9 ms at
   44.1 kHz. Dividing two endpoints inherits the whole of that; fitting a line
   through a few hundred points averages it down to well under a part per
   million.
*/

export interface ClockResult {
  /** Audio seconds per wall second. 1 means the device is exactly nominal. */
  ratio: number;
  /**
   * What the device's clock gains per day, in seconds.
   *
   * This is also the amount every rate reading is wrong by while uncorrected,
   * and the sign is the way round you would expect: a clock that runs fast
   * makes a watch look slow, so the uncorrected reading is low by this much.
   */
  driftSecondsPerDay: number;
  /** One standard error on the drift, in the same units. */
  errorSecondsPerDay: number;
  /** Seconds of capture the fit is drawn from. */
  seconds: number;
  points: number;
}

/** Seconds a day per part per million, which is where the numbers come from. */
export const SECONDS_PER_DAY = 86_400;

/** Below this there is not enough elapsed time for the fit to mean anything. */
export const MIN_SECONDS = 60;

/** And not enough points to average the render-quantum steps down. */
export const MIN_POINTS = 30;

/** Kept bounded; a long session should not grow without limit. */
const MAX_POINTS = 4000;

/**
 * A step this far from real time is not clock drift.
 *
 * The context being suspended, the tab being backgrounded, or the machine
 * sleeping all show up as one enormous gap between two samples. Five percent is
 * fifty thousand parts per million — orders of magnitude past any crystal — so
 * anything beyond it is an interruption, not a measurement.
 */
const MAX_STEP_ERROR = 0.05;

/** A gap longer than this is a stall rather than a sampling interval. */
const MAX_STEP_SECONDS = 5;

/*
   One continuous run, deliberately.

   Accumulating several short runs looks tempting — an inspection is a series of
   twenty-second positions and would otherwise never reach a usable measurement
   — but it is biased, and badly. `currentTime` is floored to a render quantum,
   so every run under-reports its own elapsed audio by up to one quantum, a mean
   of about 1.5 ms. Within a single run that is a constant offset on the fitted
   line and does not touch its slope. Across runs the offsets compound, and four
   twenty-five-second positions come out around sixty parts per million low —
   larger than the error being measured, and pointing the wrong way.

   So a measurement is one uninterrupted capture. In practice that means it is
   something done once, deliberately, in Measure mode.
*/
export class ClockCalibrator {
  private audioTotal = 0;
  private wallTotal = 0;
  private lastAudio: number | null = null;
  private lastWall: number | null = null;
  private points: { x: number; y: number }[] = [];

  /**
   * A new capture. Everything measured under the previous audio context goes,
   * because a fit spanning two of them is biased — see above.
   */
  beginSession(): void {
    this.reset();
  }

  reset(): void {
    this.audioTotal = 0;
    this.wallTotal = 0;
    this.points = [];
    this.lastAudio = null;
    this.lastWall = null;
  }

  /** `audioTime` is AudioContext.currentTime; `wallMs` is performance.now(). */
  sample(audioTime: number, wallMs: number): void {
    if (this.lastAudio !== null && this.lastWall !== null) {
      const stepAudio = audioTime - this.lastAudio;
      const stepWall = (wallMs - this.lastWall) / 1000;

      const usable =
        stepAudio > 0 &&
        stepWall > 0 &&
        stepWall <= MAX_STEP_SECONDS &&
        Math.abs(stepAudio / stepWall - 1) <= MAX_STEP_ERROR;

      if (usable) {
        this.audioTotal += stepAudio;
        this.wallTotal += stepWall;
        this.points.push({ x: this.wallTotal, y: this.audioTotal });
        if (this.points.length > MAX_POINTS) this.points.shift();
      }
    }

    this.lastAudio = audioTime;
    this.lastWall = wallMs;
  }

  get seconds(): number {
    return this.wallTotal;
  }

  /** Null until there is enough of a run to say anything honest. */
  result(): ClockResult | null {
    const n = this.points.length;
    if (n < MIN_POINTS || this.wallTotal < MIN_SECONDS) return null;

    let sx = 0;
    let sy = 0;
    for (const p of this.points) {
      sx += p.x;
      sy += p.y;
    }
    const mx = sx / n;
    const my = sy / n;

    let sxx = 0;
    let sxy = 0;
    for (const p of this.points) {
      const dx = p.x - mx;
      sxx += dx * dx;
      sxy += dx * (p.y - my);
    }
    if (sxx <= 0) return null;

    const ratio = sxy / sxx;

    // Residual scatter about the fitted line, which is dominated by the
    // render-quantum steps rather than by anything physical.
    let residual = 0;
    for (const p of this.points) {
      const predicted = my + ratio * (p.x - mx);
      const e = p.y - predicted;
      residual += e * e;
    }
    const variance = n > 2 ? residual / (n - 2) : 0;
    const slopeError = Math.sqrt(variance / sxx);

    return {
      ratio,
      driftSecondsPerDay: (ratio - 1) * SECONDS_PER_DAY,
      errorSecondsPerDay: slopeError * SECONDS_PER_DAY,
      seconds: this.wallTotal,
      points: n,
    };
  }
}

/**
 * The sample rate to hand the measurement core.
 *
 * The core's arithmetic is in samples, so this is the only place a clock
 * correction has to be applied — everything downstream follows from it.
 */
export function correctedSampleRate(nominal: number, driftSecondsPerDay: number): number {
  return nominal * (1 + driftSecondsPerDay / SECONDS_PER_DAY);
}
