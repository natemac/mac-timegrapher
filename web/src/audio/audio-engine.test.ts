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
  it('reports nothing when the browser honoured every constraint', () => {
    expect(
      checkAppliedProcessing({ echoCancellation: false, autoGainControl: false, noiseSuppression: false }),
    ).toEqual([]);
  });

  it('reports a warning when AGC was applied anyway', () => {
    const warnings = checkAppliedProcessing({ autoGainControl: true });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].setting).toBe('autoGainControl');
  });

  it('reports every setting the browser overrode', () => {
    const warnings = checkAppliedProcessing({
      echoCancellation: true, autoGainControl: true, noiseSuppression: true,
    });
    expect(warnings.map((w) => w.setting).sort()).toEqual([
      'autoGainControl', 'echoCancellation', 'noiseSuppression',
    ]);
  });

  it('treats an unreported setting as acceptable', () => {
    // Safari omits keys it does not implement. Absence is not evidence of
    // processing, so it must not raise a false alarm.
    expect(checkAppliedProcessing({})).toEqual([]);
  });
});
