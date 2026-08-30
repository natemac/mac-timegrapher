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
import { EMPTY_META, type Reading, type SessionMeta } from '../timegrapher/session';

const READING: Reading = {
  position: 'dial-up',
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
  return (
    <SessionSheet
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
