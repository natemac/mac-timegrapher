/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { reportDocument, reportRows, escapeHtml } from './report';

import type { Reading } from '../timegrapher/session';

const reading = (over: Partial<Reading> = {}): Reading => ({
  position: 'dial-up',
  rate: 2.4,
  amplitude: 281,
  beatError: 0.3,
  bph: 21600,
  at: '2026-09-06T10:00:00.000Z',
  ...over,
});

describe('the report table', () => {
  it('lists every position, measured or not', () => {
    expect(reportRows([reading()])).toHaveLength(6);
  });

  /* A dash, never a zero. A nought in the amplitude column of a document
     handed to a customer reads as a measurement somebody could act on. */
  it('writes a dash for a position that was never measured', () => {
    const rows = reportRows([reading()]);
    expect(rows[0]).toMatchObject({ position: 'Dial up', rate: '+2.4', amplitude: '281', beatError: '0.30' });
    expect(rows[1]).toMatchObject({ rate: '—', amplitude: '—', beatError: '—' });
  });

  it('withholds an amplitude the analysis never produced', () => {
    expect(reportRows([reading({ amplitude: 0 })])[0].amplitude).toBe('—');
  });

  it('signs the rate so fast and slow cannot be confused', () => {
    expect(reportRows([reading({ rate: -3.1 })])[0].rate).toBe('-3.1');
    expect(reportRows([reading({ rate: 0 })])[0].rate).toBe('+0.0');
  });
});

