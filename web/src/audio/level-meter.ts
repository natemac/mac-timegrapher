/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

export interface LevelReading {
  /** Highest absolute sample in the block, linear. May exceed 1 when clipping. */
  peak: number;
  /** Root mean square of the block, linear. */
  rms: number;
  /** Peak in dBFS. -Infinity for silence. */
  peakDb: number;
  /** RMS in dBFS. -Infinity for silence. */
  rmsDb: number;
  /** True when any sample reached or exceeded full scale. */
  clipped: boolean;
}

export function toDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

export function measureLevel(block: Float32Array): LevelReading {
  let peak = 0;
  let sumSquares = 0;

  for (let i = 0; i < block.length; i++) {
    const sample = block[i];
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
    sumSquares += sample * sample;
  }

  const rms = block.length > 0 ? Math.sqrt(sumSquares / block.length) : 0;

  return { peak, rms, peakDb: toDb(peak), rmsDb: toDb(rms), clipped: peak >= 1 };
}
