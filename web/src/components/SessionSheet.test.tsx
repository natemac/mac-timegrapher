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
import type { Reading } from '../timegrapher/session';
import { createInspection, type Inspection } from '../timegrapher/inspections';

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
function Host({ saved = [] as Inspection[] }: { saved?: Inspection[] } = {}) {
  const [current, setCurrent] = useState<Inspection>(() =>
    createInspection({
      reference: 'MB-0142',
      movementName: 'Seiko / TMI NH35',
      readings: [READING],
    }));

  return (
    <SessionSheet
      open
      onClose={() => {}}
      current={current}
      saved={saved}
      onChange={setCurrent}
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

    const field = screen.getByLabelText('Build number');
    await user.clear(field);
    await user.keyboard('MB-0199');

    expect(field).toHaveValue('MB-0199');
    expect(field).toHaveFocus();
  });

  it('accepts a whole name in the technician field', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const field = screen.getByLabelText('Measured by');
    await user.click(field);
    await user.keyboard('N. McGraw');

    expect(field).toHaveValue('N. McGraw');
    expect(field).toHaveFocus();
  });

  it('accepts multi-word notes', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const field = screen.getByLabelText('Notes');
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
  /* It used to be a heading with a field under it holding the same text. */
  it('shows the build number once, as the field you type in', () => {
    render(<Host />);
    expect(screen.getByLabelText('Build number')).toHaveValue('MB-0142');
    expect(screen.queryByText('MB-0142')).not.toBeInTheDocument();
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
    for (const name of [
      'Export inspection — print or save as PDF',
      'Copy the results as text',
      'Clear this reading and start the next watch',
    ]) {
      expect(actions!.contains(screen.getByRole('button', { name }))).toBe(true);
    }
  });

});

describe('marking a run', () => {
  it('starts on Pre and can be marked Post', async () => {
    const user = userEvent.setup();
    render(<Host />);

    expect(screen.getByRole('radio', { name: 'Pre' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Post' }));
    expect(screen.getByRole('radio', { name: 'Post' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Pre' })).not.toBeChecked();
  });

  /*
     The point of the whole model: a run pairs with the opposite pass for the
     same reference, whenever it happened.
  */
  it('says when it has found the other half of a before-and-after', async () => {
    const user = userEvent.setup();
    const earlier = createInspection({
      reference: 'MB-0142',
      phase: 'post',
      readings: [READING],
      updatedAt: '2026-08-01T09:00:00.000Z',
    });
    render(<Host saved={[earlier]} />);

    expect(screen.getByText(/paired with the after reading/i)).toBeInTheDocument();

    // Marking this reading "after" too leaves nothing to pair with.
    await user.click(screen.getByRole('radio', { name: 'Post' }));
    expect(screen.queryByText(/paired with/i)).not.toBeInTheDocument();
  });

  /*
     It says nothing at all unless there is genuinely a match. Promising that
     one will turn up would be promising the browser keeps things, and a
     cleared cache or another device loses them.
  */
  it('stays quiet when there is nothing to pair with', () => {
    render(<Host />);
    expect(screen.queryByText(/paired with/i)).not.toBeInTheDocument();
  });

  it('does not pair on a blank reference', async () => {
    const user = userEvent.setup();
    const earlier = createInspection({
      reference: '',
      phase: 'post',
      readings: [READING],
    });
    render(<Host saved={[earlier]} />);

    await user.clear(screen.getByLabelText('Build number'));
    expect(screen.queryByText(/paired with/i)).not.toBeInTheDocument();
  });

  it('clears the reading to start the next watch', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(
      screen.getByRole('button', { name: 'Clear this reading and start the next watch' }),
    );
    // The label follows the state, so it is not silent to a screen reader.
    expect(screen.getByRole('button', { name: 'Press again to clear this reading' }))
      .toHaveTextContent('Sure?');
  });
});
