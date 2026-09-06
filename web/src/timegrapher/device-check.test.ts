/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  STEPS, STEP_SECONDS, pendingResults, estimatedSeconds, badgeFor,
  gradeBrowser, gradePermission, gradeInput, gradeStream, gradeSampleRate,
  gradeProcessing, gradeTiming, gradeLevel, gradeClipping, gradeBandwidth,
  gradeEnergy, gradeBeat, gradeAnalysis, verdictOf, summarise,
  type StepResult,
} from './device-check';

describe('the list itself', () => {
  it('runs device, then signal, then movement — never interleaved', () => {
    const groups = STEPS.map((s) => s.group);
    expect(groups).toEqual([...groups].sort((a, b) => {
      const order = { device: 0, signal: 1, movement: 2 };
      return order[a] - order[b];
    }));
  });

  it('gives every step a duration, so the progress bar cannot stall', () => {
    for (const s of STEPS) expect(STEP_SECONDS[s.id]).toBeTypeOf('number');
  });

  it('asks the questions that depend on a stream after the stream opens', () => {
    const at = (id: string) => STEPS.findIndex((s) => s.id === id);
    expect(at('browser')).toBeLessThan(at('permission'));
    expect(at('permission')).toBeLessThan(at('input'));
    expect(at('input')).toBeLessThan(at('stream'));
    expect(at('stream')).toBeLessThan(at('rate'));
    expect(at('stream')).toBeLessThan(at('timing'));
    expect(at('level')).toBeLessThan(at('energy'));
  });

  /* The movement steps need a watch on the sensor. Failing them because there
     was no watch would report on the operator, not on the device. */
  it('marks the movement steps skipped rather than pending when left out', () => {
    const results = pendingResults(false);
    const movement = STEPS.filter((s) => s.group === 'movement').map((s) => s.id);
    for (const id of movement) {
      expect(results.find((r) => r.id === id)!.state).toBe('skipped');
    }
    expect(results.find((r) => r.id === 'input')!.state).toBe('pending');
  });

  it('costs more when the movement steps are included', () => {
    expect(estimatedSeconds(true)).toBeGreaterThan(estimatedSeconds(false));
  });

  it('has a word for every state a row can be in', () => {
    for (const state of ['pass', 'warn', 'fail', 'unknown', 'running', 'pending', 'skipped'] as const) {
      expect(badgeFor(state)).toBeTruthy();
    }
  });
});

describe('browser support', () => {
  it('fails an insecure origin, and says what to do about it', () => {
    const r = gradeBrowser(false, true);
    expect(r.state).toBe('fail');
    expect(r.detail).toMatch(/HTTPS/);
  });

  it('fails a browser with no AudioWorklet', () => {
    expect(gradeBrowser(true, false).state).toBe('fail');
  });

  it('passes a current browser on a secure page', () => {
    expect(gradeBrowser(true, true).state).toBe('pass');
  });
});

describe('microphone access', () => {
  it('passes once it is granted', () => {
    expect(gradePermission(true, null).state).toBe('pass');
  });

  it('fails with the browser’s own reason when there is one', () => {
    expect(gradePermission(false, 'Access was refused.').detail).toBe('Access was refused.');
  });

  it('says what to do when there is no reason to relay', () => {
    expect(gradePermission(false, null).detail).toMatch(/site settings/);
  });
});

describe('the input the browser actually opened', () => {
  it('passes an external pickup', () => {
    expect(gradeInput('Bench pickup', 'usb-1', 'usb-1').state).toBe('pass');
  });

  /* The Android case this row exists for: a chosen USB pickup silently swapped
     for the built-in microphone. Worth flagging, not worth failing — on the
     communication route the substitution is normal and the readings are real. */
  it('flags a device the browser substituted', () => {
    const r = gradeInput('Bench pickup', 'usb-1', 'builtin');
    expect(r.state).toBe('warn');
    expect(r.detail).toMatch(/different device/);
  });

  it('does not treat the default and communications aliases as a substitution', () => {
    expect(gradeInput('Bench pickup', 'default', 'usb-1').state).toBe('pass');
    expect(gradeInput('Bench pickup', 'usb-1', 'communications').state).toBe('pass');
  });

  it('warns that a built-in microphone hears the room', () => {
    expect(gradeInput('MacBook Pro Microphone', 'builtin', 'builtin').state).toBe('warn');
  });

  it('fails when there is no input at all', () => {
    expect(gradeInput(null, 'usb-1', null).state).toBe('fail');
  });
});

