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

/** Field order must match the second enum in wasm/bindings.c. */
const W_POINTS = 0;
const W_MS_BEFORE = 1;
const W_MS_AFTER = 2;
const W_PERIOD_SECONDS = 3;
const W_TIC_PULSE_MS = 4;
const W_TOC_PULSE_MS = 5;
const W_VALID = 6;

const MEASURE_INTERVAL_MS = 500;

interface WasmModule {
  _tgw_init(sampleRate: number, bph: number, liftAngle: number): number;
  _tgw_push(handle: number, ptr: number, count: number): void;
  _tgw_result(handle: number, ptr: number): void;
  _tgw_events(handle: number, timePtr: number, tictocPtr: number, max: number): number;
  _tgw_waveform(handle: number, ticPtr: number, tocPtr: number, infoPtr: number): number;
  _tgw_waveform_fields(): number;
  _tgw_waveform_points(): number;
  _tgw_reset(handle: number): void;
  _tgw_destroy(handle: number): void;
  _tgw_result_fields(): number;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
  HEAPU8: Uint8Array;
}

let mod: WasmModule | null = null;
let handle = 0;
let scratch = 0;
let scratchSamples = 0;
let resultPtr = 0;
let eventTimePtr = 0;
let eventTicTocPtr = 0;
let wfTicPtr = 0;
let wfTocPtr = 0;
let wfInfoPtr = 0;
let wfPoints = 0;

/** Matches EVENTS_MAX in core/tg_core.h. */
const MAX_EVENTS = 100;
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
    if (eventTimePtr) mod._free(eventTimePtr);
    if (eventTicTocPtr) mod._free(eventTicTocPtr);
    if (wfTicPtr) mod._free(wfTicPtr);
    if (wfTocPtr) mod._free(wfTocPtr);
    if (wfInfoPtr) mod._free(wfInfoPtr);
  }
  handle = 0;
  scratch = 0;
  scratchSamples = 0;
  resultPtr = 0;
  eventTimePtr = 0;
  eventTicTocPtr = 0;
  wfTicPtr = 0;
  wfTocPtr = 0;
  wfInfoPtr = 0;
  wfPoints = 0;
  samplesSeen = 0;
}

/*
   The averaged beat, windowed around the tick and the tock. Copied out of the
   wasm heap rather than viewed into it: the views are invalidated whenever the
   heap grows, and this crosses a postMessage boundary where a stale view would
   read freed memory.
*/
function readWaveform() {
  if (!mod || !handle) return null;
  if (!mod._tgw_waveform(handle, wfTicPtr, wfTocPtr, wfInfoPtr)) return null;

  const info = mod.HEAPF64;
  const base = wfInfoPtr >> 3;
  if (!info[base + W_VALID]) return null;

  const points = info[base + W_POINTS];
  const heap = mod.HEAPF32;
  return {
    tic: heap.slice(wfTicPtr >> 2, (wfTicPtr >> 2) + points),
    toc: heap.slice(wfTocPtr >> 2, (wfTocPtr >> 2) + points),
    msBefore: info[base + W_MS_BEFORE],
    msAfter: info[base + W_MS_AFTER],
    periodSeconds: info[base + W_PERIOD_SECONDS],
    // The core returns -1 for "no impulse found"; null reads better upstream.
    ticPulseMs: info[base + W_TIC_PULSE_MS] > 0 ? info[base + W_TIC_PULSE_MS] : null,
    tocPulseMs: info[base + W_TOC_PULSE_MS] > 0 ? info[base + W_TOC_PULSE_MS] : null,
  };
}

function emitMeasurement() {
  if (!mod || !handle) return;
  mod._tgw_result(handle, resultPtr);
  const base = resultPtr >> 3;
  const h = mod.HEAPF64;

  // Beat positions for the trace. Absolute seconds since capture started, so
  // the main thread can dedupe across the overlapping windows each call reports.
  const count = mod._tgw_events(handle, eventTimePtr, eventTicTocPtr, MAX_EVENTS);
  const times = new Float64Array(count);
  const isTick = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    times[i] = mod.HEAPF64[(eventTimePtr >> 3) + i];
    isTick[i] = mod.HEAPU8[eventTicTocPtr + i];
  }

  self.postMessage({
    type: 'result',
    beats: { times, isTick },
    waveform: readWaveform(),
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
        eventTimePtr = mod._malloc(MAX_EVENTS * 8);
        eventTicTocPtr = mod._malloc(MAX_EVENTS);
        wfPoints = mod._tgw_waveform_points();
        wfTicPtr = mod._malloc(wfPoints * 4);
        wfTocPtr = mod._malloc(wfPoints * 4);
        wfInfoPtr = mod._malloc(mod._tgw_waveform_fields() * 8);
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

      case 'reset':
        // Discards the core's ring buffer, so the next reading is built from
        // audio recorded after this point rather than from whatever noise the
        // operator just made moving the watch.
        if (mod && handle) {
          mod._tgw_reset(handle);
          samplesSeen = 0;
        }
        break;

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
