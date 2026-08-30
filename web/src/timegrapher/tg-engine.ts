/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
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

export interface Measurement {
  /** Seconds per day; positive is fast. */
  rate: number;
  /** Degrees. 0 when the core could not determine it. */
  amplitude: number;
  /** Milliseconds. */
  beatError: number;
  detectedBph: number;
  /** 0..1 — the fraction of analysis windows that converged. */
  signalQuality: number;
  /** False until there is a measurement worth showing. */
  valid: boolean;
}

interface WasmModule {
  _tgw_init(sampleRate: number, bph: number, liftAngle: number): number;
  _tgw_push(handle: number, ptr: number, count: number): void;
  _tgw_result(handle: number, ptr: number): void;
  _tgw_reset(handle: number): void;
  _tgw_destroy(handle: number): void;
  _tgw_version(): number;
  _tgw_result_fields(): number;
  _malloc(bytes: number): number;
  _free(ptr: number): void;
  UTF8ToString(ptr: number): string;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;
}

let modulePromise: Promise<WasmModule> | null = null;

/** Loads the WebAssembly core once and shares it across engines. */
function loadModule(): Promise<WasmModule> {
  modulePromise ??= createModule() as Promise<WasmModule>;
  return modulePromise;
}

export interface EngineOptions {
  sampleRate: number;
  /** 0 to detect the beat rate automatically. */
  bph: number;
  liftAngle: number;
}

/**
 * A running measurement over live audio.
 *
 * The core keeps its own ring buffer of the last sixteen seconds, so blocks
 * are pushed as they arrive and results read whenever the UI wants one. The
 * analysis is not incremental: reading a result re-runs it over the whole
 * window, which is why it is called on a timer rather than per block.
 */
export class TimegrapherEngine {
  // Explicit fields rather than constructor parameter properties: this
  // project sets erasableSyntaxOnly, which rejects the shorthand.
  private readonly mod: WasmModule;
  private handle: number;
  private scratch: number;
  private scratchSamples: number;
  private readonly resultPtr: number;

  private constructor(
    mod: WasmModule,
    handle: number,
    scratch: number,
    scratchSamples: number,
    resultPtr: number,
  ) {
    this.mod = mod;
    this.handle = handle;
    this.scratch = scratch;
    this.scratchSamples = scratchSamples;
    this.resultPtr = resultPtr;
  }

  static async create(options: EngineOptions): Promise<TimegrapherEngine> {
    const mod = await loadModule();
    const handle = mod._tgw_init(options.sampleRate, options.bph, options.liftAngle);
    if (!handle) {
      throw new Error(
        `The measurement core rejected these settings ` +
        `(${options.sampleRate} Hz, ${options.bph || 'auto'} bph, ${options.liftAngle}° lift angle).`,
      );
    }
    const SCRATCH = 4096;
    const scratch = mod._malloc(SCRATCH * 4);
    const resultPtr = mod._malloc(mod._tgw_result_fields() * 8);
    return new TimegrapherEngine(mod, handle, scratch, SCRATCH, resultPtr);
  }

  static async version(): Promise<string> {
    const mod = await loadModule();
    return mod.UTF8ToString(mod._tgw_version());
  }

  /** Hands a block of mono samples to the core. */
  push(block: Float32Array): void {
    if (!this.handle) return;

    // Grow the shared scratch buffer rather than allocating per block.
    if (block.length > this.scratchSamples) {
      this.mod._free(this.scratch);
      this.scratchSamples = block.length;
      this.scratch = this.mod._malloc(this.scratchSamples * 4);
    }

    // HEAPF32 is re-read every time: the view is replaced whenever the wasm
    // heap grows, and a cached one silently writes into freed memory.
    this.mod.HEAPF32.set(block, this.scratch >> 2);
    this.mod._tgw_push(this.handle, this.scratch, block.length);
  }

  /** Runs the analysis over everything pushed so far. */
  measure(): Measurement {
    if (!this.handle) {
      return { rate: 0, amplitude: 0, beatError: 0, detectedBph: 0, signalQuality: 0, valid: false };
    }
    this.mod._tgw_result(this.handle, this.resultPtr);
    const base = this.resultPtr >> 3;
    const h = this.mod.HEAPF64;
    return {
      rate: h[base + R_RATE],
      amplitude: h[base + R_AMPLITUDE],
      beatError: h[base + R_BEAT_ERROR],
      detectedBph: h[base + R_DETECTED_BPH],
      signalQuality: h[base + R_SIGNAL_QUALITY],
      valid: h[base + R_VALID] !== 0,
    };
  }

  /** Discards accumulated audio, keeping the configuration. */
  reset(): void {
    if (this.handle) this.mod._tgw_reset(this.handle);
  }

  /** Frees the core's buffers and the seven FFTW plans behind them. */
  destroy(): void {
    if (!this.handle) return;
    this.mod._tgw_destroy(this.handle);
    this.mod._free(this.scratch);
    this.mod._free(this.resultPtr);
    this.handle = 0;
  }
}
