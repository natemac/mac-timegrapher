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

    const field = screen.getByLabelText('Reference or build number');
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
  it('names the run after the reference as it is typed', async () => {
    const user = userEvent.setup();
    render(<Host />);

    expect(screen.getAllByText('MB-0142').length).toBeGreaterThan(0);

    const field = screen.getByLabelText('Reference or build number');
    await user.clear(field);
    await user.keyboard('MB-0199');

    expect(screen.getAllByText('MB-0199').length).toBeGreaterThan(0);
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

describe('the run summary line', () => {
  it('is editable by hand', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const field = screen.getByLabelText('Before regulation summary');
    await user.click(field);
    await user.keyboard('+27, uniformly fast');

    expect(field).toHaveValue('+27, uniformly fast');
    expect(field).toHaveFocus();
  });

  /* This run's own average, which is unambiguous now that a run is one pass
     over one watch — it used to mean "whatever was measured most recently". */
  it('fills from this run\'s average', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: "Fill with this run's measured average" }));
    expect(screen.getByLabelText('Before regulation summary'))
      .toHaveValue('+12.4 s/day average over 1 position');
  });

  it('follows the mark, so it asks for the pass it is on', async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole('button', { name: 'After regulation' }));
    expect(screen.getByLabelText('After regulation summary')).toBeInTheDocument();
    expect(screen.queryByLabelText('Before regulation summary')).not.toBeInTheDocument();
  });
});

describe('marking a run', () => {
  it('starts as found and can be marked as left', async () => {
    const user = userEvent.setup();
    render(<Host />);

    expect(screen.getByRole('button', { name: 'Before regulation' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'After regulation' }));
    expect(screen.getByRole('button', { name: 'After regulation' })).toHaveAttribute('aria-pressed', 'true');
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
    await user.click(screen.getByRole('button', { name: 'After regulation' }));
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

    await user.clear(screen.getByLabelText('Reference or build number'));
    expect(screen.queryByText(/paired with/i)).not.toBeInTheDocument();
  });

  it('clears the reading to start the next watch', async () => {
    const user = userEvent.setup();
    render(<Host />);

    const clear = screen.getByRole('button', { name: 'Clear this reading and start the next watch' });
    await user.click(clear);
    expect(screen.getByRole('button', { name: /sure/i })).toBeInTheDocument();
  });
});
