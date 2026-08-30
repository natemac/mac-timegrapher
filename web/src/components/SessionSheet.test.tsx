/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionSheet } from './SessionSheet';
import { EMPTY_META, type Phase, type Reading, type SessionMeta } from '../timegrapher/session';

const READING: Reading = {
  position: 'dial-up',
  phase: 'as-found',
  rate: 12.4,
  amplitude: 248,
  beatError: 1.3,
  bph: 21600,
  at: '2026-08-30T09:00:00.000Z',
};

/*
   Stands in for App: it owns the meta state, so every keystroke re-renders the
   sheet, and it passes a fresh arrow for onClose exactly as App did. Both are
   load-bearing — the bug only appears when the parent behaves this way.
*/
function Host() {
  const [meta, setMeta] = useState<SessionMeta>(EMPTY_META);
  const [phase, setPhase] = useState<Phase>('as-found');
  return (
    <SessionSheet
      phase={phase}
      onPhaseChange={setPhase}
      open
      onClose={() => {}}
      readings={[READING]}
      movementName="Seiko / TMI NH35"
      meta={meta}
      onChangeMeta={setMeta}
      onPrint={() => {}}
      onClear={() => {}}
    />
  );
}

describe('SessionSheet certificate fields', () => {
  /*
     The regression: the focus-on-open effect also carried the Escape listener,
     so it depended on onClose. A parent that recreates that arrow each render
     re-ran the effect on every keystroke and moved focus to the close button.
     The field took exactly one character per tap.
  */
  it('accepts a whole reference without losing focus', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const field = screen.getByPlaceholderText('Reference or build number');
    await user.click(field);
    await user.keyboard('MB-0142');

    expect(field).toHaveValue('MB-0142');
    expect(field).toHaveFocus();
  });

  it('accepts a whole name in the technician field', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const field = screen.getByPlaceholderText('Measured by');
    await user.click(field);
    await user.keyboard('N. McGraw');

    expect(field).toHaveValue('N. McGraw');
    expect(field).toHaveFocus();
  });

  it('accepts multi-word notes', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const field = screen.getByPlaceholderText('Notes (optional)');
    await user.click(field);
    await user.keyboard('Regulated from +25 s/day.');

    expect(field).toHaveValue('Regulated from +25 s/day.');
    expect(field).toHaveFocus();
  });

  it('moves focus to the close button when it opens', () => {
    render(<Host />);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});

describe('SessionSheet header', () => {
  it('names the session after the reference as it is typed', async () => {
    const user = userEvent.setup();
    render(<Host />);

    expect(screen.getByText('Session — Seiko / TMI NH35')).toBeInTheDocument();

    await user.click(screen.getByPlaceholderText('Reference or build number'));
    await user.keyboard('MB-0142');

    expect(screen.getByText('MB-0142 — Seiko / TMI NH35')).toBeInTheDocument();
    expect(screen.queryByText('Session — Seiko / TMI NH35')).not.toBeInTheDocument();
  });

  /*
     These used to sit under the summary, so reaching the button the sheet was
     opened for meant scrolling past every position. They belong outside the
     scrolling region.
  */
  it('keeps the actions out of the scrolling body', () => {
    render(<Host />);
    const actions = document.querySelector('.sheet__actions');
    expect(actions).not.toBeNull();
    expect(actions!.querySelector('.sheet__body')).toBeNull();
    expect(document.querySelector('.sheet__body')!.contains(actions)).toBe(false);
    for (const name of ['Timing inspection — print or save as PDF', 'Copy the results as text', 'Clear']) {
      expect(actions!.contains(screen.getByRole('button', { name }))).toBe(true);
    }
  });

  it('asks twice before clearing', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: 'Sure?' })).toBeInTheDocument();
  });
});

describe('the pre and post regulation fields', () => {
  it('are editable by hand', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const field = screen.getByLabelText('Pre-regulation');
    await user.click(field);
    await user.keyboard('+27, uniformly fast');

    expect(field).toHaveValue('+27, uniformly fast');
    expect(field).toHaveFocus();
  });

  it('fills from the measured average when asked', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(
      screen.getByRole('button', { name: 'Fill Post-regulation with the latest measured average' }),
    );
    expect(screen.getByLabelText('Post-regulation'))
      .toHaveValue('+12.4 s/day average over 1 position');
  });

  /* Fill writes rather than binds: a figure the watchmaker has committed to
     must not be rewritten by a later reading, or by the other button. */
  it('leaves the other field alone', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(
      screen.getByRole('button', { name: 'Fill Pre-regulation with the latest measured average' }),
    );
    expect(screen.getByLabelText('Pre-regulation')).not.toHaveValue('');
    expect(screen.getByLabelText('Post-regulation')).toHaveValue('');
  });

  it('overwrites a filled value when filled again', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const field = screen.getByLabelText('Pre-regulation');
    await user.click(field);
    await user.keyboard('typed');
    await user.click(
      screen.getByRole('button', { name: 'Fill Pre-regulation with the latest measured average' }),
    );
    expect(field).toHaveValue('+12.4 s/day average over 1 position');
  });
});
