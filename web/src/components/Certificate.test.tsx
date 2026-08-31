/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Certificate } from './Certificate';
import { createInspection, type Inspection } from '../timegrapher/inspections';
import type { PositionId, Reading } from '../timegrapher/session';

/*
   The document a customer is handed. It had no tests at all, which for the one
   artefact that leaves the building was the wrong way round.
*/
const reading = (
  position: PositionId, rate: number, amplitude = 250, beatError = 1.2,
): Reading => ({ position, rate, amplitude, beatError, bph: 21600, at: '2026-08-30T19:34:00.000Z' });

function run(over: Partial<Inspection> = {}): Inspection {
  return createInspection({
    reference: 'MB-0142',
    movementName: 'Seiko / TMI NH35',
    technician: 'N. McGraw',
    readings: [reading('dial-up', 15.2, 236, 1.84), reading('dial-down', 3.7, 213, 0.67)],
    ...over,
  });
}

function doc(over: Partial<Parameters<typeof Certificate>[0]> = {}) {
  const current = over.current ?? run();
  return (
    <Certificate
      current={current}
      saved={[]}
      liftAngle={53}
      deviceLabel="USB PnP Sound Device"
      sampleRate={44100}
      showLogo
      quartz={false}
      {...over}
    />
  );
}

describe('what the document states', () => {
  it('names the watch, the calibre and how it was measured', () => {
    render(doc());
    expect(screen.getByText('MB-0142')).toBeInTheDocument();
    expect(screen.getByText('Seiko / TMI NH35')).toBeInTheDocument();
    expect(screen.getByText('N. McGraw')).toBeInTheDocument();
    expect(screen.getByText(/USB PnP Sound Device/)).toBeInTheDocument();
  });

  /*
     Amplitude is derived from the lift angle rather than measured, so the
     document has to say which one it used — the number is meaningless without
     it, and a different angle gives a proportionally different amplitude.
  */
  it('states the lift angle amplitude was derived from', () => {
    render(doc());
    expect(screen.getByText('53°')).toBeInTheDocument();
    expect(screen.getByText(/derived from the stated lift angle/)).toBeInTheDocument();
  });

  /*
     Pass and fail thresholds differ by calibre and by customer. A public tool
     asserting one would be making a claim it cannot support, so the document
     must keep saying it does not.
  */
  it('asserts no conformance to any standard', () => {
    render(doc());
    expect(screen.getByText(/does not assert conformance to any standard/)).toBeInTheDocument();
  });

  /* GPLv2 attribution to upstream travels with the document. */
  it('credits tg and names the licence', () => {
    render(doc());
    expect(screen.getByText(/Marcello Mamino/)).toBeInTheDocument();
    expect(screen.getByText(/GPLv2/)).toBeInTheDocument();
  });

  it('carries the date and the time', () => {
    render(doc());
    expect(screen.getByText(/August 30, 2026 at/)).toBeInTheDocument();
  });
});

/*
   The document is aria-hidden — it is a print artefact and has no business
   being announced in the app — so it is read here through the DOM rather than
   through roles, which cannot see into it.
*/
const rows = () => [...document.querySelectorAll('.certificate__table tbody tr')]
  .map((r) => r.textContent ?? '');
const summaryText = () => document.querySelector('.certificate__summary')?.textContent ?? '';

describe('the readings', () => {
  it('prints every position measured, signed', () => {
    render(doc());
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toBe('Dial up+15.22361.84');
    expect(rows()[1]).toBe('Dial down+3.72130.67');
  });

  it('leaves out a position that was never measured', () => {
    render(doc());
    expect(screen.queryByText('Crown down')).not.toBeInTheDocument();
  });

  /* Amplitude of 0 is the core saying it could not determine it, which is not
     a movement that barely swings. */
  it('prints an undetermined amplitude as a dash, never as zero', () => {
    render(doc({ current: run({ readings: [reading('dial-up', 15.2, 0, 1.84)] }) }));
    expect(rows()[0]).toBe('Dial up+15.2—1.84');
  });

  it('summarises the set', () => {
    render(doc());
    // (15.2 + 3.7) / 2 lands a hair under 9.45 in binary, so it rounds down.
    expect(summaryText()).toContain('Average rate+9.4 s/day');
    expect(summaryText()).toContain('Positional spread11.5 s/day');
    expect(summaryText()).toContain('Lowest amplitude213°');
    expect(summaryText()).toContain('Greatest beat error1.84 ms');
  });
});

describe('quartz', () => {
  /*
     A stepper motor has no balance wheel, so amplitude and beat error are not
     unknown — they do not exist, and a document must not imply otherwise.
  */
  it('withholds amplitude and beat error, and says why', () => {
    render(doc({ quartz: true }));
    expect(rows()[0]).toBe('Dial up+15.2——');
    expect(summaryText()).not.toContain('Lowest amplitude');
    expect(screen.getByText(/no balance wheel/)).toBeInTheDocument();
  });

  it('does not print a lift angle it did not use', () => {
    render(doc({ quartz: true }));
    expect(screen.queryByText('53°')).not.toBeInTheDocument();
    expect(screen.getByText(/Not applicable/)).toBeInTheDocument();
  });
});

describe('branding', () => {
  it('carries the mark when it is on', () => {
    render(doc({ showLogo: true }));
    expect(screen.getByAltText('MAC Bespoke Watch Co.')).toBeInTheDocument();
  });

  it('leaves it out when it is off', () => {
    render(doc({ showLogo: false }));
    expect(screen.queryByAltText('MAC Bespoke Watch Co.')).not.toBeInTheDocument();
  });

  /* The source offer is a licence condition, not branding, and does not go
     with the mark. */
  it('keeps the licence notice either way', () => {
    render(doc({ showLogo: false }));
    expect(screen.getByText(/GPLv2/)).toBeInTheDocument();
  });
});

describe('a regulated watch', () => {
  const before = run({ phase: 'pre', reference: 'MB-0142', updatedAt: '2026-08-01T09:00:00.000Z' });
  const after = run({
    phase: 'post',
    reference: 'MB-0142',
    readings: [reading('dial-up', 1.0, 246, 0.9), reading('dial-down', 3.0, 244, 0.9)],
    updatedAt: '2026-08-30T19:34:00.000Z',
  });

  it('prints both passes, before first', () => {
    render(doc({ current: after, saved: [before] }));
    const titles = document.querySelectorAll('.certificate__phase-title');
    expect([...titles].map((t) => t.textContent))
      .toEqual(['Before regulation', 'After regulation']);
  });

  it('compares what the work achieved', () => {
    render(doc({ current: after, saved: [before] }));
    const compare = document.querySelector('.certificate__compare')?.textContent ?? '';
    expect(compare).toContain('+9.4 s/day');   // before
    expect(compare).toContain('+2.0 s/day');   // after
  });

  /* Pairing is on the reference alone; a different watch is a different
     document. */
  it('ignores a run belonging to another watch', () => {
    const other = run({ phase: 'pre', reference: 'MB-0199' });
    render(doc({ current: after, saved: [other] }));
    expect(document.querySelectorAll('.certificate__phase-title')).toHaveLength(1);
  });

  /*
     A single pass is headed "Measurements". Naming it after the mark was tried
     and taken back out — a document for one reading should not imply a second
     exists.
  */
  it('heads a lone pass as measurements, not as a phase', () => {
    render(doc({ current: after, saved: [] }));
    expect(document.querySelector('.certificate__phase-title')?.textContent)
      .toBe('Measurements');
  });
});