describe('the stream', () => {
  it('fails an input that opened but delivered nothing', () => {
    expect(gradeStream(0, 0.6).state).toBe('fail');
  });

  it('passes once blocks are arriving', () => {
    expect(gradeStream(12, 0.6).state).toBe('pass');
  });
});

describe('the sample rate', () => {
  it('passes a device running at its own rate', () => {
    expect(gradeSampleRate(48000, 48000).state).toBe('pass');
  });

  /*
     The trap this row exists for. Asking a 48 kHz device for 44,100 forces a
     resample the render thread does not keep up with; it starves the audio
     clock and produces an impossible rate figure over an otherwise clean run.
     It looks like a bad crystal and is not.
  */
  it('reports a resample rather than showing one figure', () => {
    const r = gradeSampleRate(44100, 48000);
    expect(r.state).toBe('warn');
    expect(r.detail).toMatch(/resampled/);
  });

  it('fails a rate too coarse to hear an escapement', () => {
    expect(gradeSampleRate(16000, 16000).state).toBe('fail');
  });

  it('fails when the browser reported no rate at all', () => {
    expect(gradeSampleRate(null, undefined).state).toBe('fail');
  });
});

describe('what the browser applied', () => {
  it('passes processing that is off', () => {
    expect(gradeProcessing('autoGainControl', false, false).state).toBe('pass');
  });

  /*
     Safari omits autoGainControl from getSettings() altogether. "Off" and "the
     browser did not say" are different facts and must not render the same:
     silence is not consent, and gain control is the one that invalidates
     amplitude outright.
  */
  it('does not read silence as off', () => {
    const r = gradeProcessing('autoGainControl', null, false);
    expect(r.state).toBe('unknown');
    expect(r.state).not.toBe('pass');
  });

  it('fails processing the browser imposed', () => {
    expect(gradeProcessing('autoGainControl', true, false).state).toBe('fail');
  });

  /* Echo cancellation on Android is the only way to reach a chosen input, so
     it is a caveat rather than a fault — but never an OK, because it really is
     applied. */
  it('softens, but does not clear, processing asked for on purpose', () => {
    expect(gradeProcessing('echoCancellation', true, true).state).toBe('warn');
  });
});

describe('audio timing', () => {
  const facts = { seconds: 10, disturbed: false, rejectionRate: 0.02, driftSecondsPerDay: 12 };

  it('declines to judge a run too short to say anything', () => {
    expect(gradeTiming({ ...facts, seconds: 2 }).state).toBe('unknown');
  });

  /* A drift too large for any crystal is a starved or interrupted stream
     whatever its cause — the thing that went uncaught the week 44.1 resampled. */
  it('fails frames that are not keeping pace', () => {
    expect(gradeTiming({ ...facts, disturbed: true }).state).toBe('fail');
  });

  it('mentions uneven delivery without calling it a fault', () => {
    const r = gradeTiming({ ...facts, rejectionRate: 0.5 });
    expect(r.state).toBe('warn');
    expect(r.detail).toMatch(/busy device/);
  });

  it('passes a steady clock and says how far off it runs', () => {
    const r = gradeTiming(facts);
    expect(r.state).toBe('pass');
    expect(r.detail).toMatch(/\+12 s\/day/);
  });
});

describe('the signal', () => {
  it('fails silence', () => {
    expect(gradeLevel(-Infinity, -75).state).toBe('fail');
    expect(gradeLevel(-80, -90).state).toBe('fail');
  });

  it('passes audio that is arriving', () => {
    expect(gradeLevel(-30, -70).state).toBe('pass');
  });

  /* Amplitude is read from the shape of an impulse. A flattened peak has no
     shape left to read, so clipping is a failure rather than a caution. */
  it('fails clipping outright', () => {
    expect(gradeClipping(-0.2).state).toBe('fail');
  });

  it('warns when there is very little room left', () => {
    expect(gradeClipping(-1.5).state).toBe('warn');
  });

  it('passes a well-set input', () => {
    expect(gradeClipping(-9).state).toBe('pass');
  });
});

