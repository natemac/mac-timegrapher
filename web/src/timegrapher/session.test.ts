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
  loadMeta, saveMeta, EMPTY_META, POSITIONS,
  readingsIn, phasesPresent, suggestPhase, comparePhases, phaseName,
  latestAverage, formatAverage,
  type Reading, type PositionId, type Phase,
} from './session';

const reading = (
  position: PositionId, rate: number, amplitude = 270, beatError = 0.2,
  phase: Phase = 'as-found',
): Reading => ({
  phase,
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
    saveMeta({ ...EMPTY_META, reference: '0042', technician: 'NM', notes: 'after service' });
    expect(loadMeta().reference).toBe('0042');
  });

  it('fills in fields missing from older stored data', () => {
    localStorage.setItem('mac-timegrapher.session-meta', '{"reference":"0042"}');
    expect(loadMeta()).toEqual({ ...EMPTY_META, reference: '0042' });
  });

  it('survives corrupt stored metadata', () => {
    localStorage.setItem('mac-timegrapher.session-meta', 'not json');
    expect(loadMeta()).toEqual(EMPTY_META);
  });

  it('is cleared along with the readings', () => {
    // Clearing a session must not leave the previous watch's reference behind
    // to be printed on the next certificate.
    saveMeta({ ...EMPTY_META, reference: '0042', technician: 'NM' });
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

describe('phases', () => {
  it('names both', () => {
    expect(phaseName('as-found')).toBe('As found');
    expect(phaseName('as-left')).toBe('As left');
  });

  /*
     The regression this guards: upsert originally replaced any reading for the
     same position. An as-left reading then overwrote the as-found one it was
     meant to be compared against, and the before-and-after silently became a
     single column.
  */
  it('keeps both phases of the same position', () => {
    let rs: Reading[] = [];
    rs = upsert(rs, reading('dial-up', 25, 260, 0.4, 'as-found'));
    rs = upsert(rs, reading('dial-up', 2, 275, 0.1, 'as-left'));

    expect(rs).toHaveLength(2);
    expect(readingsIn(rs, 'as-found')[0].rate).toBe(25);
    expect(readingsIn(rs, 'as-left')[0].rate).toBe(2);
  });

  it('still replaces a re-measure within one phase', () => {
    let rs: Reading[] = [];
    rs = upsert(rs, reading('dial-up', 25, 260, 0.4, 'as-found'));
    rs = upsert(rs, reading('dial-up', 21, 262, 0.4, 'as-found'));

    expect(rs).toHaveLength(1);
    expect(rs[0].rate).toBe(21);
  });

  it('reports which phases have anything in them', () => {
    expect(phasesPresent([])).toEqual([]);
    expect(phasesPresent([reading('dial-up', 5)])).toEqual(['as-found']);
    expect(
      phasesPresent([reading('dial-up', 5, 270, 0.2, 'as-left')]),
    ).toEqual(['as-left']);
  });

  it('sorts as-found ahead of as-left', () => {
    const rs = upsert(
      [reading('dial-down', 2, 270, 0.2, 'as-left')],
      reading('dial-up', 25, 260, 0.4, 'as-found'),
    );
    expect(rs.map((r) => r.phase)).toEqual(['as-found', 'as-left']);
  });
});

describe('suggestPhase', () => {
  it('starts as found', () => {
    expect(suggestPhase([])).toBe('as-found');
  });

  it('stays as found while the first pass is incomplete', () => {
    const partial = POSITIONS.slice(0, 4).map((p) => reading(p.id, 10));
    expect(suggestPhase(partial)).toBe('as-found');
  });

  /* The second pass over a watch is the one after the work. */
  it('moves to as left once every position has been measured once', () => {
    const full = POSITIONS.map((p) => reading(p.id, 10));
    expect(suggestPhase(full)).toBe('as-left');
  });
});

describe('comparePhases', () => {
  it('is null with only one phase recorded', () => {
    expect(comparePhases([reading('dial-up', 25)])).toBeNull();
  });

  /*
     A before-and-after drawn from different positions would be measuring the
     positions, not the regulation — dial up against crown down says nothing
     about what the regulator did.
  */
  it('is null when the two phases share no position', () => {
    const rs = [
      reading('dial-up', 25, 260, 0.4, 'as-found'),
      reading('crown-down', 2, 260, 0.4, 'as-left'),
    ];
    expect(comparePhases(rs)).toBeNull();
  });

  it('compares only the positions measured in both', () => {
    const rs = [
      reading('dial-up', 25, 260, 0.4, 'as-found'),
      reading('dial-down', 21, 260, 0.4, 'as-found'),
      reading('crown-up', 99, 260, 0.4, 'as-found'),
      reading('dial-up', 3, 270, 0.1, 'as-left'),
      reading('dial-down', 1, 270, 0.1, 'as-left'),
    ];
    const c = comparePhases(rs)!;
    expect(c.positions).toBe(2);
    expect(c.rateBefore).toBe(23);   // the 99 is excluded, not averaged in
    expect(c.rateAfter).toBe(2);
  });

  it('reports the spread on each side', () => {
    const rs = [
      reading('dial-up', 25, 260, 0.4, 'as-found'),
      reading('dial-down', 15, 260, 0.4, 'as-found'),
      reading('dial-up', 3, 270, 0.1, 'as-left'),
      reading('dial-down', 1, 270, 0.1, 'as-left'),
    ];
    const c = comparePhases(rs)!;
    expect(c.spreadBefore).toBe(10);
    expect(c.spreadAfter).toBe(2);
  });
});

describe('load migration', () => {
  /* A session open across the change should survive it: a single pass is what
     "as found" means. */
  it('treats readings saved before phases existed as as-found', () => {
    const legacy = [{ position: 'dial-up', rate: 12, amplitude: 260, beatError: 0.3, bph: 21600, at: '2026-08-01T00:00:00.000Z' }];
    localStorage.setItem('mac-timegrapher.session', JSON.stringify(legacy));
    const loaded = load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].phase).toBe('as-found');
  });
});

