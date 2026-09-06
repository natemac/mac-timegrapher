/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDeviceCheck, type CheckProgress, type CheckTimings } from './device-check-run';
import { STEPS, type StepId } from '../timegrapher/device-check';

/*
   The sequencing of the device check.

   The audio it runs on cannot be produced under test — jsdom has no capture
   path and no worklet — but the order the questions are asked in, what happens
   when one of them cannot be answered, and what a cancellation leaves behind
   are all decisions rather than measurements, and they are the parts a person
   reads off the screen while a phone they cannot hold is failing.
*/

const mocks = vi.hoisted(() => ({ startCapture: vi.fn(), destroy: vi.fn() }));

vi.mock('./audio-engine', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('./audio-engine')>();
  return { ...original, startCapture: mocks.startCapture };
});

// The engine runs in a Worker, which jsdom cannot start.
vi.mock('../timegrapher/tg-engine', () => ({
  TimegrapherEngine: {
    create: () => ({ push: vi.fn(), destroy: mocks.destroy, reset: vi.fn() }),
  },
}));

/** Milliseconds rather than half a minute, so a test can watch the whole run. */
const FAST: CheckTimings = {
  listenSeconds: 0.02,
  movementSeconds: 0.03,
  energySeconds: 0.01,
  streamMs: 5,
  beatMs: 0,
};

function fakeSession(over: Partial<Record<string, unknown>> = {}) {
  const analyser = {
    fftSize: 4096,
    frequencyBinCount: 2048,
    getFloatFrequencyData: (a: Float32Array) => a.fill(-100),
    disconnect: vi.fn(),
  };
  return {
    context: {
      state: 'running',
      currentTime: 0,
      sampleRate: 48_000,
      createAnalyser: () => analyser,
      createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    },
    stream: { getAudioTracks: () => [{ label: 'Bench pickup' }] },
    sampleRate: 48_000,
    requestedSampleRate: 48_000,
    warnings: [],
    settings: { deviceId: 'usb-1', echoCancellation: false, autoGainControl: false, noiseSuppression: false },
    capabilities: null,
    stop: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

function run(options: Partial<Parameters<typeof runDeviceCheck>[0]> = {}) {
  const seen: CheckProgress[] = [];
  const promise = runDeviceCheck({
    deviceId: 'usb-1',
    profile: 'ours',
    includeMovement: false,
    movement: { name: 'NH35', bph: 21600, liftAngle: 53 },
    clockDriftSecondsPerDay: 0,
    timings: FAST,
    onProgress: (p) => seen.push(p),
    ...options,
  });
  return { promise, seen };
}

/** The order steps were lit, ignoring the republishes in between. */
function litOrder(seen: CheckProgress[]): StepId[] {
  const order: StepId[] = [];
  for (const p of seen) {
    if (p.running && order[order.length - 1] !== p.running) order.push(p.running);
  }
  return order;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    configurable: true, value: class AudioWorkletNode {},
  });
  mocks.startCapture.mockResolvedValue(fakeSession());
});

describe('the order the check asks its questions in', () => {
  it('works down the list without skipping about', async () => {
    const { promise, seen } = run();
    await promise;
    const lit = litOrder(seen);
    const expected = STEPS.filter((s) => s.group !== 'movement').map((s) => s.id);
    expect(lit).toEqual(expected);
  });

  it('lights exactly one step at a time', async () => {
    const { promise, seen } = run();
    await promise;
    for (const p of seen) {
      expect(p.results.filter((r) => r.state === 'running').length).toBeLessThanOrEqual(1);
    }
  });

  it('includes the movement steps, last, when they are asked for', async () => {
    const { promise, seen } = run({ includeMovement: true });
    await promise;
    expect(litOrder(seen).slice(-3)).toEqual(['energy', 'beat', 'analysis']);
  });

  it('leaves the movement steps skipped when they are not', async () => {
    const { promise } = run();
    const report = await promise;
    for (const id of ['energy', 'beat', 'analysis'] as StepId[]) {
      expect(report.results.find((r) => r.id === id)!.state).toBe('skipped');
    }
  });

  it('releases the input when it is done', async () => {
    const session = fakeSession();
    mocks.startCapture.mockResolvedValue(session);
    await run().promise;
    expect(session.stop).toHaveBeenCalled();
  });
});

describe('when the check cannot get started', () => {
  it('blames permission, not the device, when access is refused', async () => {
    const refused = new Error('denied');
    refused.name = 'NotAllowedError';
    mocks.startCapture.mockRejectedValue(refused);

    const report = await run().promise;
    expect(report.results.find((r) => r.id === 'permission')!.state).toBe('fail');
    expect(report.results.find((r) => r.id === 'input')!.state).toBe('skipped');
  });

  /* Permission was granted — the prompt was got past — and it is the device
     that could not be opened. Reporting that as a permission failure sends
     somebody into their browser settings for no reason. */
  it('blames the device when the device is the problem', async () => {
    const busy = new Error('in use');
    busy.name = 'NotReadableError';
    mocks.startCapture.mockRejectedValue(busy);

    const report = await run().promise;
    expect(report.results.find((r) => r.id === 'permission')!.state).toBe('pass');
    const input = report.results.find((r) => r.id === 'input')!;
    expect(input.state).toBe('fail');
    expect(input.detail).toMatch(/Another application/);
  });

  it('stops at the browser when the page is not on a secure connection', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    const report = await run().promise;
    expect(report.results.find((r) => r.id === 'browser')!.state).toBe('fail');
    expect(mocks.startCapture).not.toHaveBeenCalled();
    expect(report.results.find((r) => r.id === 'timing')!.state).toBe('skipped');
  });

  /* Nothing may be left reading as a result it never reached. A row that was
     not asked is not a row that passed. */
  it('never leaves an unreached step looking like an answer', async () => {
    const refused = new Error('denied');
    refused.name = 'NotAllowedError';
    mocks.startCapture.mockRejectedValue(refused);

    const report = await run().promise;
    for (const r of report.results) {
      expect(r.state).not.toBe('pending');
      expect(r.state).not.toBe('running');
    }
  });
});

describe('cancelling', () => {
  it('stops the run and marks what it never reached', async () => {
    const controller = new AbortController();
    const { promise, seen } = run({ signal: controller.signal });
    // Let it get past the first couple of steps, then pull the plug.
    await new Promise((r) => setTimeout(r, 8));
    controller.abort();
    const report = await promise;

    expect(report.results.some((r) => r.state === 'skipped')).toBe(true);
    expect(report.results.every((r) => r.state !== 'running')).toBe(true);
    expect(seen.at(-1)!.running).toBeNull();
  });

  it('releases the input rather than leaving it open', async () => {
    const session = fakeSession();
    mocks.startCapture.mockResolvedValue(session);
    const controller = new AbortController();
    const { promise } = run({ signal: controller.signal });
    await new Promise((r) => setTimeout(r, 8));
    controller.abort();
    await promise;
    expect(session.stop).toHaveBeenCalled();
  });
});

describe('the report it hands back', () => {
  it('records what the browser granted, verbatim', async () => {
    const report = await run().promise;
    expect(report.deviceLabel).toBe('Bench pickup');
    expect(report.sampleRate).toBe(48_000);
    expect(report.grantedSettings).toMatchObject({ deviceId: 'usb-1' });
  });

  it('carries a result for every step in the list', async () => {
    const report = await run({ includeMovement: true }).promise;
    expect(report.results.map((r) => r.id)).toEqual(STEPS.map((s) => s.id));
  });
});
