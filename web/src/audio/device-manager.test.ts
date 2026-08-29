/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveSelection, saveSelection, loadSelection, listAudioInputs, requestPermission,
  type AudioInput,
} from './device-manager';

const usb: AudioInput = { deviceId: 'usb-1', label: 'USB PnP Sound Device', groupId: 'g1' };
const builtin: AudioInput = { deviceId: 'default', label: 'MacBook Pro Microphone', groupId: 'g2' };

describe('resolveSelection', () => {
  it('returns null when nothing is available', () => {
    expect(resolveSelection('usb-1', [])).toBeNull();
  });

  it('returns the saved device when it is still present', () => {
    expect(resolveSelection('usb-1', [builtin, usb])).toEqual(usb);
  });

  it('falls back to the system default when the saved device is gone', () => {
    // Device IDs rotate when permissions are cleared, so a stale saved ID is
    // normal, not exceptional. It must not leave the app with no input.
    expect(resolveSelection('usb-1', [builtin])).toEqual(builtin);
  });

  it('falls back to the first device when there is no default', () => {
    expect(resolveSelection('gone', [usb])).toEqual(usb);
  });

  it('handles never having saved anything', () => {
    expect(resolveSelection(null, [builtin, usb])).toEqual(builtin);
  });
});

describe('selection persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round trips', () => {
    saveSelection('usb-1');
    expect(loadSelection()).toBe('usb-1');
  });

  it('returns null when nothing is stored', () => {
    expect(loadSelection()).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveSelection('usb-1')).not.toThrow();
    spy.mockRestore();
  });
});

describe('listAudioInputs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns only audio inputs', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'usb-1', label: 'USB PnP Sound Device', groupId: 'g1' },
          { kind: 'audiooutput', deviceId: 'out-1', label: 'Speakers', groupId: 'g1' },
          { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD', groupId: 'g3' },
        ],
      },
    });
    const inputs = await listAudioInputs();
    expect(inputs).toHaveLength(1);
    expect(inputs[0].label).toBe('USB PnP Sound Device');
  });

  it('substitutes a placeholder for the blank labels shown before permission', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'x', label: '', groupId: 'g' }],
      },
    });
    expect((await listAudioInputs())[0].label).toBe('Unnamed input');
  });
});

describe('requestPermission', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('releases every track of the probe stream', async () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopA }, { stop: stopB }] }) },
    });
    await requestPermission();
    // Holding any track open keeps the recording indicator lit and can lock the
    // device, so stopping only the first is not enough.
    expect(stopA).toHaveBeenCalledOnce();
    expect(stopB).toHaveBeenCalledOnce();
  });
});
