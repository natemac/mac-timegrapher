/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useInspectionRun, RECORDED_PAUSE_MS } from './useInspectionRun';
import {
  startWizard, begin, armed, captured, AUTO_CAPTURE_CONFIRMATIONS,
  type WizardState,
} from '../timegrapher/wizard';
import type { Settling } from '../timegrapher/stability';

/*
   The sequencing that decides what lands on a customer's document. It used to
   live in three App effects and was verified by reading them.
*/
interface Setup {
  active?: boolean;
  wizard?: WizardState;
  countdown?: number;
  settling?: Settling;
  valid?: boolean;
  auto?: boolean;
  reportTick?: number;
  settledRuns?: number;
}

function harness(initial: Setup = {}) {
  const calls = {
    resetAverage: vi.fn(),
    capture: vi.fn(),
    stop: vi.fn(),
    tickCountdown: vi.fn(),
    resetSettledRuns: vi.fn(),
  };
  let wizard = initial.wizard ?? startWizard();
  const setWizard = vi.fn((next: (w: WizardState) => WizardState) => { wizard = next(wizard); });

  function Host(props: Setup) {
    useInspectionRun({
      active: props.active ?? true,
      wizard: props.wizard ?? wizard,
      setWizard,
      countdown: props.countdown ?? 3,
      tickCountdown: calls.tickCountdown,
      settling: props.settling ?? 'settled',
      valid: props.valid ?? true,
      auto: props.auto ?? true,
      reportTick: props.reportTick ?? 0,
      settledRuns: () => props.settledRuns ?? AUTO_CAPTURE_CONFIRMATIONS,
      resetSettledRuns: calls.resetSettledRuns,
      resetAverage: calls.resetAverage,
      capture: calls.capture,
      stop: calls.stop,
    });
    return null;
  }

  const view = render(<Host {...initial} />);
  return {
    calls,
    rerender: (next: Setup) => view.rerender(<Host {...initial} {...next} />),
    get wizard() { return wizard; },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the get-clear grace', () => {
  it('counts down a second at a time', () => {
    const h = harness({ wizard: begin(startWizard()), countdown: 3 });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(h.calls.tickCountdown).toHaveBeenCalledOnce();
  });

  /*
     The whole point of the grace: the operator's hand was on the watch when
     they reached for Start, so everything heard until now is thrown away.
  */
  it('restarts the average when it expires, and only then', () => {
    const h = harness({ wizard: begin(startWizard()), countdown: 2 });
    expect(h.calls.resetAverage).not.toHaveBeenCalled();

    h.rerender({ countdown: 0 });
    expect(h.calls.resetAverage).toHaveBeenCalledOnce();
    expect(h.wizard.stage).toBe('measuring');
  });

  it('does not run before Start, or after the reading has begun', () => {
    const before = harness({ wizard: startWizard(), countdown: 0 });
    expect(before.calls.resetAverage).not.toHaveBeenCalled();

    const during = harness({ wizard: armed(begin(startWizard())), countdown: 0 });
    expect(during.calls.resetAverage).not.toHaveBeenCalled();
  });
});

describe('recording without being asked', () => {
  const measuring = armed(begin(startWizard()));

  it('fires once settled has held', () => {
    const h = harness({ wizard: measuring, settling: 'settled' });
    expect(h.calls.capture).toHaveBeenCalledOnce();
  });

  /*
     The regression this guards. `settling` only changes when the label
     changes, so keying the check on it alone would judge on transitions rather
     than on each report — and the confirmations it waits for are counted per
     report. Seconds captured is what moves twice a second.
  */
  it('is re-judged on every report, not only when the label changes', () => {
    const h = harness({
      wizard: measuring, settling: 'settled', settledRuns: 1, reportTick: 1,
    });
    expect(h.calls.capture).not.toHaveBeenCalled();

    // Same label, another report, and now enough confirmations behind it.
    h.rerender({ settledRuns: AUTO_CAPTURE_CONFIRMATIONS, reportTick: 2 });
    expect(h.calls.capture).toHaveBeenCalledOnce();
  });

  it('waits for the reading to settle', () => {
    const h = harness({ wizard: measuring, settling: 'settling' });
    expect(h.calls.capture).not.toHaveBeenCalled();
  });

  it('does not fire when the operator turned it off', () => {
    const h = harness({ wizard: measuring, auto: false });
    expect(h.calls.capture).not.toHaveBeenCalled();
  });

  it('never fires during the grace', () => {
    const h = harness({ wizard: begin(startWizard()), settling: 'settled' });
    expect(h.calls.capture).not.toHaveBeenCalled();
  });
});

describe('ending a position', () => {
  const recorded = captured(armed(begin(startWizard())));

  /*
     Capture stops once a reading is kept, so the numbers on screen are the ones
     recorded rather than a feed that has moved on — and so the watch can be
     handled without the microphone listening.
  */
  it('stops capture and moves to the next position', () => {
    const h = harness({ wizard: recorded });
    expect(h.calls.stop).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(RECORDED_PAUSE_MS); });
    expect(h.calls.stop).toHaveBeenCalledOnce();
    expect(h.wizard.stage).toBe('prompt');
    expect(h.wizard.step).toBe(1);
  });

  it('holds the recorded reading on screen first', () => {
    const h = harness({ wizard: recorded });
    act(() => { vi.advanceTimersByTime(RECORDED_PAUSE_MS - 100); });
    expect(h.calls.stop).not.toHaveBeenCalled();
  });

  it('does not stop capture at any other point in the run', () => {
    for (const w of [startWizard(), begin(startWizard()), armed(begin(startWizard()))]) {
      const h = harness({ wizard: w });
      act(() => { vi.advanceTimersByTime(RECORDED_PAUSE_MS * 2); });
      expect(h.calls.stop).not.toHaveBeenCalled();
    }
  });
});

describe('outside an inspection', () => {
  /* Measure mode has no run: nothing here may touch the average, the session
     or the capture. */
  it('does nothing at all', () => {
    const h = harness({ active: false, wizard: captured(armed(begin(startWizard()))), countdown: 0 });
    act(() => { vi.advanceTimersByTime(RECORDED_PAUSE_MS * 2); });

    expect(h.calls.resetAverage).not.toHaveBeenCalled();
    expect(h.calls.capture).not.toHaveBeenCalled();
    expect(h.calls.stop).not.toHaveBeenCalled();
  });
});
