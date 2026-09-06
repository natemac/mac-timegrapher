/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

import { describe, it, expect } from 'vitest';
import {
  buildAudioConstraints, checkAppliedProcessing, deviceIdMismatch, isProcessingRequested, resumeWithin, armGestureResume,
} from './audio-engine';
import { constraintsFor } from './capture-route';

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

describe('the two capture profiles', () => {
  /*
     The whole point of an A/B is that one thing differs. If the profiles drift
     apart in any other constraint, a difference in what is captured stops
     meaning anything.
  */
  it('differ only in echo cancellation', () => {
    const ours = constraintsFor('ours', 'dev-1').audio as MediaTrackConstraints;
    const ec = constraintsFor('ec-only', 'dev-1').audio as MediaTrackConstraints;
    expect(ours.echoCancellation).toBe(false);
    expect(ec.echoCancellation).toBe(true);
    for (const key of ['autoGainControl', 'noiseSuppression', 'channelCount'] as const) {
      expect(ec[key]).toEqual(ours[key]);
    }
    expect(ec.deviceId).toEqual(ours.deviceId);
    expect(ec.deviceId).toEqual({ exact: 'dev-1' });
  });

  /* The default request must be untouched by any of this, because it is what
     every already-working Apple and desktop device uses. */
  it('leaves the app default identical to buildAudioConstraints', () => {
    expect(constraintsFor('ours', 'dev-1')).toEqual(buildAudioConstraints('dev-1'));
  });
});

describe('processing the caller asked for', () => {
  it('is reported as intentional rather than as an override', () => {
    const w = checkAppliedProcessing({ echoCancellation: true, autoGainControl: false, noiseSuppression: false },
      ['echoCancellation']);
    expect(w).toContainEqual({ setting: 'echoCancellation', state: 'intentional' });
  });

  it('still reports an override the caller did not ask for', () => {
    const w = checkAppliedProcessing({ echoCancellation: true, autoGainControl: true, noiseSuppression: false },
      ['echoCancellation']);
    expect(w).toContainEqual({ setting: 'autoGainControl', state: 'applied' });
  });

  /* Safari omits keys from getSettings(); absent is unknown, never verified. */
  it('keeps an absent setting unknown even when it was requested', () => {
    const w = checkAppliedProcessing({ autoGainControl: false, noiseSuppression: false }, ['echoCancellation']);
    expect(w).toContainEqual({ setting: 'echoCancellation', state: 'unreported' });
  });
});

describe('the input the browser actually returned', () => {
  /* Matching ids cannot prove the audio came from that device, but a mismatch
     does prove it did not — and a stream answering a question nobody asked is
     worse than no stream, because the reading looks ordinary. */
  it('reports a concrete id that came back different', () => {
    expect(deviceIdMismatch('usb-1', { deviceId: 'builtin-9' }))
      .toEqual({ requested: 'usb-1', granted: 'builtin-9' });
  });

  it('accepts the id it asked for', () => {
    expect(deviceIdMismatch('usb-1', { deviceId: 'usb-1' })).toBeNull();
  });

  /* 'default' resolves to whatever the platform picks, so a different concrete
     id back is the alias working, not a substitution. */
  it('does not accuse the default alias', () => {
    expect(deviceIdMismatch('default', { deviceId: 'builtin-9' })).toBeNull();
  });

  it('treats a missing id as unknown rather than as a mismatch', () => {
    expect(deviceIdMismatch('usb-1', {})).toBeNull();
    expect(deviceIdMismatch('usb-1', { deviceId: '' })).toBeNull();
  });
});

/* Every device that works today opens through this path, so a check meant to
   catch a hypothetical substitution must not reject a platform that answers a
   concrete request with the alias it resolved through. */
it('does not treat an alias coming back as a substitution', () => {
  expect(deviceIdMismatch('usb-1', { deviceId: 'default' })).toBeNull();
  expect(deviceIdMismatch('usb-1', { deviceId: 'communications' })).toBeNull();
});