describe('the frequency range', () => {
  /*
     The check that cost a day of guessing before anybody asked for it. A
     Bluetooth headset is a voice channel — band-limited below where an
     escapement's impulse lives. It looks perfectly healthy on a level meter and
     can never produce a reading.
  */
  it('fails a voice channel by the cliff above 4 kHz', () => {
    const r = gradeBandwidth(-95, -50);
    expect(r.state).toBe('fail');
    expect(r.detail).toMatch(/Bluetooth/);
  });

  it('warns when the top end is merely weak', () => {
    expect(gradeBandwidth(-80, -52).state).toBe('warn');
  });

  it('passes a full-range input, however quiet', () => {
    expect(gradeBandwidth(-85, -70).state).toBe('pass');
  });

  it('declines to judge when there is nothing to judge', () => {
    expect(gradeBandwidth(-Infinity, -Infinity).state).toBe('unknown');
  });
});

describe('the movement steps', () => {
  it('fails a tick that cannot be heard above the room', () => {
    expect(gradeEnergy(3, -40).state).toBe('fail');
  });

  it('passes a tick standing well clear of it', () => {
    expect(gradeEnergy(24, -35).state).toBe('pass');
  });

  it('fails when no repeating beat was found', () => {
    expect(gradeBeat(null, 21600).state).toBe('fail');
  });

  it('flags a beat rate that is not the one the movement expects', () => {
    const r = gradeBeat(28800, 21600);
    expect(r.state).toBe('warn');
    expect(r.detail).toMatch(/21,600/);
  });

  it('passes a lock with no expectation to contradict', () => {
    expect(gradeBeat(21600, null).state).toBe('pass');
  });

  it('fails an analysis that produced nothing usable', () => {
    expect(gradeAnalysis({ validReadings: 0, seconds: 15, rate: null, amplitude: null, beatError: null }).state).toBe('fail');
  });

  it('reports the reading it got', () => {
    const r = gradeAnalysis({ validReadings: 9, seconds: 15, rate: 1.4, amplitude: 279, beatError: 0.3 });
    expect(r.state).toBe('pass');
    expect(r.detail).toMatch(/\+1\.4 s\/day/);
    expect(r.detail).toMatch(/279°/);
  });

  /* Zero amplitude is the core saying it could not determine one, not a
     balance at rest, so it is left out rather than printed as a reading. */
  it('withholds an amplitude the core never produced', () => {
    const r = gradeAnalysis({ validReadings: 9, seconds: 15, rate: 1.4, amplitude: 0, beatError: 0.3 });
    expect(r.detail).not.toMatch(/0°/);
  });
});

describe('the verdict for the run', () => {
  const at = (id: string, state: StepResult['state']): StepResult =>
    ({ id: id as StepResult['id'], state, detail: '' });

  it('is incomplete while anything is still pending', () => {
    expect(verdictOf([at('input', 'pass'), at('rate', 'pending')])).toBe('incomplete');
  });

  it('ignores steps that were deliberately skipped', () => {
    expect(verdictOf([at('input', 'pass'), at('beat', 'skipped')])).toBe('pass');
  });

  it('leads with a failure over anything else', () => {
    expect(verdictOf([at('input', 'warn'), at('rate', 'fail')])).toBe('fail');
  });

  it('treats an unreported setting as something to look at', () => {
    expect(verdictOf([at('autoGainControl', 'unknown')])).toBe('warn');
  });

  it('names what failed rather than saying a check failed', () => {
    const summary = summarise([at('input', 'pass'), at('bandwidth', 'fail')]);
    expect(summary).toMatch(/frequency range/);
  });

  it('counts what needs a look when nothing outright failed', () => {
    expect(summarise([at('input', 'warn'), at('rate', 'pass')])).toMatch(/1 thing to look at/);
  });
});
