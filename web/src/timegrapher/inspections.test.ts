/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInspection, upsertReading, sameWatch, findPair, orderPair, comparePair,
  inspectionTitle, phaseName, phaseShort, otherPhase,
  loadInspections, saveInspections, putInspection, removeInspection, byRecency,
  loadCurrentId, saveCurrentId, MAX_INSPECTIONS,
  type Inspection,
} from './inspections';
import type { PositionId, Reading } from './session';

beforeEach(() => localStorage.clear());

const reading = (position: PositionId, rate: number): Reading => ({
  position,
  rate,
  amplitude: 260,
  beatError: 0.4,
  bph: 21600,
  at: '2026-08-30T09:00:00.000Z',
});

function run(over: Partial<Inspection> = {}): Inspection {
  return createInspection({ reference: 'MB-0142', ...over });
}

describe('pairing a before with an after', () => {
  it('knows which phase is the other one', () => {
    expect(otherPhase('pre')).toBe('post');
    expect(otherPhase('post')).toBe('pre');
  });

  /*
     The whole reason this module exists. A bench measures a watch, sends it
     out, does thirty other movements, and comes back a fortnight later. The
     reference is what ties the two runs together — nothing about order, or
     timing, or what was measured in between.
  */
  it('pairs two runs on the reference alone, whatever happened in between', () => {
    const before = run({ phase: 'pre', readings: [reading('dial-up', 25)], updatedAt: '2026-08-01T09:00:00Z' });
    const others = [
      run({ reference: 'MB-0199', phase: 'pre', readings: [reading('dial-up', 3)], updatedAt: '2026-08-05T09:00:00Z' }),
      run({ reference: 'MB-0200', phase: 'post', readings: [reading('dial-up', 8)], updatedAt: '2026-08-09T09:00:00Z' }),
    ];
    const after = run({ phase: 'post', readings: [reading('dial-up', 2)], updatedAt: '2026-08-30T09:00:00Z' });

    expect(findPair([before, ...others, after], after)?.id).toBe(before.id);
  });

  it('treats case and stray spaces as the same watch', () => {
    expect(sameWatch('MB-0142', 'mb-0142 ')).toBe(true);
    expect(sameWatch(' mb-0142', 'MB-0142')).toBe(true);
    expect(sameWatch('MB-0142', 'MB-0143')).toBe(false);
  });

  /* Otherwise every unnamed run would pair with every other unnamed run. */
  it('never pairs runs with no reference', () => {
    expect(sameWatch('', '')).toBe(false);
    const a = run({ reference: '', phase: 'pre', readings: [reading('dial-up', 25)] });
    const b = run({ reference: '  ', phase: 'post', readings: [reading('dial-up', 2)] });
    expect(findPair([a, b], b)).toBeNull();
  });

  it('ignores a run of the same phase', () => {
    const a = run({ phase: 'pre', readings: [reading('dial-up', 25)] });
    const b = run({ phase: 'pre', readings: [reading('dial-up', 24)] });
    expect(findPair([a, b], b)).toBeNull();
  });

  it('ignores an empty run', () => {
    const empty = run({ phase: 'pre', readings: [] });
    const after = run({ phase: 'post', readings: [reading('dial-up', 2)] });
    expect(findPair([empty, after], after)).toBeNull();
  });

  it('never pairs a run with itself', () => {
    const only = run({ phase: 'pre', readings: [reading('dial-up', 25)] });
    expect(findPair([only], only)).toBeNull();
  });

  /* A watch regulated twice should report against the state it was actually
     in when this pass began. */
  it('takes the most recent of several candidates', () => {
    const old = run({ phase: 'pre', readings: [reading('dial-up', 40)], updatedAt: '2026-01-01T00:00:00Z' });
    const recent = run({ phase: 'pre', readings: [reading('dial-up', 25)], updatedAt: '2026-08-01T00:00:00Z' });
    const after = run({ phase: 'post', readings: [reading('dial-up', 2)], updatedAt: '2026-08-30T00:00:00Z' });
    expect(findPair([old, recent, after], after)?.id).toBe(recent.id);
  });

  it('puts as-found first however the pair was measured', () => {
    const before = run({ phase: 'pre' });
    const after = run({ phase: 'post' });
    expect(orderPair(after, before).map((i) => i.phase)).toEqual(['pre', 'post']);
    expect(orderPair(before, after).map((i) => i.phase)).toEqual(['pre', 'post']);
    expect(orderPair(before, null)).toEqual([before]);
  });
});

