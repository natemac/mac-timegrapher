/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  WIZARD_ORDER, AUTO_CAPTURE_CONFIRMATIONS, STALL_SECONDS,
  startWizard, positionAt, placementFor, stepLabel, begin, captured, advance,
  finish, retry, shouldAutoCapture, hasStalled, skipped, orderIsValid,
} from './wizard';

describe('wizard order', () => {
  it('covers every session position exactly once', () => {
    expect(orderIsValid()).toBe(true);
    expect(new Set(WIZARD_ORDER).size).toBe(WIZARD_ORDER.length);
  });

  it('has placement wording for every position', () => {
    for (const p of WIZARD_ORDER) {
      expect(placementFor(p).length).toBeGreaterThan(10);
    }
  });

  it('starts flat, which is where a session starts', () => {
    expect(WIZARD_ORDER[0]).toBe('dial-up');
  });
});

describe('progression', () => {
  it('runs prompt -> measuring -> captured -> next prompt', () => {
    let s = startWizard();
    expect(s.stage).toBe('prompt');
    expect(positionAt(s.step)).toBe('dial-up');

    s = begin(s);
    expect(s.stage).toBe('measuring');

    s = captured(s);
    expect(s.stage).toBe('captured');
    expect(s.recorded).toEqual(['dial-up']);

    s = advance(s);
    expect(s.stage).toBe('prompt');
    expect(positionAt(s.step)).toBe('dial-down');
  });

  it('finishes after the last position', () => {
    let s = startWizard();
    for (let i = 0; i < WIZARD_ORDER.length; i++) {
      s = advance(captured(begin(s)));
    }
    expect(s.stage).toBe('done');
    expect(s.step).toBe(WIZARD_ORDER.length);
    expect(positionAt(s.step)).toBeNull();
  });

  /*
     Go must not be reachable while a reading is being taken. It restarts the
     average, so a second press mid-measurement would silently throw away the
     twenty seconds the operator was waiting on.
  */
  it('ignores Go unless it is prompting', () => {
    const measuring = begin(startWizard());
    expect(begin(measuring)).toBe(measuring);
  });

  it('ignores a capture that did not come from measuring', () => {
    const prompting = startWizard();
    expect(captured(prompting)).toBe(prompting);
  });

  it('does not record the same position twice on a re-measure', () => {
    let s = captured(begin(startWizard()));
    s = captured(begin(retry(s)));
    expect(s.recorded).toEqual(['dial-up']);
  });

  it('retry goes back to prompting the same position', () => {
    const s = retry(captured(begin(startWizard())));
    expect(s.stage).toBe('prompt');
    expect(positionAt(s.step)).toBe('dial-up');
  });

  it('reports positions stepped past without a reading', () => {
    let s = startWizard();
    s = advance(s);                       // skipped dial-up
    s = advance(captured(begin(s)));      // recorded dial-down
    expect(s.recorded).toEqual(['dial-down']);
    expect(skipped(s)).toEqual(['dial-up']);
  });

  it('finishing early keeps what was recorded', () => {
    const s = finish(captured(begin(startWizard())));
    expect(s.stage).toBe('done');
    expect(s.recorded).toEqual(['dial-up']);
  });

  it('labels the step with a one-based position count', () => {
    expect(stepLabel(startWizard())).toBe('Position 1 of 6 — Dial up');
    expect(stepLabel(finish(startWizard()))).toBe('Finished');
  });
});

describe('automatic capture', () => {
  const base = {
    stage: 'measuring' as const,
    auto: true,
    valid: true,
    settling: 'settled' as const,
    settledRuns: AUTO_CAPTURE_CONFIRMATIONS,
  };

  it('fires once settled has held', () => {
    expect(shouldAutoCapture(base)).toBe(true);
  });

  /*
     The regression this exists for: a reading can graze the settled bounds for
     a single report on its way through. Capturing on the first one put a
     number on a certificate that the next half-second contradicted.
  */
  it('does not fire on a single settled report', () => {
    expect(shouldAutoCapture({ ...base, settledRuns: 1 })).toBe(false);
  });

  it('does not fire while the reading is still moving', () => {
    expect(shouldAutoCapture({ ...base, settling: 'settling' })).toBe(false);
    expect(shouldAutoCapture({ ...base, settling: 'moving' })).toBe(false);
  });

  it('does not fire on an invalid reading', () => {
    expect(shouldAutoCapture({ ...base, valid: false })).toBe(false);
  });

  it('does not fire when the operator did not ask for it', () => {
    expect(shouldAutoCapture({ ...base, auto: false })).toBe(false);
  });

  it('does not fire outside a measurement', () => {
    expect(shouldAutoCapture({ ...base, stage: 'prompt' })).toBe(false);
    expect(shouldAutoCapture({ ...base, stage: 'captured' })).toBe(false);
  });
});

describe('stalling', () => {
  it('reports a stall only after the grace period', () => {
    expect(hasStalled('measuring', 'moving', STALL_SECONDS - 1)).toBe(false);
    expect(hasStalled('measuring', 'moving', STALL_SECONDS)).toBe(true);
  });

  it('never reports a stall on a settled reading', () => {
    expect(hasStalled('measuring', 'settled', STALL_SECONDS * 2)).toBe(false);
  });

  it('never reports a stall while prompting', () => {
    expect(hasStalled('prompt', 'moving', STALL_SECONDS * 2)).toBe(false);
  });
});
