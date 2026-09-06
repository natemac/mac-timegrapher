/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { POSITIONS, positionName, type Reading } from '../timegrapher/session';

/*
   The printable inspection report.

   There is no PDF library here and there is not going to be one. Every browser
   offers "Save as PDF" from its own print dialog, and what it produces has
   selectable text and real page geometry — better output than a canvas-based
   library, at no download cost on top of a 580 KB WebAssembly module.

   The design opens a new window and writes into it. This prints from a hidden
   same-origin iframe instead. The document is byte-for-byte what the design
   specified — same markup, same `@page`, same escaping — but a popup blocker
   cannot swallow it, and iOS Safari, where an inspection is most likely to be
   exported from, will not silently drop it. See docs/updateui.md, C1.
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
      beatError: r ? r.beatError.toFixed(1) : DASH,
    };
  });
}

/*
   The two sizes the dialog offers: a business card to go out with the watch,
   and a full sheet for the file. Everything that scales between them is here
   rather than spread through the template.

   The mark is sized in inches rather than in points, because it is measured
   against the paper: on the card it has 3.26in of usable width and must not
   take a line of its own, and on the sheet it is a letterhead. The artwork is
   2:1, so the heights are half the widths — 0.275in on the card, 0.6in on the
   sheet.

   The card's cell padding is a third of the sheet's, and that is not styling.
   Measured at 3.26 x 1.76in of usable space: the mark and title take 34px, the
   seven table rows 98px and the attribution 17px, leaving about 20px — two
   lines — for notes. At the sheet's 2px padding the table alone ran the card
   9px over and every export spilled onto a second card.

   Longer notes still spill, and that is deliberate. The alternative is
   truncating what somebody wrote about a customer's watch, and a second card is
   better than silently losing half a sentence.
*/
const PAGE = {
  small: { size: '3.5in 2in', margin: '.12in', body: '7', title: '10', logo: '.55in', gap: '.06in', cell: '1px' },
  large: { size: '8.5in 11in', margin: '.6in', body: '12', title: '22', logo: '1.2in', gap: '.18in', cell: '3px' },
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

/** The complete print document, ready to hand to a browser. */
export function reportDocument(input: ReportInput): string {
  const page = PAGE[input.size];
  const esc = escapeHtml;

  const rows = reportRows(input.readings)
    .map((r) => `<tr><td>${esc(r.position)}</td><td>${esc(r.rate)}</td><td>${esc(r.amplitude)}</td><td>${esc(r.beatError)}</td></tr>`)
    .join('');

  const by = input.measuredBy.trim();
  const attribution = by ? `${input.regulation} · ${by}` : input.regulation;
  const notes = input.notes.trim();

  const logo = input.logoDataUrl
    ? `<img class="mark" src="${input.logoDataUrl}" alt="MAC Bespoke Watch Co.">`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Inspection report</title><style>`
    + `@page{size:${page.size};margin:${page.margin}}`
    + `body{font:${page.body}pt system-ui,-apple-system,sans-serif;color:#222;margin:0}`
    + `h1{font-size:${page.title}pt;margin:0 0 2px}`
    + `p{margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere}`
    + `table{width:100%;border-collapse:collapse}`
    /* A table split across two cards is worse than a second card. */
    + `thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}`
    + `td,th{text-align:left;border-bottom:1px solid #ddd;padding:${page.cell}}`
    + `small{font-size:.8em}`
    + `.head{display:flex;align-items:center;gap:${page.gap};margin:0 0 ${page.gap}}`
    /* Height from the width, so the 2:1 artwork cannot be stretched by a
       print engine that disagrees about intrinsic size. */
    + `.mark{width:${page.logo};height:auto;flex:0 0 auto;display:block}`
    + `.title{min-width:0}`
    + `</style></head><body>`
    + `<div class="head">${logo}<div class="title">`
    + `<h1>${esc(input.buildName.trim() || 'Untitled build')}</h1>`
    + `<small>TIMEGRAPHER</small>`
    + `</div></div>`
    + `<table><thead><tr><th>Position</th><th>Rate s/d</th><th>Amp °</th><th>Beat ms</th></tr></thead>`
    + `<tbody>${rows}</tbody></table>`
    + `<p>${esc(attribution)}</p>`
    + (notes ? `<p>${esc(notes)}</p>` : '')
    + `</body></html>`;
}

/**
 * Print one document, then take the frame back out of the page.
 *
 * The frame is removed on the next turn of the event loop rather than
 * immediately: Safari resolves `print()` before the dialog has finished with
 * the document, and pulling the frame out from under it prints a blank page.
 */
export function printDocument(html: string, doc: Document = document): void {
  const frame = doc.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Inspection report');
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
