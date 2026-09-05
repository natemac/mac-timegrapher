/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { verdict, deviceReportText, sourceAppearsToChange } from './device-report';
import { bandEnergies, looksBandLimited, BANDS, type DeviceTestReport, type VariantResult, type LockResult } from '../audio/device-test';

const variant = (over: Partial<VariantResult> = {}): VariantResult => ({
  id: 'ours', label: 'All processing off', grantedDeviceId: 'usb-1',
  granted: { autoGainControl: false },
  contextSampleRate: 48000, rmsDb: -30, peakDb: -12,
  bands: BANDS.map((b) => ({ label: b.label, db: -60 })),
  bandLimited: false, error: null, ...over,
});

const lock = (over: Partial<LockResult> = {}): LockResult => ({
  id: 'ours', label: 'All processing off', seconds: 20, samples: 40,
  validReadings: 0, bestQuality: 0, detectedBph: null, rate: null,
  amplitude: null, beatError: null, headroomDb: 18, error: null, ...over,
});

const report = (over: Partial<DeviceTestReport> = {}): DeviceTestReport => ({
  startedAt: '2026-09-02T20:00:00.000Z',
  requestedDeviceId: 'usb-1',
  userAgent: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/152',
  devices: [{ deviceId: 'default', label: 'Default', groupId: 'g' }],
  selected: { deviceId: 'default', label: 'Default' },
  movement: { name: 'Seiko / TMI NH35', bph: 21600, liftAngle: 53 },
  variants: [variant(), variant({ id: 'voice', label: 'Full voice processing', rmsDb: -28 })],
  locks: [lock()],
  ...over,
});

describe('where the energy sits', () => {
  it('averages the bins that fall in each band', () => {
    // 4096-point FFT at 48 kHz: 2048 bins, 11.7 Hz apart.
    const bins = new Float32Array(2048).fill(-90);
    for (let i = 0; i < 2048; i++) if (i * (48000 / 4096) < 2000) bins[i] = -30;
    const bands = bandEnergies(bins, 48000, 4096);
    expect(bands.find((b) => b.label === '0–500 Hz')!.db).toBeCloseTo(-30, 1);
    expect(bands.find((b) => b.label === '8–16 kHz')!.db).toBeCloseTo(-90, 1);
  });

  /*
     The question that would have ended a day of guessing in one glance. A
     microphone reached over Bluetooth is a voice channel, band-limited to
     roughly four kilohertz — below where an escapement's impulse lives. It
     looks healthy on a level meter and can never produce a reading.
  */
  it('recognises a voice channel by the cliff above 4 kHz', () => {
    const voice = BANDS.map((b, i) => ({ label: b.label, db: i < 3 ? -25 : -95 }));
    expect(looksBandLimited(voice)).toBe(true);
  });

  it('does not mistake a quiet but full-range input for one', () => {
    const real = BANDS.map((b, i) => ({ label: b.label, db: -55 - i * 4 }));
    expect(looksBandLimited(real)).toBe(false);
  });
});

describe('what the test concludes', () => {
  /* Ordered by how badly each finding invalidates the rest: band-limited
     cannot be fixed by gain, and silence cannot be judged for bandwidth. */
  it('reports a band-limited input above everything else', () => {
    const r = report({
      variants: [variant({ bandLimited: true }), variant({ id: 'voice', rmsDb: -10 })],
      locks: [lock({ validReadings: 0 })],
    });
    expect(verdict(r).join(' ')).toMatch(/band-limited/);
    expect(verdict(r).join(' ')).toMatch(/Bluetooth/);
  });

  it('says so when nothing was heard at all', () => {
    const r = report({ variants: [variant({ rmsDb: -Infinity }), variant({ id: 'voice', rmsDb: -Infinity })] });
    expect(verdict(r).join(' ')).toMatch(/recorded silence/);
  });

  it('leads with the good news when the analysis locked', () => {
    const r = report({ locks: [lock({ validReadings: 12, detectedBph: 21600 })] });
    const v = verdict(r).join(' ');
    expect(v).toMatch(/locked onto a beat/);
    expect(v).toMatch(/21600 bph/);
  });

  /* The hypothesis this whole exercise exists to settle, decided by a number
     rather than by argument. */
  it('names gain as the likely cause only when the gap is large', () => {
    const big = report({ variants: [variant({ rmsDb: -60 }), variant({ id: 'voice', rmsDb: -35 })] });
    expect(verdict(big).join(' ')).toMatch(/large enough gap to be the whole problem/);

    const small = report({ variants: [variant({ rmsDb: -40 }), variant({ id: 'voice', rmsDb: -36 })] });
    expect(verdict(small).join(' ')).toMatch(/gain is unlikely to be/);
  });

  it('reports a configuration that could not open at all', () => {
    const r = report({ variants: [variant({ error: 'NotAllowedError: denied' })] });
    expect(verdict(r).join(' ')).toMatch(/could not open this input/);
  });
});