describe('comparePair', () => {
  it('reports what the work achieved', () => {
    const before = run({ phase: 'pre', readings: [reading('dial-up', 25), reading('dial-down', 15)] });
    const after = run({ phase: 'post', readings: [reading('dial-up', 3), reading('dial-down', 1)] });

    const c = comparePair(before, after)!;
    expect(c.positions).toBe(2);
    expect(c.rateBefore).toBe(20);
    expect(c.rateAfter).toBe(2);
    expect(c.spreadBefore).toBe(10);
    expect(c.spreadAfter).toBe(2);
  });

  /* Dial up against crown down would be reporting the difference between two
     positions, not the difference the regulation made. */
  it('is null when the two runs share no position', () => {
    const before = run({ phase: 'pre', readings: [reading('dial-up', 25)] });
    const after = run({ phase: 'post', readings: [reading('crown-down', 2)] });
    expect(comparePair(before, after)).toBeNull();
  });

  it('counts only the positions measured in both', () => {
    const before = run({ phase: 'pre', readings: [reading('dial-up', 25), reading('crown-up', 99)] });
    const after = run({ phase: 'post', readings: [reading('dial-up', 3)] });
    const c = comparePair(before, after)!;
    expect(c.positions).toBe(1);
    expect(c.rateBefore).toBe(25);
  });
});

describe('readings', () => {
  it('replaces a re-measured position rather than adding a second', () => {
    let i = run();
    i = upsertReading(i, reading('dial-up', 25));
    i = upsertReading(i, reading('dial-up', 21));
    expect(i.readings).toHaveLength(1);
    expect(i.readings[0].rate).toBe(21);
  });

  it('keeps positions in bench order', () => {
    let i = run();
    i = upsertReading(i, reading('crown-down', 1));
    i = upsertReading(i, reading('dial-up', 2));
    expect(i.readings.map((r) => r.position)).toEqual(['dial-up', 'crown-down']);
  });

});

describe('naming', () => {
  it('names a run by its watch and its pass', () => {
    expect(inspectionTitle(run({ phase: 'post' }))).toBe('MB-0142 — After regulation');
  });

  it('says so when a run has no reference', () => {
    expect(inspectionTitle(run({ reference: '' }))).toBe('Unnamed — Before regulation');
  });

  /* Plain words, not the trade's. Someone reading a document should not need
     to know what "as found" means. */
  it('names both phases in words a reader knows', () => {
    expect(phaseName('pre')).toBe('Before regulation');
    expect(phaseName('post')).toBe('After regulation');
    expect(phaseShort('pre')).toBe('Before');
    expect(phaseShort('post')).toBe('After');
  });
});

