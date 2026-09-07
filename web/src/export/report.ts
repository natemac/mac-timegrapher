/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { POSITIONS, positionName, summarise, type Reading } from '../timegrapher/session';

/*
   The printable timing inspection.

   There is no PDF library here and there is not going to be one. Every browser
   offers "Save as PDF" from its own print dialog, and what it produces has
   selectable text and real page geometry — better output than a canvas-based
   library, at no download cost on top of a 580 KB WebAssembly module.

   It records what was measured and how. It does not grade the watch: pass and
   fail thresholds are a shop's own business rules, they differ by calibre and
   by customer, and a public tool asserting one would be making a claim it
   cannot support. The numbers and the method are stated; the judgement stays
   with the watchmaker who signs it.

   The method statement is not decoration either. A rate figure means nothing
   without knowing what took it and on what assumption — and the lift angle in
   particular is an *input* to amplitude rather than a measurement of it, so a
   document reporting amplitude has to say which angle it assumed.

   Printed from a hidden same-origin iframe rather than a popup, so a blocker
   cannot swallow it and iOS Safari — where this is most likely to be exported
   from — will not silently drop it.
*/

export type PageSize = 'small' | 'large';

export interface ReportInput {
  /** What the watch is called on the document. */
  buildName: string;
  readings: Reading[];
  /** "Pre regulation" or "Post regulation", as the dialog's radios put it. */
  regulation: string;
  measuredBy: string;
  notes: string;
  size: PageSize;
  /** The calibre. Amplitude is only ever as good as its lift angle. */
  movementName: string | null;
  liftAngle: number | null;
  /** What took the readings, for the method statement. */
  deviceLabel: string | null;
  sampleRate: number | null;
  /*
     The mark, already a data URI, or null for no mark.

     A URL would not do. The document is printed out of an iframe, and an image
     still in flight when the print dialog takes its copy prints as a blank
     space on a customer's certificate — with nothing on screen to say it
     happened. Inlined, there is nothing left to fetch.
  */
  logoDataUrl?: string | null;
}

/** An em dash, not a zero: a position that was not measured must not look measured. */
const DASH = '—';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function fmtRate(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** One row per position, in the order the run walks them. */
export function reportRows(readings: Reading[]): { position: string; rate: string; amplitude: string; beatError: string }[] {
  return POSITIONS.map((p) => {
    const r = readings.find((x) => x.position === p.id);
    return {
      position: positionName(p.id),
      rate: r ? fmtRate(r.rate) : DASH,
      // Amplitude is withheld rather than printed as zero when the analysis
      // never produced one — a nought on a document reads as a measurement.
      amplitude: r && r.amplitude > 0 ? r.amplitude.toFixed(0) : DASH,
      beatError: r ? r.beatError.toFixed(2) : DASH,
    };
  });
}

/*
   The two sizes.

   They are not one document at two scales. The sheet carries the whole record —
   the facts, the summary figures, somewhere to sign, and the method it was
   measured by. The card carries what somebody wants in their hand: what the
   watch is, what it read, and who took it. Signature lines and a method
   statement on a 3.5 x 2in card would crowd out the readings they exist to
   qualify.
*/
const PAGE = {
  small: {
    size: '3.5in 2in', margin: '.12in', body: '5.4', title: '7.5', label: '4.3',
    logo: '.38in', rule: '.035in', cell: '.6px', gap: '.05in', leading: '1.25',
  },
  large: {
    size: '8.5in 11in', margin: '.6in', body: '10', title: '15', label: '7.5',
    logo: '1.35in', rule: '.16in', cell: '5px', gap: '.1in', leading: '1.45',
  },
} as const;

/*
   The mark, fetched once and kept as a data URI.

   Cached as the promise rather than as the result, so two exports in quick
   succession share one fetch. A failure resolves to null and is not cached, so
   a document printed while the network hiccuped does not permanently lose its
   mark — and prints without one rather than with a broken image.
*/
let pending: Promise<string | null> | null = null;

export function loadReportLogo(baseUrl: string): Promise<string | null> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(`${baseUrl}mac-logo-pos.png`);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch {
      pending = null;
      return null;
    }
  })();
  return pending;
}

/** Test seam: forget the cached mark. */
export function resetReportLogo(): void {
  pending = null;
}

/**
 * When the watch was measured — the last reading taken, not the moment Export
 * was pressed. A document made the following morning still names the bench
 * session it describes.
 */
