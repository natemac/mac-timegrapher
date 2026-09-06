/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { inspectionNote, type NoteFacts } from './inspection-note';

const facts = (over: Partial<NoteFacts> = {}): NoteFacts => ({
  stage: 'prompt',
  countdown: 3,
  capturing: false,
  settled: false,
  currentName: 'Dial up',
  lastCapturedName: null,
  recorded: 0,
  total: 6,
  ...over,
});

describe('the one instruction on the inspection panel', () => {
  it('opens by asking for the first position', () => {
    expect(inspectionNote(facts())).toBe('Place the watch dial up, then press Start.');
  });

  /* The grace exists so the operator can let go. Saying so is the whole point
     of it — a countdown with no reason attached invites people to keep hold. */
  it('says why it is counting down', () => {
    expect(inspectionNote(facts({ stage: 'countdown', countdown: 2 })))
      .toBe('Starting in 2… Move away and let vibrations settle.');
  });

  it('distinguishes waiting for a reading from being ready to keep one', () => {
    expect(inspectionNote(facts({ stage: 'measuring', capturing: true })))
      .toBe('Keep the watch still. Waiting for a stable reading…');
    expect(inspectionNote(facts({ stage: 'measuring', capturing: true, settled: true })))
      .toBe('Reading locked. Ready to capture.');
  });

  it('names what was kept, then what to do next', () => {
    expect(inspectionNote(facts({
      stage: 'prompt',
      currentName: 'Dial down',
      lastCapturedName: 'Dial up',
      recorded: 1,
    }))).toBe('Dial up captured. Place the watch dial down, then press Start.');
  });

  it('sends the operator to the report once every position is in', () => {
    expect(inspectionNote(facts({ stage: 'done', currentName: null, recorded: 6 })))
      .toBe('All six positions captured. Review your summary.');
  });
});
