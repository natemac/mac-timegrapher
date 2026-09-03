/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { verdict, deviceReportText } from './device-report';
import { bandEnergies, looksBandLimited, BANDS, type DeviceTestReport, type VariantResult, type LockResult } from '../audio/device-test';

const variant = (over: Partial<VariantResult> = {}): VariantResult => ({
  id: 'ours', label: 'All processing off', granted: { autoGainControl: false },
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
