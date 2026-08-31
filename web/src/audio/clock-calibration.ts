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

/*
   What the fit was built from, for when it produces something impossible.

   Every rejected step used to vanish silently, which left no way to tell an
   interrupted run from a systematically wrong one — the two look identical
   from the outside, and both just produce a number that cannot be true.
*/
export interface ClockDebug {
  points: number;
  wallSeconds: number;
  audioSeconds: number;
  /** Slope of the fit, and the plain ratio of the totals. They should agree;
      when they do not, the points are not evenly spread. */
  fittedRatio: number | null;
  totalsRatio: number | null;
  fittedDriftSecondsPerDay: number | null;
  totalsDriftSecondsPerDay: number | null;
  /** Steps thrown away, by reason. */
  rejectedGap: number;
  rejectedRatio: number;
  rejectedBackwards: number;
  /** The widest and narrowest single-step ratio that was accepted. */
  minStepRatio: number | null;
  maxStepRatio: number | null;
  /*
     A third clock, and the one that decides the argument.

     Audio frames actually delivered, divided by the nominal rate, is how much
     audio the device thinks it produced. Compare it against the other two:

       tracks wall time but not currentTime -> currentTime is the broken one
       tracks currentTime but not wall time -> the device's crystal really is
                                               off by this much

     Every rate the app reports is derived from the frame count, so the second
     case would put the same error into every measurement — which is testable
     against another machine, and was not seen.
  */
  frames: number;
  framesSeconds: number | null;
  framesDriftSecondsPerDay: number | null;
}

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
   Beyond this the figure is not offered without corroboration.

   A sound card's crystal is tens of parts per million out; a hundred is a poor
   one, and a couple of hundred is the worst thing that ships. Thirty seconds a
   day is 347 ppm, comfortably past anything real and comfortably short of what
   a broken run produces — an iPhone once reported -98.58 s/day, or 1,141 ppm,
   which is 72 ms of divergence over a 63-second run and is what an interrupted
   context looks like rather than a measurement.

   It may not always be wrong. On one iPhone, over two uninterrupted runs with
   no gaps rejected, this read -855 to -945 ppm consistently — and the frame
   count divided by the nominal rate came out exactly equal to
   AudioContext.currentTime, which means currentTime carries no information
   this method does not already have. Frames delivered against wall time cannot
   distinguish a slow crystal from frames going missing; both look the same.

   So the bound is not a claim that the run was broken. It is a refusal to
   apply a correction of that size on the strength of one method that cannot
   tell those two apart. The quartz reference can, because it is a physical
   one.
*/
export const MAX_PLAUSIBLE_DRIFT = 30;

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
  private rejectedGap = 0;
  private rejectedRatio = 0;
  private rejectedBackwards = 0;
  private minStepRatio: number | null = null;
  private maxStepRatio: number | null = null;
  private frameTotal = 0;

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
    this.rejectedGap = 0;
    this.rejectedRatio = 0;
    this.rejectedBackwards = 0;
    this.minStepRatio = null;
    this.maxStepRatio = null;
    this.frameTotal = 0;
  }

  /**
   * `audioTime` is AudioContext.currentTime; `wallMs` is performance.now();
   * `frames` is how many samples this block carried, counted only when the
   * step is accepted so all three clocks span the same intervals.
   */
  sample(audioTime: number, wallMs: number, frames = 0): void {
    if (this.lastAudio !== null && this.lastWall !== null) {
      const stepAudio = audioTime - this.lastAudio;
      const stepWall = (wallMs - this.lastWall) / 1000;

      if (stepAudio <= 0 || stepWall <= 0) {
        this.rejectedBackwards++;
      } else if (stepWall > MAX_STEP_SECONDS) {
        this.rejectedGap++;
      } else if (Math.abs(stepAudio / stepWall - 1) > MAX_STEP_ERROR) {
        this.rejectedRatio++;
      } else {
        const r = stepAudio / stepWall;
        if (this.minStepRatio === null || r < this.minStepRatio) this.minStepRatio = r;
        if (this.maxStepRatio === null || r > this.maxStepRatio) this.maxStepRatio = r;
        this.audioTotal += stepAudio;
        this.wallTotal += stepWall;
        this.frameTotal += frames;
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

  /*
     The raw state of the fit, reported whether or not it produced something
     usable. This is the only view of a run that failed.
  */
  debug(sampleRate: number | null = null): ClockDebug {
    const fit = this.fit();
    const totalsRatio = this.wallTotal > 0 ? this.audioTotal / this.wallTotal : null;
    return {
      points: this.points.length,
      wallSeconds: this.wallTotal,
      audioSeconds: this.audioTotal,
      fittedRatio: fit ? fit.ratio : null,
      totalsRatio,
      fittedDriftSecondsPerDay: fit ? fit.driftSecondsPerDay : null,
      totalsDriftSecondsPerDay:
        totalsRatio === null ? null : (totalsRatio - 1) * SECONDS_PER_DAY,
      rejectedGap: this.rejectedGap,
      rejectedRatio: this.rejectedRatio,
      rejectedBackwards: this.rejectedBackwards,
      minStepRatio: this.minStepRatio,
      maxStepRatio: this.maxStepRatio,
      frames: this.frameTotal,
      framesSeconds: sampleRate ? this.frameTotal / sampleRate : null,
      framesDriftSecondsPerDay:
        sampleRate && this.wallTotal > 0
          ? (this.frameTotal / sampleRate / this.wallTotal - 1) * SECONDS_PER_DAY
          : null,
    };
  }

  /** Null until there is enough of a run to say anything honest. */
  result(): ClockResult | null {
    const r = this.fit();
    if (!r) return null;
    return Math.abs(r.driftSecondsPerDay) > MAX_PLAUSIBLE_DRIFT ? null : r;
  }

  /*
     There was enough of a run, and the answer it produced cannot be true.
     Distinguished from "not yet" so the operator is told the run was disturbed
     rather than being asked to wait for something that has already happened.
  */
  get disturbed(): boolean {
    const r = this.fit();
    return r !== null && Math.abs(r.driftSecondsPerDay) > MAX_PLAUSIBLE_DRIFT;
  }

  private fit(): ClockResult | null {
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
