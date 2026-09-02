/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   Turning a level meter into something a person can read.

   A watch tick is a transient a few milliseconds long. A raw per-block peak of
   that signal is, correctly, a spiky mess — it is measuring exactly what is
   there. But a number redrawn twenty-three times a second cannot be read, and
   a bar that jumps the full width and back tells the operator nothing.

   Hardware meters solved this decades ago with ballistics: rise fast so a
   transient is not missed, fall slowly so the eye can follow. The same idea
   applies here, plus a peak marker that holds and then drifts down.

   What the operator actually needs to know is not the absolute level — a
   contact microphone's output depends on how hard it is pressed — but whether
   the tick stands clear of the room. That is the ratio between the peaks and
   the noise floor between them, which is what `strength` reports.
*/

export type SignalStrength = 'none' | 'weak' | 'fair' | 'good' | 'excellent';

export interface SignalState {
  /** Smoothed level for the bar, 0..1 linear. */
  level: number;
  /** Peak marker, holds then decays. 0..1 linear. */
  peakHold: number;
  /** dBFS of the smoothed level, for the numeric readout. */
  levelDb: number;
  /** How far the ticks stand above the floor, in dB. */
  headroomDb: number;
  /*
     The floor itself, in dBFS. headroomDb is a difference, so a quiet input
     with a quiet floor and a loud one with a loud floor look identical through
     it — and telling those apart is the whole question when a device delivers
     a signal too small to lock onto.
  */
  floorDb: number;
  strength: SignalStrength;
  clipped: boolean;
  /*
     Close enough to full scale that a louder-than-usual tick will clip. Kept
     apart from `strength`, which measures how far the ticks stand above the
     room — the two are independent, and the case that prompted this was a
     signal with excellent headroom sitting one decibel below clipping.
  */
  hot: boolean;
}

const SILENT: SignalState = {
  level: 0,
  peakHold: 0,
  levelDb: -Infinity,
  headroomDb: 0,
  floorDb: -Infinity,
  strength: 'none',
  clipped: false,
  hot: false,
};

/**
 * Attack and release in seconds. Fast attack catches the tick; the long
 * release is what stops the bar flickering.
 */
const ATTACK = 0.01;
const RELEASE = 0.35;
/** The peak marker sits still for a moment, then sinks. */
const PEAK_HOLD = 1.2;
const PEAK_FALL = 0.4;

/** Below this the input is silent rather than quiet. */
const NOISE_FLOOR_DB = -75;

/*
   Above this there is not enough room left for a transient. A well-set input
   peaks around -12 to -6 dBFS; the MacBook that prompted this ran at -1.1
   while two iOS devices on the same pickup sat at -6.3 and -7.5, so this
   separates a hot host from a normal one with room to spare either side.
*/
const HOT_DB = -3;

export class SignalMeter {
  private level = 0;
  private peak = 0;
  private peakAge = 0;
  private floor = 0;
  private seeded = false;
  private clipLatch = 0;

  reset(): void {
    this.level = 0;
    this.peak = 0;
    this.peakAge = 0;
    this.floor = 0;
    this.seeded = false;
    this.clipLatch = 0;
  }

  /**
   * Folds one block in. `dt` is the block's duration in seconds, so the
   * ballistics behave the same regardless of block size or sample rate.
   */
  push(block: Float32Array, dt: number): SignalState {
    if (block.length === 0) return this.state();

    let blockPeak = 0;
    let sumSquares = 0;
    for (let i = 0; i < block.length; i++) {
      const s = block[i];
      const a = s < 0 ? -s : s;
      if (a > blockPeak) blockPeak = a;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / block.length);

    // One-pole smoothing, with a different coefficient each way.
    const coeff = blockPeak > this.level
      ? 1 - Math.exp(-dt / ATTACK)
      : 1 - Math.exp(-dt / RELEASE);
    this.level += (blockPeak - this.level) * coeff;

    if (blockPeak >= this.peak) {
      this.peak = blockPeak;
      this.peakAge = 0;
    } else {
      this.peakAge += dt;
      if (this.peakAge > PEAK_HOLD) {
        this.peak *= Math.exp(-(dt / PEAK_FALL));
      }
    }

    // The floor tracks the quiet between ticks: it follows RMS downward
    // quickly and upward slowly, so a passing transient does not raise it.
    //
    // Seeded from the first block rather than starting at zero. Climbing from
    // zero with a six-second constant means the floor reads far too low for
    // the first several seconds, and signal strength reports "excellent" on
    // input that is actually marginal — the worst moment to be optimistic,
    // since that is exactly when the operator is still positioning the sensor.
    if (!this.seeded && rms > 0) {
      this.floor = rms;
      this.seeded = true;
    } else {
      // Two seconds up, half a second down. A tick occupies a few percent of a
      // two-second window so it cannot drag the floor with it, but the floor
      // still settles fast enough to be honest while the sensor is being
      // positioned. Six seconds, tried first, left it reading "excellent" on
      // marginal input for the first several seconds.
      const floorCoeff = rms < this.floor ? 1 - Math.exp(-dt / 0.5) : 1 - Math.exp(-dt / 2);
      this.floor += (rms - this.floor) * floorCoeff;
    }

    // Clipping latches briefly so a single clipped sample is still noticed.
    if (blockPeak >= 1) this.clipLatch = 1.5;
    else this.clipLatch = Math.max(0, this.clipLatch - dt);

    return this.state();
  }

  private state(): SignalState {
    if (this.level <= 0) return SILENT;

    const levelDb = 20 * Math.log10(this.level);
    if (levelDb < NOISE_FLOOR_DB) return SILENT;

    const floorDb = this.floor > 0 ? 20 * Math.log10(this.floor) : NOISE_FLOOR_DB;
    const headroomDb = levelDb - floorDb;

    return {
      level: this.level,
      peakHold: this.peak,
      levelDb,
      headroomDb,
      floorDb,
      strength: classify(headroomDb, levelDb),
      clipped: this.clipLatch > 0,
      hot: levelDb > HOT_DB,
    };
  }
}

/**
 * Thresholds are in dB of tick-above-floor. Below about 6 dB the detector has
 * little to work with; above roughly 20 dB the ticks are unmistakable.
 */
function classify(headroomDb: number, levelDb: number): SignalStrength {
  if (levelDb < -60) return 'none';
  if (headroomDb < 6) return 'weak';
  if (headroomDb < 12) return 'fair';
  if (headroomDb < 20) return 'good';
  return 'excellent';
}