describe('storage', () => {
  it('round trips', () => {
    const a = run({ phase: 'pre' });
    saveInspections([a]);
    expect(loadInspections().map((i) => i.id)).toEqual([a.id]);
  });

  it('starts empty', () => {
    expect(loadInspections()).toEqual([]);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('mac-timegrapher.inspections', 'not json');
    expect(loadInspections()).toEqual([]);
  });

  it('replaces a run in place, keeping it at the front', () => {
    const a = run();
    const b = run();
    const list = putInspection(putInspection([], a), b);
    const edited = { ...a, technician: 'NM' };
    const next = putInspection(list, edited);
    expect(next).toHaveLength(2);
    expect(next[0].technician).toBe('NM');
  });

  it('removes one', () => {
    const a = run();
    const b = run();
    expect(removeInspection([a, b], a.id).map((i) => i.id)).toEqual([b.id]);
  });

  it('lists newest first', () => {
    const old = run({ updatedAt: '2026-01-01T00:00:00Z' });
    const recent = run({ updatedAt: '2026-08-01T00:00:00Z' });
    expect(byRecency([old, recent]).map((i) => i.id)).toEqual([recent.id, old.id]);
  });

  /* A bench that never clears should not fill its storage, and what it wants
     back is the recent work. */
  it('keeps the newest and drops beyond the cap', () => {
    const many = Array.from({ length: MAX_INSPECTIONS + 10 }, (_, n) =>
      run({ updatedAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z` }));
    saveInspections(many);
    const loaded = loadInspections();
    expect(loaded).toHaveLength(MAX_INSPECTIONS);
    expect(loaded[0].updatedAt).toBe(many[many.length - 1].updatedAt);
  });

  it('remembers which run is open', () => {
    saveCurrentId('insp-1');
    expect(loadCurrentId()).toBe('insp-1');
    saveCurrentId(null);
    expect(loadCurrentId()).toBeNull();
  });
});

describe('renaming the phases', () => {
  /* Runs recorded before the trade terms were dropped must still load, and as
     the same pass they were recorded as. */
  it('reads runs stored under the old names', () => {
    localStorage.setItem('mac-timegrapher.inspections', JSON.stringify([
      { ...run({ reference: 'MB-0142' }), phase: 'as-found' },
      { ...run({ reference: 'MB-0142' }), phase: 'as-left' },
    ]));
    expect(loadInspections().map((i) => i.phase).sort()).toEqual(['post', 'pre']);
  });

  it('treats an unrecognised phase as before regulation', () => {
    localStorage.setItem('mac-timegrapher.inspections', JSON.stringify([
      { ...run(), phase: 'nonsense' },
    ]));
    expect(loadInspections()[0].phase).toBe('pre');
  });
});

describe('migration from the single-session store', () => {
  /* A session open across the change should survive it, split back into the
     runs it was really two of. */
  it('splits phase-tagged readings into a run each', () => {
    localStorage.setItem('mac-timegrapher.session', JSON.stringify([
      { position: 'dial-up', phase: 'as-found', rate: 25, amplitude: 250, beatError: 1.5, bph: 21600, at: '2026-08-01T00:00:00Z' },
      { position: 'dial-up', phase: 'as-left', rate: 2, amplitude: 265, beatError: 0.3, bph: 21600, at: '2026-08-02T00:00:00Z' },
    ]));
    localStorage.setItem('mac-timegrapher.session-meta', JSON.stringify({
      reference: 'MB-0142', technician: 'NM',
      notes: 'n',
    }));

    const loaded = loadInspections();
    expect(loaded).toHaveLength(2);

    const found = loaded.find((i) => i.phase === 'pre')!;
    const left = loaded.find((i) => i.phase === 'post')!;
    expect(found.reference).toBe('MB-0142');
    expect(found.readings[0].rate).toBe(25);
    expect(left.readings[0].rate).toBe(2);
    // The phase belongs to the run now, not to every reading in it.
    expect('phase' in found.readings[0]).toBe(false);
  });

  it('treats untagged readings as before regulation, which is what one pass is', () => {
    localStorage.setItem('mac-timegrapher.session', JSON.stringify([
      { position: 'dial-up', rate: 12, amplitude: 260, beatError: 0.3, bph: 21600, at: '2026-08-01T00:00:00Z' },
    ]));
    const loaded = loadInspections();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].phase).toBe('pre');
  });

  it('does not migrate again once the new store exists', () => {
    localStorage.setItem('mac-timegrapher.session', JSON.stringify([
      { position: 'dial-up', rate: 12, amplitude: 260, beatError: 0.3, bph: 21600, at: '2026-08-01T00:00:00Z' },
    ]));
    loadInspections();
    saveInspections([]);
    expect(loadInspections()).toEqual([]);
  });
});