describe('which destination the graph ends at', () => {
  /*
     Measured on a Pixel 3 XL with a USB pickup, three runs differing only in
     the sink: an analyser alone held the USB input for 50s at full scale; the
     same graph ending at ctx.destination collapsed by ~70 dB at 34s every
     time; ending at a MediaStreamAudioDestinationNode held for 55s.

     Android routes a communication device as an input/output pair, so a
     hardware output stream is what triggers the re-pair. The choice is read
     from the constraints, not from a profile name, so the graph cannot drift
     out of step with what was actually requested.
  */
  it('recognises a request that deliberately turns echo cancellation on', () => {
    expect(isProcessingRequested(constraintsFor('ec-only', 'd'), 'echoCancellation')).toBe(true);
  });

  it('leaves the app default off the communication route', () => {
    expect(isProcessingRequested(constraintsFor('ours', 'd'), 'echoCancellation')).toBe(false);
    expect(isProcessingRequested(buildAudioConstraints('d'), 'echoCancellation')).toBe(false);
  });

  it('does not mistake another flag for echo cancellation', () => {
    /* Written out rather than taken from a capture profile: the app only ever
       opens two, and neither asks for gain control — which is the point. */
    const gainOnly: MediaStreamConstraints = {
      audio: { deviceId: { exact: 'd' }, echoCancellation: false, autoGainControl: true, noiseSuppression: false },
      video: false,
    };
    expect(isProcessingRequested(gainOnly, 'echoCancellation')).toBe(false);
    expect(isProcessingRequested(gainOnly, 'autoGainControl')).toBe(true);
  });

  /* The Android exception, and the only place the app asks for processing. */
  it('reports echo cancellation as requested on the communication route', () => {
    expect(isProcessingRequested(constraintsFor('ec-only', 'd'), 'echoCancellation')).toBe(true);
    expect(isProcessingRequested(constraintsFor('ec-only', 'd'), 'autoGainControl')).toBe(false);
    expect(isProcessingRequested(constraintsFor('ec-only', 'd'), 'noiseSuppression')).toBe(false);
  });

  it('treats audio:true as requesting nothing in particular', () => {
    expect(isProcessingRequested({ audio: true }, 'echoCancellation')).toBe(false);
    expect(isProcessingRequested({ audio: false }, 'echoCancellation')).toBe(false);
  });
});

describe('starting a context that the browser is holding back', () => {
  /*
     Firefox gates AudioContext on user activation, and when it decides the
     context may not start it leaves resume() pending forever rather than
     rejecting. Opening a real USB input takes long enough for the click that
     began the capture to stop counting, so awaiting it parked the whole app:
     no error, no console output, the Start button greyed by a busy flag that
     could never clear. Measured on Firefox 155 — still pending after four
     seconds, against 129ms once the context was allowed to run.
  */
  it('gives up waiting rather than hanging forever', async () => {
    const ctx = { resume: () => new Promise<void>(() => {}) } as unknown as AudioContext;
    const started = Date.now();
    await resumeWithin(ctx, 40);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  /* Everywhere it works, it resolves in single-digit milliseconds — the race
     has to settle on that rather than sitting out the timeout. */
  it('returns as soon as the context starts', async () => {
    let resolved = false;
    const ctx = { resume: async () => { resolved = true; } } as unknown as AudioContext;
    await resumeWithin(ctx, 5000);
    expect(resolved).toBe(true);
  });

  it('carries on when resume rejects outright', async () => {
    const ctx = { resume: () => Promise.reject(new Error('blocked')) } as unknown as AudioContext;
    await expect(resumeWithin(ctx, 50)).resolves.toBeUndefined();
  });
});

describe('a second chance at starting the context', () => {
  /* A suspended context is a silent capture. The next thing the operator does
     is the moment it can start, so it repairs itself instead of needing a
     reload — and nothing stays attached once it has. */
  it('resumes on the next gesture and then detaches', () => {
    let resumes = 0;
    const ctx = { resume: async () => { resumes++; } } as unknown as AudioContext;
    armGestureResume(ctx);
    document.dispatchEvent(new Event('pointerdown'));
    expect(resumes).toBe(1);
    document.dispatchEvent(new Event('pointerdown'));
    expect(resumes).toBe(1);
  });

  it('can be disarmed without ever firing', () => {
    let resumes = 0;
    const ctx = { resume: async () => { resumes++; } } as unknown as AudioContext;
    armGestureResume(ctx)();
    document.dispatchEvent(new Event('pointerdown'));
    expect(resumes).toBe(0);
  });
});
