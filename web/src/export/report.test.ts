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
    expect(rows[0]).toMatchObject({ position: 'Dial up', rate: '+2.4', amplitude: '281', beatError: '0.3' });
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
  };

  it('sets the page geometry the operator chose', () => {
    expect(reportDocument({ ...base, size: 'small' })).toContain('@page{size:3.5in 2in');
    expect(reportDocument({ ...base, size: 'large' })).toContain('@page{size:8.5in 11in');
  });

  it('names the build, and falls back rather than printing an empty heading', () => {
    expect(reportDocument({ ...base, size: 'large' })).toContain('<h1>Ref. 4021</h1>');
    expect(reportDocument({ ...base, buildName: '   ', size: 'large' })).toContain('<h1>Untitled build</h1>');
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

  it('names which pass this is, beside who took it', () => {
    expect(reportDocument({ ...base, regulation: 'Post regulation', size: 'large' }))
      .toContain('Post regulation · N. McGraw');
  });

  it('leaves the attribution readable when nobody signed it', () => {
    const html = reportDocument({ ...base, measuredBy: '', size: 'large' });
    expect(html).toContain('<p>Pre regulation</p>');
  });

  it('omits the notes paragraph rather than printing an empty one', () => {
    expect(reportDocument({ ...base, notes: '  ', size: 'large' })).not.toContain('<p></p>');
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
    expect(reportDocument({ ...base, size: 'small' })).toContain('padding:1px');
    expect(reportDocument({ ...base, size: 'large' })).toContain('padding:3px');
  });
});

describe('the mark', () => {
  const base = {
    buildName: 'Ref. 4021',
    readings: [reading()],
    regulation: 'Pre regulation',
    measuredBy: 'N. McGraw',
    notes: '',
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
    expect(reportDocument({ ...base, size: 'small', logoDataUrl: MARK })).toContain('.mark{width:.55in');
    expect(reportDocument({ ...base, size: 'large', logoDataUrl: MARK })).toContain('.mark{width:1.2in');
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
    expect(html).toContain('<h1>Ref. 4021</h1>');
  });

  it('is absent when the caller says nothing about it', () => {
    expect(reportDocument({ ...base, size: 'small' })).not.toContain('<img');
  });

  it('leaves the build name and product name in reading order', () => {
    const html = reportDocument({ ...base, size: 'large', logoDataUrl: MARK });
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<h1>'));
    expect(html.indexOf('<h1>')).toBeLessThan(html.indexOf('TIMEGRAPHER'));
  });
});
