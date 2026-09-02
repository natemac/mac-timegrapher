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

vi.mock('./export/snapshot', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('./export/snapshot')>();
  return { ...original, loadSnapshotLogo: vi.fn().mockResolvedValue(null) };
});

// Canvas rendering is covered by the focused component/export tests. jsdom has
// no 2D canvas implementation; this test only needs the capture lifecycle.
vi.mock('./components/WaveformCanvas', () => ({ WaveformCanvas: () => null }));

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

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await screen.findByRole('button', { name: 'Start' });

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Start screen' }));

    await act(async () => {
      finishStart({
        context: {} as AudioContext,
        stream: {} as MediaStream,
        sampleRate: 48_000,
        requestedSampleRate: 48_000,
        warnings: [],
        stop,
      });
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Begin' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });
});
