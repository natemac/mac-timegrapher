/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import type { CaptureSession } from './audio/audio-engine';

const mocks = vi.hoisted(() => ({
  requestPermission: vi.fn(),
  listAudioInputs: vi.fn(),
  saveSelection: vi.fn(),
  loadSelection: vi.fn(),
  startCapture: vi.fn(),
}));

vi.mock('./audio/device-manager', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('./audio/device-manager')>();
  return {
    ...original,
    requestPermission: mocks.requestPermission,
    listAudioInputs: mocks.listAudioInputs,
    saveSelection: mocks.saveSelection,
    loadSelection: mocks.loadSelection,
  };
});

vi.mock('./audio/audio-engine', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('./audio/audio-engine')>();
  return { ...original, startCapture: mocks.startCapture };
});

// Canvas rendering is covered by the focused component and export tests. jsdom
// has no 2D canvas implementation; these tests only need the capture lifecycle.
vi.mock('./components/TraceCanvas', () => ({ TraceCanvas: () => null }));
vi.mock('./components/BeatCanvas', () => ({ BeatCanvas: () => null }));
vi.mock('./components/WaveformCanvas', () => ({ WaveformCanvas: () => null }));

async function reachTheToolbar(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: /Live Timing/ }));
  await user.click(screen.getByRole('button', { name: 'Grant Permission' }));
  return screen.findByRole('button', { name: 'Start readings' });
}

describe('capture startup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(globalThis, 'AudioWorkletNode', {
      configurable: true,
      value: class AudioWorkletNode {},
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    mocks.requestPermission.mockResolvedValue(undefined);
    mocks.listAudioInputs.mockResolvedValue([
      { deviceId: 'default', label: 'Bench pickup', groupId: 'bench' },
    ]);
    mocks.loadSelection.mockReturnValue(null);
  });

  it('stops a session that finishes opening after the operator returns home', async () => {
    let finishStart!: (session: CaptureSession) => void;
    mocks.startCapture.mockImplementation(() => new Promise((resolve) => { finishStart = resolve; }));
    const stop = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    const startButton = await reachTheToolbar(user);
    await user.click(startButton);
    await user.click(screen.getByRole('button', { name: 'Back to welcome' }));

    await act(async () => {
      finishStart({
        context: {} as AudioContext,
        stream: {} as MediaStream,
        sampleRate: 48_000,
        requestedSampleRate: 48_000,
        warnings: [],
        settings: {},
        capabilities: null,
        stop,
      });
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Live Timing/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause readings' })).not.toBeInTheDocument();
  });

  /*
     Permission belongs to the page, not to the screen. Giving it back on the
     way home would make every trip to the opening screen cost another browser
     prompt — and on iOS, another interruption of whatever was on the bench.
  */
  it('keeps microphone permission when the operator goes back and forth', async () => {
    mocks.startCapture.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();

    await reachTheToolbar(user);
    await user.click(screen.getByRole('button', { name: 'Back to welcome' }));
    await user.click(screen.getByRole('button', { name: /Inspection/ }));

    expect(await screen.findByRole('button', { name: 'Start readings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant Permission' })).not.toBeInTheDocument();
    expect(mocks.requestPermission).toHaveBeenCalledOnce();
  });
});