describe('the exported file', () => {
  it('puts the conclusion above the working', () => {
    const text = deviceReportText(report({ locks: [lock({ validReadings: 5, detectedBph: 21600 })] }));
    expect(text.indexOf('## What this found')).toBeLessThan(text.indexOf('## Each processing configuration'));
  });

  /* The gap that let a Bluetooth headset be mistaken for the phone's own mic:
     the log said "Default" and nothing else. */
  it('lists every input the device offers, marking the one used', () => {
    const text = deviceReportText(report({
      devices: [
        { deviceId: 'default', label: 'Default', groupId: 'g' },
        { deviceId: 'bt', label: 'Galaxy Buds', groupId: 'h' },
      ],
    }));
    expect(text).toMatch(/\* Default/);
    expect(text).toMatch(/Galaxy Buds/);
  });

  it('says outright when a lock attempt never found a beat', () => {
    expect(deviceReportText(report())).toMatch(/never locked onto a beat/);
  });
});

describe('when the chosen input is not the one being heard', () => {
  /*
     A USB pickup was selected on a Pixel, its light came on, and the audio
     was the phone's own microphone. The log could not distinguish "the
     browser substituted a device" from "the browser agreed and the platform
     ignored it" — they need opposite fixes, so the report separates them.
  */
  it('reports a substituted device above every measurement', () => {
    const r = report({
      requestedDeviceId: 'usb-1',
      variants: [variant({ grantedDeviceId: 'builtin-9' }), variant({ id: 'voice', grantedDeviceId: 'usb-1' })],
      locks: [lock({ validReadings: 8 })],
    });
    const v = verdict(r).join(' ');
    expect(v).toMatch(/did not give us the input that was asked for/);
    // Said before the good news about locking, because the lock is on the
    // wrong device.
    expect(v).not.toMatch(/locked onto a beat/);
  });

  it('stays quiet when every variant got the device it asked for', () => {
    const r = report({ requestedDeviceId: 'usb-1', variants: [variant({ grantedDeviceId: 'usb-1' })] });
    expect(verdict(r).join(' ')).not.toMatch(/did not give us/);
  });

  /*
     Neither configuration applies gain control, so a large level gap between
     them cannot be processing — it is a different microphone, which is how a
     platform that only routes the chosen device on its communication path
     gives itself away.
  */
  it('recognises the source changing when echo cancellation goes on', () => {
    const ours = variant({ id: 'ours', rmsDb: -47 });
    const ec = variant({ id: 'ec-only', rmsDb: -26 });
    expect(sourceAppearsToChange(ours, ec)).toBe(true);
    const v = verdict(report({ variants: [ours, ec] })).join(' ');
    expect(v).toMatch(/two different physical inputs/);
  });

  it('does not call ordinary variation a change of source', () => {
    expect(sourceAppearsToChange(variant({ rmsDb: -40 }), variant({ rmsDb: -44 }))).toBe(false);
  });

  it('treats one being band-limited as a change of source', () => {
    const full = variant({ bandLimited: false });
    const voice = variant({ bandLimited: true });
    expect(sourceAppearsToChange(full, voice)).toBe(true);
  });
});

describe('when a configuration other than ours is the one that works', () => {
  /* The finding worth acting on: the app's own defaults are what failed. */
  it('says so, and that echo cancellation alone costs no amplitude', () => {
    const r = report({
      locks: [
        lock({ id: 'ours', validReadings: 0 }),
        lock({ id: 'ec-only', label: 'Echo cancellation only', validReadings: 14, detectedBph: 28800 }),
      ],
    });
    const v = verdict(r).join(' ');
    expect(v).toMatch(/did NOT lock, and this one did/);
    expect(v).toMatch(/amplitude stays measurable/);
  });

  it('warns that amplitude is lost when only the gain path works', () => {
    const r = report({
      locks: [
        lock({ id: 'ours', validReadings: 0 }),
        lock({ id: 'voice', label: 'Full voice processing', validReadings: 11, detectedBph: 28800 }),
      ],
    });
    expect(verdict(r).join(' ')).toMatch(/amplitude would not be\s+trustworthy/);
  });

  it('does not editorialise when the app default is what locked', () => {
    const r = report({ locks: [lock({ id: 'ours', validReadings: 9, detectedBph: 21600 })] });
    const v = verdict(r).join(' ');
    expect(v).toMatch(/This device can measure/);
    expect(v).not.toMatch(/did NOT lock/);
  });
});
