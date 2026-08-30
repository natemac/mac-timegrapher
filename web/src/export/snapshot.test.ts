/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  snapshotRows, snapshotSubject, snapshotFilename, dataUrlToBytes,
  type SnapshotInput,
} from './snapshot';
import type { Spread } from '../timegrapher/stability';

function spread(plusMinus: number): Spread {
  return { mean: 0, min: 0, max: 0, plusMinus, count: 10 };
}

const BASE: SnapshotInput = {
  rate: 12.4,
  amplitude: 248.6,
  beatError: 1.34,
  bph: 21600,
  spreads: { rate: spread(0.8), amplitude: spread(4.2), beatError: spread(0.16) },
  movementName: 'Seiko / TMI NH35',
  position: 'dial-up',
  reference: 'MB-0142',
  at: new Date(2026, 7, 30, 9, 5),
};

describe('snapshotRows', () => {
  it('signs a positive rate, because "12.4" and "+12.4" mean different things', () => {
    expect(snapshotRows(BASE)[0].value).toBe('+12.4');
    expect(snapshotRows({ ...BASE, rate: -3.2 })[0].value).toBe('-3.2');
  });

  it('shows the spread beside each reading it has one for', () => {
    const rows = snapshotRows(BASE);
    expect(rows[0].sub).toBe('±0.8');
    expect(rows[1].sub).toBe('±4');
    expect(rows[2].sub).toBe('±0.16');
  });

  it('leaves the spread blank when there is none', () => {
    const rows = snapshotRows({
      ...BASE,
      spreads: { rate: null, amplitude: null, beatError: null },
    });
    expect(rows.map((r) => r.sub)).toEqual(['', '', '', '']);
  });

  /*
     Amplitude of zero is the core saying it could not determine amplitude. A
     card reading "0°" would assert a movement that barely swings, which is a
     different and much more alarming claim.
  */
  it('prints an undetermined amplitude as a dash, never as zero', () => {
    const rows = snapshotRows({ ...BASE, amplitude: 0 });
    expect(rows[1].value).toBe('—');
    expect(rows[1].unit).toBe('');
    expect(rows[1].sub).toBe('');
  });

  it('prints an undetermined beat rate as a dash', () => {
    expect(snapshotRows({ ...BASE, bph: 0 })[3].value).toBe('—');
  });

  it('groups the beat rate for legibility', () => {
    expect(snapshotRows(BASE)[3].value).toBe('21,600');
  });
});

describe('snapshotSubject', () => {
  it('names the movement and the position', () => {
    expect(snapshotSubject(BASE)).toBe('Seiko / TMI NH35 · Dial up');
  });

  it('drops what it does not know', () => {
    expect(snapshotSubject({ ...BASE, position: null })).toBe('Seiko / TMI NH35');
    expect(snapshotSubject({ ...BASE, movementName: null })).toBe('Dial up');
  });

  it('never renders an empty heading', () => {
    expect(snapshotSubject({ ...BASE, movementName: null, position: null }))
      .toBe('Timing reading');
  });
});

describe('snapshotFilename', () => {
  it('leads with the reference so one job’s images sit together', () => {
    expect(snapshotFilename(BASE)).toBe('timegrapher-mb-0142-dial-up-20260830-0905.png');
  });

  it('still names a file with no reference', () => {
    expect(snapshotFilename({ ...BASE, reference: '' }))
      .toBe('timegrapher-dial-up-20260830-0905.png');
  });

  it('strips characters a filesystem would object to', () => {
    const name = snapshotFilename({ ...BASE, reference: 'Job 12/A "rush"' });
    expect(name).toBe('timegrapher-job-12-a-rush-dial-up-20260830-0905.png');
    expect(name).not.toMatch(/[/"\\]/);
  });

  it('pads the stamp so names sort chronologically', () => {
    const name = snapshotFilename({
      ...BASE, reference: '', position: null, at: new Date(2026, 0, 5, 7, 3),
    });
    expect(name).toBe('timegrapher-20260105-0703.png');
  });
});

describe('dataUrlToBytes', () => {
  it('decodes the payload', () => {
    // "MAC" in base64.
    expect([...dataUrlToBytes('data:image/png;base64,TUFD')])
      .toEqual([0x4d, 0x41, 0x43]);
  });

  it('rejects something that is not a data URL', () => {
    expect(() => dataUrlToBytes('nope')).toThrow();
  });

  /*
     PNG bytes are binary, not text. An earlier attempt round-tripped through a
     string and corrupted anything above 0x7f.
  */
  it('preserves high bytes', () => {
    const bytes = dataUrlToBytes(`data:image/png;base64,${btoa('\x89PNG')}`);
    expect(bytes[0]).toBe(0x89);
  });
});
