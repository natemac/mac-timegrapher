/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.

    Runs the same WAV through the WebAssembly build and the native command-line
    build and compares them.

    This is the check that matters for the port: both link the identical C, so
    any disagreement is a bug in the wasm build — a memory-layout problem, a
    truncated heap copy, a float-width mismatch — rather than a question about
    which implementation is correct. The numbers should not merely be close.
    They should be equal to display precision.

    Run from the repository root, after wasm/build-wasm.sh and
    make -f Makefile.core:

      node tests/compare-wasm-native.mjs FILE.wav [FILE.wav ...]
*/

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Minimal 32-bit float WAV reader — enough for our own fixtures. */
function readWav(path) {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ascii = (o, n) => String.fromCharCode(...new Uint8Array(buf.buffer, buf.byteOffset + o, n));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error(`${path}: not RIFF/WAVE`);

  let sampleRate = 0, channels = 1, bits = 0, format = 0, samples = null;
  let o = 12;
  while (o + 8 <= buf.byteLength) {
    const id = ascii(o, 4);
    const size = view.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      const n = Math.floor(size / 4);
      samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = view.getFloat32(body + i * 4, true);
    }
    o = body + size + (size % 2);
  }
  if (format !== 3 || bits !== 32) throw new Error(`${path}: expected 32-bit float, got format ${format}/${bits}`);
  if (!samples) throw new Error(`${path}: no data chunk`);

  /* Downmix, matching tg_wav.c. */
  if (channels > 1) {
    const frames = Math.floor(samples.length / channels);
    const mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let acc = 0;
      for (let c = 0; c < channels; c++) acc += samples[i * channels + c];
      mono[i] = acc / channels;
    }
    samples = mono;
  }
  return { samples, sampleRate };
}

async function runWasm(mod, { samples, sampleRate }, bph, lift) {
  const handle = mod._tgw_init(sampleRate, bph, lift);
  if (!handle) throw new Error('tgw_init returned null');

  /* Push in chunks so the copy path matches how the app feeds it. */
  const CHUNK = 2048;
  const buf = mod._malloc(CHUNK * 4);
  for (let i = 0; i < samples.length; i += CHUNK) {
    const slice = samples.subarray(i, Math.min(i + CHUNK, samples.length));
    mod.HEAPF32.set(slice, buf >> 2);
    mod._tgw_push(handle, buf, slice.length);
  }
  mod._free(buf);

  const fields = mod._tgw_result_fields();
  const out = mod._malloc(fields * 8);
  mod._tgw_result(handle, out);
  const r = Array.from({ length: fields }, (_, i) => mod.HEAPF64[(out >> 3) + i]);
  mod._free(out);

  /* Beat events, exercised here because the browser trace depends on them and
     nothing else in this suite touches HEAPU8. Leaving them untested let a
     missing EXPORTED_RUNTIME_METHODS entry ship: the TypeScript interface
     declared HEAPU8, so the compiler was satisfied while the runtime had no
     such view, and every measurement threw. */
  const MAX_EVENTS = 100;
  const timePtr = mod._malloc(MAX_EVENTS * 8);
  const ticPtr = mod._malloc(MAX_EVENTS);
  const count = mod._tgw_events(handle, timePtr, ticPtr, MAX_EVENTS);
  const beats = [];
  for (let i = 0; i < count; i++) {
    beats.push({ time: mod.HEAPF64[(timePtr >> 3) + i], isTick: mod.HEAPU8[ticPtr + i] === 1 });
  }
  mod._free(timePtr);
  mod._free(ticPtr);

  mod._tgw_destroy(handle);

  const [rate, amplitude, beatError, detectedBph, signalQuality, valid] = r;
  return { rate, amplitude, beatError, detectedBph, signalQuality, valid: !!valid, beats };
}

function runNative(path, bph, lift) {
  const args = ['--json'];
  if (bph) args.push('--bph', String(bph));
  args.push('--lift', String(lift), path);
  try {
    return JSON.parse(execFileSync(join(ROOT, 'tg-process'), args, { encoding: 'utf8' }));
  } catch (e) {
    if (e.stdout) return JSON.parse(e.stdout); // exit 3 means "no valid reading"
    throw e;
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node tests/compare-wasm-native.mjs FILE.wav [...]');
  process.exit(2);
}

const factory = (await import(join(ROOT, 'wasm/build/node/tg-core.js'))).default;
const mod = await factory();

console.log(`wasm vs native — ${mod.UTF8ToString(mod._tgw_version())}\n`);

let fail = 0;
for (const f of files) {
  const wav = readWav(f);
  const bph = 0;
  const lift = 52;

  const w = await runWasm(mod, wav, bph, lift);
  const n = runNative(f, bph, lift);

  /* Display precision: 0.1 s/day, 0.01 ms, 1 degree. Anything larger is a
     real disagreement, not rounding. */
  const checks = [
    ['bph', w.detectedBph, n.detectedBph, 0],
    ['rate', w.rate, n.rate, 0.05],
    ['amplitude', w.amplitude, n.amplitude, 0.5],
    ['beatError', w.beatError, n.beatError, 0.005],
  ];

  const bad = checks.filter(([, a, b, tol]) => Math.abs(a - b) > tol);

  /* A valid reading must come with beats, and they must be ordered and inside
     the recording. An empty list means the core located no events at all —
     which is what happens when events_from is left at zero. */
  if (w.valid) {
    if (w.beats.length === 0) bad.push(['beats', 0, '>0', 0]);
    else {
      const ordered = w.beats.every((b, i) => i === 0 || b.time >= w.beats[i - 1].time);
      const inRange = w.beats.every((b) => b.time >= 0 && b.time <= wav.samples.length / wav.sampleRate + 1);
      const bothKinds = w.beats.some((b) => b.isTick) && w.beats.some((b) => !b.isTick);
      if (!ordered) bad.push(['beats ordered', 'no', 'yes', 0]);
      if (!inRange) bad.push(['beats in range', 'no', 'yes', 0]);
      if (!bothKinds) bad.push(['ticks and tocks', 'no', 'yes', 0]);
    }
  }
  const status = bad.length === 0 ? 'ok  ' : 'FAIL';
  if (bad.length) fail++;

  console.log(
    `${status} ${f.split('/').pop().padEnd(30)} ` +
    `bph ${String(w.detectedBph).padStart(5)}  ` +
    `rate ${w.rate.toFixed(2).padStart(7)}  ` +
    `amp ${w.amplitude.toFixed(0).padStart(4)}  ` +
    `be ${w.beatError.toFixed(3)}  ` +
    `beats ${String(w.beats.length).padStart(3)}`
  );
  for (const [name, a, b] of bad) {
    console.log(`       ${name}: wasm ${a} vs native ${b}`);
  }
}

console.log(`\n${files.length - fail} matched, ${fail} differed`);
process.exit(fail === 0 ? 0 : 1);
