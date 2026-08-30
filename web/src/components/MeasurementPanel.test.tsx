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
  it('sits at the foot of the panel, not in its header', () => {
    render(panel());
    const button = screen.getByRole('button', { name: /capture/i });
    expect(document.querySelector('.panel__foot')!.contains(button)).toBe(true);
    expect(document.querySelector('.panel__head')!.contains(button)).toBe(false);
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