describe('latestAverage', () => {
  const at = (iso: string, r: Reading): Reading => ({ ...r, at: iso });

  it('is null with nothing recorded', () => {
    expect(latestAverage([])).toBeNull();
  });

  it('averages the readings from the pass that was measured last', () => {
    const rs = [
      at('2026-08-30T09:00:00Z', reading('dial-up', 26, 250, 1.5, 'as-found')),
      at('2026-08-30T09:01:00Z', reading('dial-down', 28, 250, 1.5, 'as-found')),
      at('2026-08-30T10:00:00Z', reading('dial-up', 2, 265, 0.3, 'as-left')),
      at('2026-08-30T10:01:00Z', reading('dial-down', 4, 265, 0.3, 'as-left')),
    ];
    const a = latestAverage(rs)!;
    expect(a.phase).toBe('as-left');
    expect(a.rate).toBe(3);
    expect(a.positions).toBe(2);
  });

  /*
     Fill has to mean the same thing beside either field, so it follows the
     clock rather than the phase label. Filling the before line after only a
     first pass must not reach forward into readings that do not exist.
  */
  it('follows the clock, not the phase order', () => {
    const rs = [
      at('2026-08-30T10:00:00Z', reading('dial-up', 2, 265, 0.3, 'as-left')),
      at('2026-08-30T09:00:00Z', reading('dial-up', 26, 250, 1.5, 'as-found')),
    ];
    expect(latestAverage(rs)!.phase).toBe('as-left');
  });

  it('handles a single reading', () => {
    const a = latestAverage([reading('dial-up', 12)])!;
    expect(a.rate).toBe(12);
    expect(a.positions).toBe(1);
  });
});

describe('formatAverage', () => {
  it('signs the rate and counts the positions', () => {
    expect(formatAverage({ rate: 2.53, positions: 6 }))
      .toBe('+2.5 s/day average over 6 positions');
  });

  it('signs a losing watch', () => {
    expect(formatAverage({ rate: -4.2, positions: 3 }))
      .toBe('-4.2 s/day average over 3 positions');
  });

  it('does not pluralise one position', () => {
    expect(formatAverage({ rate: 1, positions: 1 }))
      .toBe('+1.0 s/day average over 1 position');
  });
});
