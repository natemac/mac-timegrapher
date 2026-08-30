/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspectionWizard } from './InspectionWizard';
import { startWizard, begin, armed, captured, type WizardState } from '../timegrapher/wizard';

/*
   Plain props, no audio. This is also the only way to see most of these
   states: the wizard only reaches them when the DSP core returns a settled
   reading, which needs a real watch on a real sensor.
*/
function panel(state: WizardState, over: Record<string, unknown> = {}) {
  return (
    <InspectionWizard
      state={state}
      phase="as-found"
      capturing={state.stage === 'countdown' || state.stage === 'measuring'}
      settling="settled"
      valid
      seconds={22}
      countdown={3}
      auto
      onAutoChange={() => {}}
      onCapture={() => {}}
      onSkip={() => {}}
      onNext={() => {}}
      onRetry={() => {}}
      onFinish={() => {}}
      onRestart={() => {}}
      onOpenSummary={() => {}}
      onJump={() => {}}
      {...over}
    />
  );
}

const PROMPT = startWizard();
const COUNTDOWN = begin(PROMPT);
const MEASURING = armed(COUNTDOWN);
const CAPTURED = captured(MEASURING);

describe('what the panel tells the operator to do', () => {
  /*
     The regression this replaced: the panel had its own Go button beside the
     Start button in the setup panel. Two controls looked like the way to
     begin, one was, and pressing Start appeared to do nothing.
  */
  it('names the position and points at Start, and offers no rival button', () => {
    render(panel(PROMPT));
    expect(screen.getByText('Dial up position')).toBeInTheDocument();
    expect(screen.getByText(/press/i)).toHaveTextContent('Press START to begin');
    expect(screen.queryByRole('button', { name: 'Go' })).not.toBeInTheDocument();
  });

  it('counts down before anything is kept', () => {
    render(panel(COUNTDOWN, { countdown: 2 }));
    expect(screen.getByText(/hands off/i)).toHaveTextContent('Hands off — starting in 2');
  });

  it('reports the reading once it is counting', () => {
    render(panel(MEASURING, { settling: 'settling' }));
    expect(screen.getByText(/listening/i)).toHaveTextContent('Listening… 22s');
  });

  it('says the position was recorded and to turn the watch', () => {
    render(panel(CAPTURED));
    expect(screen.getByText('Dial up recorded')).toBeInTheDocument();
    expect(screen.getByText(/turn the watch/i)).toBeInTheDocument();
  });
});

describe('recording', () => {
  it('offers no Record button while it will record by itself', () => {
    render(panel(MEASURING, { auto: true }));
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument();
  });

  it('offers one as soon as automatic is turned off', () => {
    render(panel(MEASURING, { auto: false }));
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
  });

  it('withholds it until the reading has settled', () => {
    render(panel(MEASURING, { auto: false, settling: 'moving', seconds: 12 }));
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
  });

  /* A reading that will not settle is still a reading; refusing to record it
     forever is a dead end rather than a safeguard. */
  it('allows a stalled reading to be recorded deliberately', () => {
    render(panel(MEASURING, { auto: false, settling: 'moving', seconds: 90 }));
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
  });

  it('has nothing to automate before a position is running', () => {
    render(panel(PROMPT));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('records on demand', async () => {
    const onCapture = vi.fn();
    const user = userEvent.setup();
    render(panel(MEASURING, { auto: false, onCapture }));
    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(onCapture).toHaveBeenCalledOnce();
  });
});

describe('progress', () => {
  it('marks recorded, current and pending positions apart', () => {
    render(panel(captured(armed(begin(startWizard())))));
    const dots = document.querySelectorAll('.wizard__dot');
    expect(dots).toHaveLength(6);
    expect(dots[0].getAttribute('data-state')).toBe('done');
    expect(dots[1].getAttribute('data-state')).toBe('pending');
  });

  it('jumps to a position when its dot is pressed', async () => {
    const onJump = vi.fn();
    const user = userEvent.setup();
    render(panel(PROMPT, { onJump }));
    await user.click(screen.getByRole('button', { name: 'Measure Crown down' }));
    expect(onJump).toHaveBeenCalledWith(2);
  });
});
