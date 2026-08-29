/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

import { describe, it, expect } from 'vitest';
import { buildAudioConstraints, checkAppliedProcessing } from './audio-engine';

describe('buildAudioConstraints', () => {
  const audio = () => buildAudioConstraints('usb-1').audio as MediaTrackConstraints;

  it('pins the exact device rather than letting the browser choose', () => {
    expect(audio().deviceId).toEqual({ exact: 'usb-1' });
  });

  it('disables automatic gain control', () => {
    // AGC continuously rescales the signal. Amplitude is derived from impulse
    // energy, so AGC does not degrade the measurement, it invalidates it.
    expect(audio().autoGainControl).toBe(false);
  });

  it('disables noise suppression', () => {
    // Noise suppression is tuned for speech and classifies watch ticks as
    // noise to be removed.
    expect(audio().noiseSuppression).toBe(false);
  });

  it('disables echo cancellation', () => {
    expect(audio().echoCancellation).toBe(false);
  });

  it('requests a single channel', () => {
    expect(audio().channelCount).toBe(1);
  });

  it('does not request video', () => {
    expect(buildAudioConstraints('usb-1').video).toBe(false);
  });
});

describe('checkAppliedProcessing', () => {
  const applied = (settings: MediaTrackSettings) =>
    checkAppliedProcessing(settings).filter((w) => w.state === 'applied').map((w) => w.setting);
  const unreported = (settings: MediaTrackSettings) =>
    checkAppliedProcessing(settings).filter((w) => w.state === 'unreported').map((w) => w.setting);

  const ALL_OFF: MediaTrackSettings = {
    echoCancellation: false, autoGainControl: false, noiseSuppression: false,
  };

  it('reports nothing when the browser honoured every constraint', () => {
    // Explicitly false is the only answer that lets the operator conclude a
    // setting is off, and it is the only one that produces silence.
    expect(checkAppliedProcessing(ALL_OFF)).toEqual([]);
  });

  it('reports a warning when AGC was applied anyway', () => {
    expect(applied({ ...ALL_OFF, autoGainControl: true })).toEqual(['autoGainControl']);
  });

  it('reports every setting the browser overrode', () => {
    const warnings = checkAppliedProcessing({
      echoCancellation: true, autoGainControl: true, noiseSuppression: true,
    });
    expect(warnings.every((w) => w.state === 'applied')).toBe(true);
    expect(warnings.map((w) => w.setting).sort()).toEqual([
      'autoGainControl', 'echoCancellation', 'noiseSuppression',
    ]);
  });

  it('reports an unreported setting as unknown rather than as off', () => {
    // Safari omits keys it does not implement, including autoGainControl.
    // Absence is not evidence of processing, so this must not be an alarm —
    // but it is not evidence of the absence of processing either, and AGC
    // invalidates amplitude measurement rather than merely degrading it. An
    // empty settings object therefore means three unknowns, not three
    // confirmed-off settings.
    expect(unreported({})).toEqual(['echoCancellation', 'autoGainControl', 'noiseSuppression']);
    expect(applied({})).toEqual([]);
  });

  it('separates a confirmed-off setting from an unreported one', () => {
    const settings: MediaTrackSettings = { echoCancellation: false, noiseSuppression: true };
    expect(applied(settings)).toEqual(['noiseSuppression']);
    expect(unreported(settings)).toEqual(['autoGainControl']);
  });
});