describe('the printable document', () => {
  const base = {
    buildName: 'Ref. 4021',
    readings: [reading()],
    regulation: 'Pre regulation',
    measuredBy: 'N. McGraw',
    notes: 'Serviced 2026-08.',
    movementName: 'Seiko / TMI NH35',
    liftAngle: 53,
    deviceLabel: 'USB PnP Sound Device',
    sampleRate: 44100,
  };

  it('sets the page geometry the operator chose', () => {
    expect(reportDocument({ ...base, size: 'small' })).toContain('@page{size:3.5in 2in');
    expect(reportDocument({ ...base, size: 'large' })).toContain('@page{size:8.5in 11in');
  });

  it('names the watch, and falls back rather than printing an empty reference', () => {
    expect(reportDocument({ ...base, size: 'large' })).toContain('<dd>Ref. 4021</dd>');
    expect(reportDocument({ ...base, buildName: '   ', size: 'large' })).toContain('<dd>Untitled build</dd>');
  });

  /*
     Everything below comes from fields a person typed. The document is built by
     string concatenation, so a build name containing markup would otherwise be
     markup.
  */
  it('escapes what the operator typed', () => {
    const html = reportDocument({
      ...base,
      buildName: '<script>alert(1)</script>',
      measuredBy: 'A & B',
      notes: '"quoted"',
      size: 'large',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&quot;quoted&quot;');
  });

  it('names which pass this is, and who took it', () => {
    const html = reportDocument({ ...base, regulation: 'Post regulation', size: 'large' });
    expect(html).toContain('<dd>Post regulation</dd>');
    expect(html).toContain('<dd>N. McGraw</dd>');
  });

  it('omits a fact rather than printing an empty one', () => {
    expect(reportDocument({ ...base, measuredBy: '', size: 'large' })).not.toContain('Measured by');
    expect(reportDocument({ ...base, notes: '  ', size: 'large' })).not.toContain('Notes');
  });

  /*
     A rate figure means nothing without knowing what took it and on what
     assumption — and the lift angle is an input to amplitude rather than a
     measurement of it, so a document reporting amplitude has to say which
     angle it assumed.
  */
  it('states the method on the sheet', () => {
    const html = reportDocument({ ...base, size: 'large' });
    expect(html).toContain('USB PnP Sound Device');
    expect(html).toContain('44,100 Hz');
    expect(html).toContain('derived from the stated lift angle');
    expect(html).toContain('does not assert conformance');
    expect(html).toContain('Marcello Mamino');
  });

  /*
     The card is what goes out with the watch; the sheet is the record. It has
     3.26 x 1.76in and the six readings alone want most of it, so everything
     that is not "what the watch is, what it read, who took it" stays on the
     sheet. Measured: the full layout ran the card 73px over.
  */
  it('leaves the record-keeping off the card', () => {
    const card = reportDocument({ ...base, size: 'small', notes: 'A note' });
    for (const absent of ['Signature', 'Method.', 'Beat rate', 'Lift angle', 'Measured<', 'Notes']) {
      expect(card).not.toContain(absent);
    }
  });

  it('keeps what identifies the watch and what it read on the card', () => {
    const card = reportDocument({ ...base, size: 'small' });
    expect(card).toContain('<dd>Ref. 4021</dd>');
    expect(card).toContain('<dd>Seiko / TMI NH35</dd>');
    expect(card).toContain('<dd>N. McGraw</dd>');
    expect(card).toContain('Average rate');
    expect(card).toContain('Positional spread');
  });

  it('gives a watchmaker the figures they read first', () => {
    const html = reportDocument({
      ...base,
      readings: [reading(), reading({ position: 'dial-down', rate: -3.6, amplitude: 244, beatError: 0.8 })],
      size: 'large',
    });
    expect(html).toContain('Average rate');
    expect(html).toContain('Positional spread');
    expect(html).toContain('6.0 s/day');
    expect(html).toContain('Lowest amplitude');
    expect(html).toContain('Greatest beat error');
  });

  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  /* A table split across two business cards is worse than a second card. */
  it('keeps a row from breaking across pages', () => {
    expect(reportDocument({ ...base, size: 'small' })).toContain('page-break-inside:avoid');
  });

  /*
     Measured, not chosen. At the sheet's cell padding the seven rows ran the
     3.5 x 2in card 9px over its 1.76in of usable height, so every export
     spilled onto a second card.
  */
  it('packs the table tighter on the card than on the sheet', () => {
    expect(reportDocument({ ...base, size: 'small' })).toContain('padding:.6px 0');
    expect(reportDocument({ ...base, size: 'large' })).toContain('padding:5px 0');
  });
});

describe('the mark', () => {
  const base = {
    buildName: 'Ref. 4021',
    readings: [reading()],
    regulation: 'Pre regulation',
    measuredBy: 'N. McGraw',
    notes: '',
    movementName: 'Seiko / TMI NH35',
    liftAngle: 53,
    deviceLabel: 'USB PnP Sound Device',
    sampleRate: 44100,
  };
  const MARK = 'data:image/png;base64,AAAA';

  /* Both sizes, or the preference means nothing on the one the customer is
     handed. The card is the one that goes out with the watch. */
  it('appears on both page sizes', () => {
    for (const size of ['small', 'large'] as const) {
      const html = reportDocument({ ...base, size, logoDataUrl: MARK });
      expect(html).toContain(`src="${MARK}"`);
    }
  });

  it('is sized against the paper, not the type', () => {
    expect(reportDocument({ ...base, size: 'small', logoDataUrl: MARK })).toContain('.mark{width:.38in');
    expect(reportDocument({ ...base, size: 'large', logoDataUrl: MARK })).toContain('.mark{width:1.35in');
  });

  /* The artwork is 2:1. A print engine that disagrees about intrinsic size
     must not be able to stretch it. */
  it('takes its height from its width', () => {
    expect(reportDocument({ ...base, size: 'large', logoDataUrl: MARK })).toContain('height:auto');
  });

  it('is described, not left as a bare image', () => {
    expect(reportDocument({ ...base, size: 'large', logoDataUrl: MARK }))
      .toContain('alt="MAC Bespoke Watch Co."');
  });

  /*
     Branding is off by default and is nobody else's to inherit. No mark means
     no image element at all — not a broken one, and not a gap where one was.
  */
  it('is absent entirely when branding is off', () => {
    const html = reportDocument({ ...base, size: 'large', logoDataUrl: null });
    expect(html).not.toContain('<img');
    // The document still identifies itself and the watch without it.
    expect(html).toContain('<h1>Timing Inspection</h1>');
    expect(html).toContain('<dd>Ref. 4021</dd>');
  });

  it('is absent when the caller says nothing about it', () => {
    expect(reportDocument({ ...base, size: 'small' })).not.toContain('<img');
  });

  it('puts the mark ahead of the title, and the title ahead of the readings', () => {
    const html = reportDocument({ ...base, size: 'large', logoDataUrl: MARK });
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<h1>'));
    expect(html.indexOf('<h1>')).toBeLessThan(html.indexOf('Measurements'));
  });
});
