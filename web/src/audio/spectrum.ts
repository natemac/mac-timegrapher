/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   Where the energy is.

   One question only, and a cheap one: does this input carry the frequencies an
   escapement lives in? A microphone reached over Bluetooth is a voice channel,
   band-limited to roughly four or eight kilohertz — below the impulse. It looks
   perfectly healthy on a level meter and can never produce a reading, which is
   a day of guessing if nobody thinks to look at the spectrum.
*/

/** The two bands the check compares: speech, and where a tick actually is. */
export const VOICE_BAND = { from: 500, to: 2000 };
export const TICK_BAND = { from: 4000, to: 8000 };

/**
 * Mean level across a frequency band, in dB.
 *
 * `bins` is an AnalyserNode's `getFloatFrequencyData` output: one value per bin,
 * already in dB, spanning DC to half the sample rate. Bins outside the analyser's
 * range are ignored rather than clamped, so a band that falls entirely above
 * Nyquist returns -Infinity — which is the truth about it.
 */
export function bandLevelDb(
  bins: Float32Array,
  sampleRate: number,
  fftSize: number,
  from: number,
  to: number,
): number {
  const hzPerBin = sampleRate / fftSize;
  const first = Math.max(0, Math.ceil(from / hzPerBin));
  const last = Math.min(bins.length - 1, Math.floor(to / hzPerBin));
  if (last < first) return -Infinity;

  let sum = 0;
  let count = 0;
  for (let i = first; i <= last; i++) {
    const v = bins[i];
    // The analyser writes -Infinity for empty bins; averaging those in would
    // drag the whole band to -Infinity on one silent bin.
    if (Number.isFinite(v)) {
      sum += v;
      count++;
    }
  }
  return count === 0 ? -Infinity : sum / count;
}

/** A running mean, so a band can be averaged over a listening window. */
export class BandAverager {
  private sums = new Map<string, number>();
  private counts = new Map<string, number>();

  add(name: string, db: number): void {
    if (!Number.isFinite(db)) return;
    this.sums.set(name, (this.sums.get(name) ?? 0) + db);
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }

  mean(name: string): number {
    const count = this.counts.get(name) ?? 0;
    return count === 0 ? -Infinity : (this.sums.get(name) as number) / count;
  }
}
