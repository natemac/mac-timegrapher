/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect } from 'react';
import {
  armed, advance, shouldAutoCapture, type WizardStage, type WizardState,
} from '../timegrapher/wizard';
import type { Settling } from '../timegrapher/stability';

/*
   The sequencing of a position, in one place.

   The wizard's state machine says which transitions are legal and the panel
   says what they look like; both are covered. What sat between them was three
   effects in App, and their timing — the grace ticking down, an unattended
   capture firing, capture stopping once a reading is kept — was verified by
   reading it and nothing else. It is the part that decides what lands on a
   customer's document, so it lives here now, where it can be driven by a test.
*/

/** How long a recorded position stays on screen before the run moves on. */
export const RECORDED_PAUSE_MS = 1600;

interface Options {
  /** Inspection is the only mode that has a run. */
  active: boolean;
  wizard: WizardState;
  setWizard: (next: (w: WizardState) => WizardState) => void;

  /** Seconds left of the get-clear grace. */
  countdown: number;
  tickCountdown: () => void;

  settling: Settling;
  valid: boolean;
  auto: boolean;
  /*
     Changes on every measurement report, and nothing else does.

     `settling` only changes when the label changes, so an automatic capture
     keyed on it alone would be judged on transitions rather than on each
     report — and the confirmation count it waits for is counted per report.
     Seconds captured is the value that moves twice a second.
  */
  reportTick: number;
  /** Consecutive settled reports; one is not enough to record on. */
  settledRuns: () => number;
  resetSettledRuns: () => void;

  /** Throw away the average, so nothing heard during the grace is kept. */
  resetAverage: () => void;
  /** Record the current reading against the position being measured. */
  capture: () => void;
  /** End the capture session — a position is one press of Start. */
  stop: () => void;

  note?: (label: string) => void;
}

export function useInspectionRun(o: Options): void {
  const {
    active, wizard, setWizard, countdown, tickCountdown,
    settling, valid, auto, reportTick, settledRuns, resetSettledRuns,
    resetAverage, capture, stop, note,
  } = o;

  const stage: WizardStage = wizard.stage;

  /*
     The grace.

     Audio is already running — it has to be, or the first seconds of the
     reading would be spent opening the device. What the grace buys is the right
     to throw those seconds away: the operator's hand was on the watch when they
     reached for Start, and letting go of it is itself a noise.
  */
  useEffect(() => {
    if (!active || stage !== 'countdown') return;

    if (countdown <= 0) {
      resetSettledRuns();
      note?.('grace elapsed — now counting');
      resetAverage();
      setWizard(armed);
      return;
    }

    const id = window.setTimeout(tickCountdown, 1000);
    return () => window.clearTimeout(id);
    // resetAverage and the callbacks are stable; re-running on their identity
    // would restart the grace under the operator every time App re-renders,
    // which it does twice a second while measuring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stage, countdown]);

  /* An unattended capture, once settled has held long enough to trust. */
  useEffect(() => {
    if (!active) return;
    if (!shouldAutoCapture({
      stage, auto, valid, settling, settledRuns: settledRuns(),
    })) return;

    note?.('auto-record fired');
    capture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stage, auto, valid, settling, reportTick]);

  /*
     One position per press of Start.

     Capture stops as soon as a reading is recorded, so the numbers on screen
     are the ones that were kept rather than a live feed that has moved on, and
     so the watch can be handled without the microphone listening.
  */
  useEffect(() => {
    if (!active || stage !== 'captured') return;

    const id = window.setTimeout(() => {
      stop();
      setWizard(advance);
    }, RECORDED_PAUSE_MS);

    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stage, wizard.step]);
}
