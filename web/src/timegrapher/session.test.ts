/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, beforeEach } from 'vitest';
import {
  upsert, summarise, load, save, clear, toTable, positionName, sessionTitle,
  loadMeta, saveMeta, EMPTY_META,
  type Reading, type PositionId,
} from './session';

const reading = (position: PositionId, rate: number, amplitude = 270, beatError = 0.2): Reading => ({
  position, rate, amplitude, beatError, bph: 21600, at: '2026-08-30T00:00:00.000Z',
});

describe('upsert', () => {
  it('adds a reading', () => {
    expect(upsert([], reading('dial-up', 3)).length).toBe(1);
  });

  it('replaces rather than duplicates when a position is measured again', () => {
    // Re-measuring is normal — you adjust, then check the same position again.
    const once = upsert([], reading('dial-up', 3));
    const twice = upsert(once, reading('dial-up', 5));
    expect(twice.length).toBe(1);
    expect(twice[0].rate).toBe(5);
  });

  it('keeps readings in bench order regardless of capture order', () => {
    let r: Reading[] = [];
    r = upsert(r, reading('crown-down', 1));
    r = upsert(r, reading('dial-up', 2));
    expect(r.map((x) => x.position)).toEqual(['dial-up', 'crown-down']);
  });
});

describe('summarise', () => {
  it('returns null with nothing recorded', () => {
    expect(summarise([])).toBeNull();
  });

  it('averages the rate', () => {
    const s = summarise([reading('dial-up', 2), reading('dial-down', 6)]);
    expect(s!.averageRate).toBe(4);
  });

  it('reports positional spread as worst minus best', () => {
    // This is the number that separates "needs regulating" from "needs work".
    const s = summarise([
      reading('dial-up', 2), reading('dial-down', 4), reading('crown-up', -3),
    ]);
    expect(s!.positionalSpread).toBe(7);
  });

  it('reports the lowest amplitude', () => {
    const s = summarise([reading('dial-up', 0, 280), reading('crown-up', 0, 240)]);
    expect(s!.minAmplitude).toBe(240);
  });

  it('ignores unmeasurable amplitude rather than counting it as zero', () => {
    // The core reports 0 when it cannot determine amplitude; treating that as
    // a real reading would report a healthy watch as barely swinging.
    const s = summarise([reading('dial-up', 0, 280), reading('crown-up', 0, 0)]);
    expect(s!.minAmplitude).toBe(280);
  });

  it('reports zero amplitude only when nothing was measurable', () => {
    expect(summarise([reading('dial-up', 0, 0)])!.minAmplitude).toBe(0);
  });

  it('reports the worst beat error', () => {
    const s = summarise([reading('dial-up', 0, 270, 0.2), reading('crown-up', 0, 270, 0.9)]);
    expect(s!.maxBeatError).toBe(0.9);
  });
});

describe('storage', () => {
  beforeEach(() => clear());

  it('round trips', () => {
    save([reading('dial-up', 3)]);
    expect(load()[0].rate).toBe(3);
  });

  it('returns empty when nothing is stored', () => {
    expect(load()).toEqual([]);
  });

  it('survives corrupt stored data rather than throwing', () => {
    localStorage.setItem('mac-timegrapher.session', '{not json');
    expect(load()).toEqual([]);
  });

  it('ignores stored data of the wrong shape', () => {
    localStorage.setItem('mac-timegrapher.session', '{"nope":1}');
    expect(load()).toEqual([]);
  });
});

describe('toTable', () => {
  it('includes every reading and the summary', () => {
    const out = toTable([reading('dial-up', 3.14), reading('crown-up', -1.2)], 'Seiko NH35');
    expect(out).toContain('Seiko NH35');
    expect(out).toContain('Dial up');
    expect(out).toContain('3.1');
    expect(out).toContain('Positional spread');
  });

  it('marks unmeasurable amplitude rather than printing zero', () => {
    expect(toTable([reading('dial-up', 1, 0)], null)).toContain('—');
  });

  it('is tab separated so it pastes into a spreadsheet', () => {
    expect(toTable([reading('dial-up', 1)], null).split('\n').find((l) => l.startsWith('Dial up')))
      .toMatch(/\t/);
  });
});

describe('positionName', () => {
  it('gives the bench name', () => {
    expect(positionName('crown-down')).toBe('Crown down');
  });
});

describe('session metadata', () => {
  beforeEach(() => clear());

  it('starts empty', () => {
    expect(loadMeta()).toEqual(EMPTY_META);
  });

  it('round trips', () => {
    saveMeta({ reference: '0042', technician: 'NM', notes: 'after service' });
    expect(loadMeta().reference).toBe('0042');
  });

  it('fills in fields missing from older stored data', () => {
    localStorage.setItem('mac-timegrapher.session-meta', '{"reference":"0042"}');
    expect(loadMeta()).toEqual({ reference: '0042', technician: '', notes: '' });
  });

  it('survives corrupt stored metadata', () => {
    localStorage.setItem('mac-timegrapher.session-meta', 'not json');
    expect(loadMeta()).toEqual(EMPTY_META);
  });

  it('is cleared along with the readings', () => {
    // Clearing a session must not leave the previous watch's reference behind
    // to be printed on the next certificate.
    saveMeta({ reference: '0042', technician: 'NM', notes: '' });
    save([reading('dial-up', 1)]);
    clear();
    expect(loadMeta()).toEqual(EMPTY_META);
    expect(load()).toEqual([]);
  });
});

describe('sessionTitle', () => {
  it('names the session after the reference once there is one', () => {
    expect(sessionTitle('MB-0142', 'Seiko / TMI NH35')).toBe('MB-0142 — Seiko / TMI NH35');
  });

  it('falls back to Session before a reference is entered', () => {
    expect(sessionTitle('', 'Seiko / TMI NH35')).toBe('Session — Seiko / TMI NH35');
  });

  /* A field the operator half-typed into and cleared is not a reference. */
  it('treats whitespace as no reference', () => {
    expect(sessionTitle('   ', 'Seiko / TMI NH35')).toBe('Session — Seiko / TMI NH35');
  });

  it('trims a reference rather than rendering the padding', () => {
    expect(sessionTitle('  MB-0142 ', null)).toBe('MB-0142');
  });

  it('stands alone when no movement is chosen', () => {
    expect(sessionTitle('MB-0142', null)).toBe('MB-0142');
    expect(sessionTitle('', null)).toBe('Session');
  });
});
