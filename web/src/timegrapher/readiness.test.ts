/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { assessReadiness, isBuiltInMic, type ReadinessFacts } from './readiness';

/* A device and watch that pass everything, so each test can spoil one thing. */
function ready(over: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return {
    capturing: true,
    deviceLabel: 'USB PnP Sound Device',
    sampleRate: 48000,
    timingSeconds: 20,
    timingDisturbed: false,
    rejectionRate: 0.01,
    processing: [],
    strength: 'excellent',
    clipped: false,
    hot: false,
    measurementValid: true,
    recentBph: [21600, 21600, 21600],
    expectedBph: 21600,
    quartz: false,
    ...over,
  };
}

const find = (items: { id: string; state: string; detail: string }[], id: string) =>
  items.find((i) => i.id === id)!;

describe('measurement readiness', () => {
  it('says ready when the device and the signal are both good', () => {
    const r = assessReadiness(ready());
    expect(r.deviceStatus).toBe('ready');
    expect(r.signalStatus).toBe('ready');
    expect(r.overall).toBe('ready');
  });

  /*
     The whole reason this exists. A 44.1 kHz resample on a 48 kHz device
     starved the audio clock for a week, invisibly. The calibrator's own
     "disturbed" flag — drift too large for any crystal — is exactly that
     condition, whatever its cause, so the pre-check fails timing on it.
  */
  it('fails audio timing when the stream is being starved', () => {
    const r = assessReadiness(ready({ timingDisturbed: true }));
    expect(find(r.device, 'timing').state).toBe('fail');
    expect(r.deviceStatus).toBe('not-ready');
    expect(r.overall).toBe('not-ready');
  });

  it('does not judge timing until there is a window to judge', () => {
    const r = assessReadiness(ready({ timingSeconds: 3, timingDisturbed: true }));
    // Even disturbed, too early to call — it reads pending, not fail.
    expect(find(r.device, 'timing').state).toBe('pending');
  });

  it('passes a healthy delivery rate, warns only when it is high', () => {
    // A MacBook in Firefox with many tabs sat at ~10%; that must not warn.
    expect(find(assessReadiness(ready({ rejectionRate: 0.10 })).device, 'timing').state).toBe('pass');
    expect(find(assessReadiness(ready({ rejectionRate: 0.40 })).device, 'timing').state).toBe('warning');
    // Only a stream that is barely arriving fails on delivery alone.
    expect(find(assessReadiness(ready({ rejectionRate: 0.70 })).device, 'timing').state).toBe('fail');
  });

  /*
     The three-state honesty the rest of the app already keeps: a browser that
     will not report AGC is UNKNOWN, never PASS. Applied is a hard fail because
     AGC invalidates amplitude rather than merely degrading it.
  */
  it('treats processing as off / on / unknown, never folding unknown into off', () => {
    expect(find(assessReadiness(ready()).device, 'autoGainControl').state).toBe('pass');
    expect(find(assessReadiness(ready({
      processing: [{ setting: 'autoGainControl', state: 'unreported' }],
    })).device, 'autoGainControl').state).toBe('unknown');
    const applied = assessReadiness(ready({
      processing: [{ setting: 'autoGainControl', state: 'applied' }],
    }));
    expect(find(applied.device, 'autoGainControl').state).toBe('fail');
    expect(applied.deviceStatus).toBe('not-ready');
  });

  it('warns rather than blocks on a built-in microphone', () => {
    const r = assessReadiness(ready({ deviceLabel: 'MacBook Pro Microphone' }));
    expect(find(r.device, 'input').state).toBe('warning');
    expect(r.deviceStatus).toBe('warning');
  });

  it('knows a USB pickup from a built-in mic', () => {
    expect(isBuiltInMic('USB PnP Sound Device')).toBe(false);
    expect(isBuiltInMic('MacBook Pro Microphone')).toBe(true);
    expect(isBuiltInMic('iPhone Microphone')).toBe(true);
    expect(isBuiltInMic(null)).toBe(false);
  });

  it('fails the signal when nothing is coming through', () => {
    const r = assessReadiness(ready({ strength: 'none', measurementValid: false }));
    expect(find(r.signal, 'signal').state).toBe('fail');
    expect(r.signalStatus).toBe('not-ready');
  });

  it('fails on clipping and warns when hot', () => {
    expect(find(assessReadiness(ready({ clipped: true })).signal, 'clipping').state).toBe('fail');
    expect(find(assessReadiness(ready({ hot: true })).signal, 'clipping').state).toBe('warning');
  });

  it('warns when the beat rate will not settle on one value', () => {
    const r = assessReadiness(ready({ recentBph: [21600, 28800, 21600] }));
    expect(find(r.signal, 'escapement').state).toBe('warning');
    expect(find(r.signal, 'escapement').detail).toMatch(/jumping/);
  });

  it('flags a stable lock that disagrees with the chosen movement', () => {
    const r = assessReadiness(ready({ recentBph: [28800, 28800, 28800], expectedBph: 21600 }));
    expect(find(r.signal, 'escapement').state).toBe('warning');
    expect(find(r.signal, 'escapement').detail).toMatch(/not the 21,600 expected/);
  });

  /* Quartz has no escapement, so it is not judged rather than failed. */
  it('does not expect an escapement from a quartz movement', () => {
    const r = assessReadiness(ready({ quartz: true, measurementValid: false, recentBph: [] }));
    expect(find(r.signal, 'escapement').state).toBe('unknown');
  });

  /*
     Device and signal are separate so "no escapement" never blocks someone
     still setting up the mic — the device can be ready while the signal is not.
  */
  it('keeps device readiness independent of the signal', () => {
    const r = assessReadiness(ready({ strength: 'none', measurementValid: false }));
    expect(r.deviceStatus).toBe('ready');
    expect(r.signalStatus).toBe('not-ready');
    expect(r.overall).toBe('not-ready');
  });

  it('reads pending before a capture has started', () => {
    const r = assessReadiness(ready({
      capturing: false, timingSeconds: 0, rejectionRate: null,
      strength: 'none', measurementValid: false,
    }));
    expect(r.overall).toBe('pending');
  });
});
