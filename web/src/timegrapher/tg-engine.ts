/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

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

/** One detected beat: when it happened, and whether it was a tick or a tock. */
export interface Beat {
  /** Seconds since capture started. */
  time: number;
  isTick: boolean;
}

/**
 * The averaged beat, windowed around the tick and around the tock.
 *
 * Each array is an envelope of one window, 0 at the baseline, scaled so that
 * the tallest feature in the whole beat reads 0.4 — upstream's headroom
 * factor, kept so the curve has the same proportions as the GTK panel's.
 */
export interface BeatWaveform {
  tic: Float32Array;
  toc: Float32Array;
  /** Window extent either side of the beat, in milliseconds. */
  msBefore: number;
  msAfter: number;
  /** One beat, in seconds. The degrees scale is derived from it. */
  periodSeconds: number;
  /** Impulse, milliseconds before the beat. null when the core found none. */
  ticPulseMs: number | null;
  tocPulseMs: number | null;
}

/*
   A clock check in progress, or its result.
 
   `state` is 0 while collecting, 1 once the fit has been accepted, and -1 when
   it finished but was too noisy to trust. `signal` is 0..4 — how well the
   once-a-second tick is locked, which is the only feedback there is during a
   run that takes a quarter of an hour.
*/
export interface Calibration {
  collected: number;
  needed: number;
  signal: number;
  state: number;
  driftSecondsPerDay: number;
}

export interface EngineOptions {
  sampleRate: number;
  /** 0 to detect the beat rate automatically. */
  bph: number;
  liftAngle: number;
  onMeasurement: (
    m: Measurement,
    secondsCaptured: number,
    beats: Beat[],
    waveform: BeatWaveform | null,
  ) => void;
  onError: (message: string) => void;
  /** Progress of a clock check, about once a second while one is running. */
  onCalibration?: (c: Calibration, secondsCaptured: number) => void;
}

/**
 * Handle on the measurement engine, which runs in a Worker.
 *
 * The analysis re-runs over a sixteen-second window through seven FFTs each
 * time. On the main thread that blocks rendering long enough to see, so the
 * work happens off-thread and results arrive by callback. Nothing here waits
 * on the engine — push() returns immediately.
 */
export class TimegrapherEngine {
  private worker: Worker | null;
  private readonly onMeasurement: EngineOptions['onMeasurement'];
  private readonly onError: EngineOptions['onError'];
  private readonly onCalibration: EngineOptions['onCalibration'];

  private constructor(worker: Worker, options: EngineOptions) {
    this.worker = worker;
    this.onMeasurement = options.onMeasurement;
    this.onError = options.onError;
    this.onCalibration = options.onCalibration;

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'result') {
        const { times, isTick } = msg.beats as { times: Float64Array; isTick: Uint8Array };
        const beats: Beat[] = new Array(times.length);
        for (let i = 0; i < times.length; i++) beats[i] = { time: times[i], isTick: isTick[i] === 1 };
        this.onMeasurement(msg.measurement, msg.secondsCaptured, beats, msg.waveform ?? null);
      }
      else if (msg.type === 'calibration') {
        this.onCalibration?.(msg.calibration, msg.secondsCaptured);
      }
      else if (msg.type === 'error') this.onError(msg.message);
    };
    worker.onerror = () => this.onError('The measurement engine stopped unexpectedly.');
  }

  static create(options: EngineOptions): TimegrapherEngine {
    const worker = new Worker(new URL('./tg-worker.ts', import.meta.url), { type: 'module' });
    const engine = new TimegrapherEngine(worker, options);
    worker.postMessage({
      type: 'init',
      sampleRate: options.sampleRate,
      bph: options.bph,
      liftAngle: options.liftAngle,
    });
    return engine;
  }

  /**
   * Hands a block of mono samples to the engine.
   *
   * The block is copied by structured clone rather than transferred: the
   * caller still needs it for the level meter, the waveform and the recorder,
   * and transferring would detach it out from under them. At roughly 8 KB
   * every 43 ms the copy is not worth avoiding.
   */
  push(block: Float32Array): void {
    this.worker?.postMessage({ type: 'push', samples: block });
  }

  /**
   * Discards the audio collected so far, keeping the engine and the microphone.
   * The next reading is built entirely from what arrives after this call.
   */
  reset(): void {
    this.worker?.postMessage({ type: 'reset' });
  }

  /*
     Starts a clock check against a quartz reference. Measurement stops while
     it runs: the thing on the sensor is a quartz watch, and readings taken
     from it would not be readings of anything.
  */
  startClockCheck(): void {
    this.worker?.postMessage({ type: 'calibrate-start' });
  }

  /** Abandons or finishes a clock check and resumes measuring. */
  stopClockCheck(): void {
    this.worker?.postMessage({ type: 'calibrate-stop' });
  }

  /** Stops the engine and frees the wasm heap behind it. */
  destroy(): void {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'destroy' });
    this.worker.terminate();
    this.worker = null;
  }
}
