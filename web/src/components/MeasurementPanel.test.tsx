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
import { MeasurementPanel } from './MeasurementPanel';
import type { Measurement } from '../timegrapher/tg-engine';

/*
   This panel takes plain props and touches no audio, so there is nothing to
   mock — the no-tests rule covers the components wired to the Web Audio graph,
   not this one.
*/
const VALID: Measurement = {
  rate: 12.4,
  amplitude: 248,
  beatError: 1.3,
  detectedBph: 21600,
  signalQuality: 1,
  valid: true,
};

const NO_SPREADS = { rate: null, amplitude: null, beatError: null };

function panel(over: Partial<Parameters<typeof MeasurementPanel>[0]> = {}) {
  return (
    <MeasurementPanel
      measurement={VALID}
      capturing
      secondsCaptured={30}
      settling="settled"
      spreads={NO_SPREADS}
      onHelp={() => {}}
      onResetAverage={() => {}}
      onSnapshot={() => {}}
      {...over}
    />
  );
}

describe('the Capture control', () => {
  it('rides the settling row, not the panel header', () => {
    render(panel());
    const button = screen.getByRole('button', { name: /capture/i });
    expect(document.querySelector('.panel__settle')!.contains(button)).toBe(true);
    expect(document.querySelector('.panel__head')!.contains(button)).toBe(false);
  });

  /* The settling indicator is what says the reading is worth saving, so the
     two share a row rather than the button taking one of its own. */
  it('leaves the indicator its width', () => {
    render(panel());
    const row = document.querySelector('.panel__settle')!;
    expect(row.querySelector('.panel__settle-bar')).not.toBeNull();
  });

  it('is labelled, not just an icon', () => {
    render(panel());
    expect(screen.getByRole('button', { name: /capture/i })).toHaveTextContent(/capture/i);
  });

  /* An image of four dashes is not a reading. */
  it('stays away until there is a reading worth saving', () => {
    render(panel({ measurement: { ...VALID, valid: false } }));
    expect(screen.queryByRole('button', { name: /capture/i })).not.toBeInTheDocument();
  });

  it('stays away when nothing is being measured', () => {
    render(panel({ capturing: false, measurement: null }));
    expect(screen.queryByRole('button', { name: /capture/i })).not.toBeInTheDocument();
  });

  it('is absent when the app gave it nothing to do', () => {
    render(panel({ onSnapshot: undefined }));
    expect(screen.queryByRole('button', { name: /capture/i })).not.toBeInTheDocument();
  });

  it('calls back when pressed', async () => {
    const onSnapshot = vi.fn();
    const user = userEvent.setup();
    render(panel({ onSnapshot }));
    await user.click(screen.getByRole('button', { name: /capture/i }));
    expect(onSnapshot).toHaveBeenCalledOnce();
  });
});

describe('guidance', () => {
  /* In an inspection run the wizard says this per position, and better. */
  it('is suppressed when the caller turns it off', () => {
    render(panel({ guidance: false }));
    expect(screen.queryByText(/readings have stopped moving/i)).not.toBeInTheDocument();
  });

  it('reports a settled reading when it is on', () => {
    render(panel({ guidance: true }));
    expect(screen.getByText(/readings have stopped moving/i)).toBeInTheDocument();
  });
});

/*
   An inspection stops capture between positions, so the readings used to go
   blank at exactly the moment there was something worth looking at.
*/
describe('the set so far', () => {
  const SUMMARY = {
    count: 3,
    bph: 21600,
    rate: { mean: 10.0, min: 3.7, max: 15.2 },
    amplitude: { mean: 214, min: 194, max: 236 },
    beatError: { mean: 1.5, min: 0.67, max: 1.88 },
    positionalSpread: 11.5,
  };

  it('fills the panel while capture is stopped between positions', () => {
    render(panel({ capturing: false, measurement: null, summary: SUMMARY }));

    expect(screen.getByText('+10.0')).toBeInTheDocument();
    expect(screen.getByText('214')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();
    expect(screen.getByText('21,600')).toBeInTheDocument();
  });

  it('shows the range each reading has covered', () => {
    render(panel({ capturing: false, measurement: null, summary: SUMMARY }));
    expect(screen.getByText('+3.7 to +15.2')).toBeInTheDocument();
    expect(screen.getByText('194 to 236')).toBeInTheDocument();
  });

  it('counts the positions and names the spread', () => {
    render(panel({ capturing: false, measurement: null, summary: SUMMARY }));
    expect(screen.getByText(/3 positions so far/)).toBeInTheDocument();
    expect(screen.getByText(/11.5/)).toBeInTheDocument();
  });

  /* One position cannot disagree with itself. */
  it('does not offer a spread from a single position', () => {
    render(panel({
      capturing: false,
      measurement: null,
      summary: { ...SUMMARY, count: 1, positionalSpread: 0 },
    }));
    expect(screen.getByText(/1 position so far/)).toBeInTheDocument();
    expect(screen.queryByText(/spread/)).not.toBeInTheDocument();
  });

  /*
     The panel must never show yesterday's average over a watch that is on the
     sensor now.
  */
  it('gives way the moment something is being measured', () => {
    render(panel({ capturing: true, summary: SUMMARY }));
    expect(screen.getByText('+12.4')).toBeInTheDocument();
    expect(screen.queryByText('+10.0')).not.toBeInTheDocument();
    expect(screen.queryByText(/positions so far/)).not.toBeInTheDocument();
  });

  it('falls back to dashes when there is no set and nothing running', () => {
    render(panel({ capturing: false, measurement: null, summary: null }));
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  /*
     A stepper motor has no balance wheel, summary or no summary. hasAmplitude
     already carried the quartz check; the summary branch did not, and an
     earlier version of this test only looked at beat error and missed it.
  */
  it('still withholds amplitude and beat error for quartz', () => {
    render(panel({ capturing: false, measurement: null, summary: SUMMARY, quartz: true }));

    expect(screen.getByText('+10.0')).toBeInTheDocument();   // rate still shows
    expect(screen.queryByText('214')).not.toBeInTheDocument();       // amplitude
    expect(screen.queryByText('194 to 236')).not.toBeInTheDocument();
    expect(screen.queryByText('1.5')).not.toBeInTheDocument();       // beat error
    expect(screen.queryByText('0.67 to 1.88')).not.toBeInTheDocument();
  });
});
