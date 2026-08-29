/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
 * Generates a synthetic watch signal as a 32-bit float WAV.
 *
 * What this is for: proving the plumbing of the DSP core before any real
 * recording exists. A synthetic signal has an exactly known beat period and
 * beat error, so BPH detection, period estimation and beat-error calculation
 * can be checked against ground truth rather than against "that looks about
 * right".
 *
 * What it is NOT for: validating amplitude. Amplitude is derived from the
 * shape of a real escapement's impulse — the unlocking, impulse and drop
 * phases and their relative energies. This generator emits a damped sine
 * burst, which has none of that structure. Amplitude figures from synthetic
 * input are meaningless and must not be asserted on.
 *
 * Run from web/:
 *   npx vite-node tools/make-synthetic-fixture.mjs -- --bph 21600 --rate 7.2
 */

import { writeFileSync } from 'node:fs';
import { encodeWavFloat32 } from '../src/audio/wav-recorder.ts';

const SECONDS_PER_DAY = 86_400;

function parseArgs(argv) {
  const opts = {
    bph: 21600,          // beats per hour; 21600 = NH35
    rate: 0,             // seconds per day, + is fast
    beatError: 0,        // milliseconds
    seconds: 30,
    sampleRate: 48000,
    noise: 0.002,        // RMS of the noise floor, linear
    amplitude: 0.35,     // peak of each impulse, linear
    decayMs: 3,          // impulse decay time constant
    ringHz: 3000,        // impulse ring frequency
    // Tick and tock must not be identical. A real escapement's two beats have
    // different acoustic signatures, and that difference is what lets the
    // algorithm tell them apart. With tockRatio at 1.0 a 21,600 bph movement
    // with small beat error is genuinely indistinguishable from a uniform
    // 43,200 bph train, and BPH detection lands on the latter — correctly.
    tockRatio: 0.7,      // tock amplitude relative to tick
    tockRingRatio: 0.8,  // tock ring frequency relative to tick
    out: null,
    seed: 1,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in opts)) throw new Error(`Unknown option: ${argv[i]}`);
    opts[key] = key === 'out' ? argv[i + 1] : Number(argv[i + 1]);
  }
  return opts;
}

/** Deterministic PRNG so a given seed always produces the same fixture. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One escapement impulse: a sharp onset with exponential decay. Crude next to
 * a real tick, but it gives the detector an unambiguous transient to latch on.
 */
function addImpulse(buf, startSample, { sampleRate, amplitude, decayMs, ringHz }, rand) {
  const decay = (decayMs / 1000) * sampleRate;
  const length = Math.min(Math.ceil(decay * 6), buf.length - startSample);
  for (let i = 0; i < length; i++) {
    const idx = startSample + i;
    if (idx < 0 || idx >= buf.length) continue;
    const envelope = Math.exp(-i / decay);
    // A little jitter per impulse so every tick is not bit-identical.
    const ring = Math.sin((2 * Math.PI * ringHz * i) / sampleRate + rand() * 0.05);
    buf[idx] += amplitude * envelope * ring;
  }
}

export function synthesise(opts) {
  const { bph, rate, beatError, seconds, sampleRate, noise } = opts;
  const rand = mulberry32(opts.seed);
  const total = Math.round(seconds * sampleRate);
  const buf = new Float32Array(total);

  for (let i = 0; i < total; i++) buf[i] = (rand() * 2 - 1) * noise;

  // BPH counts *beats*, and one full oscillation is two beats — a tick and a
  // tock. So a 21,600 bph movement ticks 3 times a second, not 6, with a tock
  // between each pair. tg encodes the same relationship as bph = 7200/period,
  // where period is the tick-to-tick time in seconds.
  //
  // Getting this wrong produces a signal at exactly twice the intended beat
  // rate, which the algorithm then reports correctly and confusingly.
  const nominalCycle = 7200 / bph;

  // A watch gaining `rate` seconds a day completes each oscillation
  // proportionally sooner, so the period shrinks.
  const beatPeriod = nominalCycle * (SECONDS_PER_DAY / (SECONDS_PER_DAY + rate));

  // Beat error is the asymmetry between the tick-to-tock and tock-to-tick
  // intervals. Displacing every tock by `beatError` ms from the midpoint
  // produces exactly that asymmetry.
  const tockOffset = beatPeriod / 2 + beatError / 1000;

  const tockOpts = {
    ...opts,
    amplitude: opts.amplitude * opts.tockRatio,
    ringHz: opts.ringHz * opts.tockRingRatio,
  };

  let beatIndex = 0;
  for (let t = 0; t < seconds; t += beatPeriod, beatIndex++) {
    addImpulse(buf, Math.round(t * sampleRate), opts, rand);
    addImpulse(buf, Math.round((t + tockOffset) * sampleRate), tockOpts, rand);
  }

  return { samples: buf, sampleRate, channelCount: 1, beatPeriod, beatIndex };
}

const opts = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
const { samples, sampleRate, channelCount, beatPeriod } = synthesise(opts);
const name =
  opts.out ??
  `synthetic-${opts.bph}bph-rate${opts.rate >= 0 ? '+' : ''}${opts.rate}-be${opts.beatError}.wav`;

writeFileSync(name, Buffer.from(encodeWavFloat32({ samples, sampleRate, channelCount })));

console.log(`wrote ${name}`);
console.log(`  bph            ${opts.bph}`);
console.log(`  rate           ${opts.rate >= 0 ? '+' : ''}${opts.rate} s/day`);
console.log(`  beat error     ${opts.beatError} ms`);
console.log(`  beat period    ${(beatPeriod * 1000).toFixed(4)} ms`);
console.log(`  duration       ${opts.seconds} s at ${sampleRate} Hz`);
console.log('  amplitude      not meaningful — synthetic impulse, do not assert on it');
