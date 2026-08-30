/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   The measurement engine runs here, off the main thread.

   Each analysis re-runs process() over up to four windows, the longest being
   sixteen seconds of audio through seven FFTs. On the main thread that blocks
   rendering for long enough to see: the waveform and the level meter visibly
   stutter once readings start. Here it costs the UI nothing.

   The worker owns its own timer rather than being polled, so the main thread
   never waits on an analysis — it pushes samples and receives results.
*/

// @ts-expect-error - emscripten output ships no type declarations
import createModule from '../wasm/tg-core.js';

/** Field order must match the enum in wasm/bindings.c. */
const R_RATE = 0;
const R_AMPLITUDE = 1;
const R_BEAT_ERROR = 2;
const R_DETECTED_BPH = 3;
const R_SIGNAL_QUALITY = 4;
const R_VALID = 5;

const MEASURE_INTERVAL_MS = 500;

interface WasmModule {
  _tgw_init(sampleRate: number, bph: number, liftAngle: number): number;
  _tgw_push(handle: number, ptr: number, count: number): void;
  _tgw_result(handle: number, ptr: number): void;
  _tgw_destroy(handle: number): void;
  _tgw_result_fields(): number;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
}

let mod: WasmModule | null = null;
let handle = 0;
let scratch = 0;
let scratchSamples = 0;
let resultPtr = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let sampleRate = 0;
let samplesSeen = 0;

function release() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  if (mod && handle) {
    mod._tgw_destroy(handle);
    if (scratch) mod._free(scratch);
    if (resultPtr) mod._free(resultPtr);
  }
  handle = 0;
  scratch = 0;
  scratchSamples = 0;
  resultPtr = 0;
  samplesSeen = 0;
}

function emitMeasurement() {
  if (!mod || !handle) return;
  mod._tgw_result(handle, resultPtr);
  const base = resultPtr >> 3;
  const h = mod.HEAPF64;
  self.postMessage({
    type: 'result',
    measurement: {
      rate: h[base + R_RATE],
      amplitude: h[base + R_AMPLITUDE],
      beatError: h[base + R_BEAT_ERROR],
      detectedBph: h[base + R_DETECTED_BPH],
      signalQuality: h[base + R_SIGNAL_QUALITY],
      valid: h[base + R_VALID] !== 0,
    },
    secondsCaptured: sampleRate > 0 ? samplesSeen / sampleRate : 0,
  });
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'init': {
        release();
        mod ??= (await createModule()) as WasmModule;
        sampleRate = msg.sampleRate;
        handle = mod._tgw_init(msg.sampleRate, msg.bph, msg.liftAngle);
        if (!handle) {
          self.postMessage({
            type: 'error',
            message:
              `The measurement core rejected these settings ` +
              `(${msg.sampleRate} Hz, ${msg.bph || 'auto'} bph, ${msg.liftAngle}° lift angle).`,
          });
          return;
        }
        resultPtr = mod._malloc(mod._tgw_result_fields() * 8);
        timer = setInterval(emitMeasurement, MEASURE_INTERVAL_MS);
        self.postMessage({ type: 'ready' });
        break;
      }

      case 'push': {
        if (!mod || !handle) return;
        const block = msg.samples as Float32Array;

        if (block.length > scratchSamples) {
          if (scratch) mod._free(scratch);
          scratchSamples = block.length;
          scratch = mod._malloc(scratchSamples * 4);
        }
        // Re-read HEAPF32 every time: the view is replaced whenever the wasm
        // heap grows, and a cached one writes into freed memory.
        mod.HEAPF32.set(block, scratch >> 2);
        mod._tgw_push(handle, scratch, block.length);
        samplesSeen += block.length;
        break;
      }

      case 'destroy':
        release();
        break;
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'The measurement engine failed.',
    });
  }
};