export function measuredAt(readings: Reading[], now = new Date()): Date {
  if (readings.length === 0) return now;
  return new Date(readings.reduce((a, b) => (a.at > b.at ? a : b)).at);
}

function fact(label: string, value: string): string {
  return `<div class="fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

/** The complete print document, ready to hand to a browser. */
export function reportDocument(input: ReportInput): string {
  const page = PAGE[input.size];
  const card = input.size === 'small';
  const esc = escapeHtml;

  const rows = reportRows(input.readings)
    .map((r) => `<tr><th scope="row">${esc(r.position)}</th><td>${esc(r.rate)}</td><td>${esc(r.amplitude)}</td><td>${esc(r.beatError)}</td></tr>`)
    .join('');

  const summary = summarise(input.readings);
  const bph = input.readings[0]?.bph;
  const when = measuredAt(input.readings);
  const by = input.measuredBy.trim();
  const notes = input.notes.trim();

  /*
     The card is not the sheet at a smaller size. It has 3.26 x 1.76in, of which
     the six readings alone want a hundred pixels, so everything else has to
     earn its place: what the watch is, what it read, who took it and which
     pass. The beat rate, the lift angle, the timestamp, the notes, the
     signature block and the method statement stay on the record.
  */
  const facts = [
    fact('Reference', input.buildName.trim() || 'Untitled build'),
    fact('Movement', input.movementName ?? 'Not specified'),
    card ? '' : (bph ? fact('Beat rate', `${bph.toLocaleString('en-US')} bph`) : ''),
    card ? '' : (input.liftAngle !== null ? fact('Lift angle', `${input.liftAngle}°`) : ''),
    /* The time as well as the day: a watch measured twice in an afternoon
       otherwise produces two documents that cannot be told apart. */
    card ? '' : fact('Measured', when.toLocaleString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })),
    by ? fact('Measured by', by) : '',
    fact('Regulation', input.regulation),
  ].filter(Boolean).join('');

  /* The figures a watchmaker reads first — positional spread most of all. A
     watch that is uniformly fast needs the regulator moved; one that is fine
     flat and poor on edge has a different problem, and the spread is what
     separates them. */
  const figures = summary ? [
    fact('Average rate', `${fmtRate(summary.averageRate)} s/day`),
    fact('Positional spread', `${summary.positionalSpread.toFixed(1)} s/day`),
    card ? '' : (summary.minAmplitude > 0 ? fact('Lowest amplitude', `${summary.minAmplitude.toFixed(0)}°`) : ''),
    card ? '' : fact('Greatest beat error', `${summary.maxBeatError.toFixed(2)} ms`),
  ].filter(Boolean).join('') : '';

  const sign = card ? ''
    : '<div class="sign"><div><span>Signature</span></div><div><span>Date</span></div></div>';

  const method = card ? '' : '<footer class="method">'
    + '<p><strong>Method.</strong> Measured acoustically from the escapement'
    + `${input.deviceLabel ? ` using ${esc(input.deviceLabel)}` : ''}`
    + `${input.sampleRate ? ` at ${input.sampleRate.toLocaleString('en-US')} Hz` : ''}.`
    + ' Each figure is the reading at the moment of capture, taken once the'
    + ' measurement had stabilised.'
    + `${input.liftAngle !== null ? ' Amplitude is derived from the stated lift angle; a different lift angle gives a proportionally different amplitude.' : ''}</p>`
    + '<p>This inspection records measurements. It does not assert conformance to any standard.</p>'
    + '<p>Measured with the MAC Bespoke Web Timegrapher, derived from tg by Marcello Mamino.'
    + ' Open source (GPLv2): github.com/natemac/mac-timegrapher</p>'
    + '</footer>';

  const logo = input.logoDataUrl
    ? `<img class="mark" src="${input.logoDataUrl}" alt="MAC Bespoke Watch Co.">`
    : '<span></span>';

  return '<!doctype html><html><head><meta charset="utf-8"><title>Timing inspection</title><style>'
    + `@page{size:${page.size};margin:${page.margin}}`
    + '*{box-sizing:border-box}'
    + `body{font:${page.body}pt/${page.leading} system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a1a;margin:0}`
    + `.head{display:flex;align-items:flex-end;justify-content:space-between;gap:${page.gap};`
    + `border-bottom:1.5px solid #1a1a1a;padding-bottom:${page.gap};margin-bottom:${page.rule}}`
    /* Height from the width, so the 2:1 artwork cannot be stretched by a print
       engine that disagrees about intrinsic size. */
    + `.mark{width:${page.logo};height:auto;display:block}`
    + `h1{font-size:${page.title}pt;font-weight:500;letter-spacing:${card ? '1.4' : '2.6'}px;`
    + 'text-transform:uppercase;margin:0;white-space:nowrap}'
    + `dl{display:grid;grid-template-columns:1fr 1fr;gap:1px ${page.gap};margin:0 0 ${page.rule}}`
    + `.fact{display:flex;gap:${page.gap};align-items:baseline;break-inside:avoid}`
    + `dt{flex:0 0 auto;font-size:${page.label}pt;letter-spacing:.7px;text-transform:uppercase;color:#6b6b6b}`
    + 'dd{margin:0;font-weight:500;overflow-wrap:anywhere}'
    + `h2{font-size:${page.label}pt;letter-spacing:1.2px;text-transform:uppercase;color:#6b6b6b;`
    + `font-weight:600;margin:0 0 ${page.gap}}`
    + `table{width:100%;border-collapse:collapse;margin-bottom:${page.rule}}`
    + `thead th{font-size:${page.label}pt;letter-spacing:.7px;text-transform:uppercase;color:#6b6b6b;`
    + 'font-weight:600;text-align:right;padding:0 0 2px;border-bottom:1px solid #1a1a1a}'
    + 'thead th:first-child{text-align:left}'
    + 'thead th small{display:block;font-weight:400;font-size:.85em;letter-spacing:.4px}'
    /* A table split across two cards is worse than a second card. */
    + 'tr{break-inside:avoid;page-break-inside:avoid}'
    + `tbody th,tbody td{padding:${page.cell} 0;border-bottom:.5px solid #d9d9d9;`
    + 'font-variant-numeric:tabular-nums;text-align:right}'
    + 'tbody th{text-align:left;font-weight:400}'
    + `.figures{border-bottom:1px solid #d9d9d9;padding-bottom:${page.rule}}`
    + `.notes{margin-bottom:${page.rule}}`
    + '.notes p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}'
    + `.sign{display:grid;grid-template-columns:1fr 1fr;gap:${page.rule};margin:${page.rule} 0}`
    + '.sign div{border-top:.75px solid #1a1a1a;padding-top:3px}'
    + `.sign span{font-size:${page.label}pt;letter-spacing:.7px;text-transform:uppercase;color:#6b6b6b}`
    + `.method{border-top:.5px solid #d9d9d9;padding-top:${page.gap};color:#6b6b6b;font-size:.8em;line-height:1.4}`
    + '.method p{margin:0 0 2px}'
    + '</style></head><body>'
    + `<div class="head">${logo}<h1>Timing Inspection</h1></div>`
    + `<dl>${facts}</dl>`
    + (card ? '' : '<h2>Measurements</h2>')
    + '<table><thead><tr><th scope="col">Position</th>'
    + (card
      ? '<th scope="col">Rate s/d</th><th scope="col">Amp °</th><th scope="col">Beat ms</th>'
      : '<th scope="col">Rate<small>s/day</small></th>'
        + '<th scope="col">Amplitude<small>degrees</small></th>'
        + '<th scope="col">Beat error<small>ms</small></th>')
    + '</tr></thead>'
    + `<tbody>${rows}</tbody></table>`
    + (figures ? `<dl class="figures">${figures}</dl>` : '')
    + (!card && notes ? `<div class="notes"><h2>Notes</h2><p>${esc(notes)}</p></div>` : '')
    + sign
    + method
    + '</body></html>';
}

/**
 * Print one document, then take the frame back out of the page.
 *
 * The frame is removed on a delay rather than immediately: Safari resolves
 * `print()` before the dialog has finished with the document, and pulling the
 * frame out from under it prints a blank page.
 */
export function printDocument(html: string, doc: Document = document): void {
  const frame = doc.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Timing inspection');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';

  frame.addEventListener('load', () => {
    const view = frame.contentWindow;
    if (!view) {
      frame.remove();
      return;
    }
    try {
      view.focus();
      view.print();
    } finally {
      // Long enough for the dialog to have taken its copy of the document.
      setTimeout(() => frame.remove(), 1000);
    }
  });

  frame.srcdoc = html;
  doc.body.appendChild(frame);
}
