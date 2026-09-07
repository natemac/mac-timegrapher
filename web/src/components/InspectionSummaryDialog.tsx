/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { WIZARD_ORDER } from '../timegrapher/wizard';
import { summarise } from '../timegrapher/session';
import { positionName, type Reading } from '../timegrapher/session';
import { reportDocument, printDocument, loadReportLogo, type PageSize } from '../export/report';
import type { Inspection, Phase } from '../timegrapher/inspections';

/*
   The report, before it is printed.

   Nothing here is a judgement. Pass and fail thresholds are a shop's own
   business rules — they differ by calibre and by customer — and a public tool
   asserting one would be making a claim it cannot support. The figures and who
   took them are recorded; what they mean stays with the watchmaker who signs
   it.
*/
interface Props {
  open: boolean;
  onClose: () => void;
  inspection: Inspection;
  onChange: (next: Inspection) => void;
  /* On the document because amplitude is derived from the lift angle rather
     than measured, and a figure nobody can trace back to its assumption is not
     worth printing. */
  movementName: string | null;
  liftAngle: number | null;
  deviceLabel: string | null;
  sampleRate: number | null;
  /*
     Whether the MAC mark goes on the document.

     Off by default, and the same preference that governs the mark in the
     header. Branding is not covered by the GPL the way the code is, and almost
     nobody running this is MAC — a stranger's logo on your own timing
     certificate is worse than no logo at all. Whoever turns it on gets it on
     both page sizes.
  */
  showLogo: boolean;
}

const DASH = '—';

function cell(reading: Reading | undefined, pick: (r: Reading) => string): string {
  return reading ? pick(reading) : DASH;
}

export function InspectionSummaryDialog({
  open, onClose, inspection, onChange, showLogo, movementName, liftAngle,
  deviceLabel, sampleRate,
}: Props) {
  /* The page size is about the paper in the printer, not about the watch, so
     it is not part of the record and is not saved with it. */
  const [size, setSize] = useState<PageSize>('large');

  /*
     Warm the mark as the dialog opens, so pressing Export is instant. The
     handler awaits it regardless — a prefetch that has not landed yet must not
     be the difference between a document with a logo and one without, and the
     result is cached, so the wait is real only the first time.
  */
  useEffect(() => {
    if (!open || !showLogo) return;
    void loadReportLogo(import.meta.env.BASE_URL);
  }, [open, showLogo]);

  const set = (patch: Partial<Inspection>) =>
    onChange({ ...inspection, ...patch, updatedAt: new Date().toISOString() });

  const regulation = inspection.phase === 'post' ? 'Post regulation' : 'Pre regulation';
  const average = summarise(inspection.readings);

  const exportReport = async () => {
    /* Awaited before the document is built. Printing happens in an iframe
       rather than a popup, so there is no user-activation window to lose by
       waiting here. */
    const logoDataUrl = showLogo ? await loadReportLogo(import.meta.env.BASE_URL) : null;
    printDocument(reportDocument({
      buildName: inspection.reference,
      readings: inspection.readings,
      regulation,
      measuredBy: inspection.technician,
      notes: inspection.notes,
      size,
      movementName,
      liftAngle,
      deviceLabel,
      sampleRate,
      logoDataUrl,
    }));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      id="inspectionSummary"
      className="inspection-summary"
      labelledBy="summaryTitle"
    >
      <div className="summary-sticky">
        <h2 tabIndex={-1} id="summaryTitle">INSPECTION SUMMARY</h2>
        <button className="close" aria-label="Close" onClick={onClose}>×</button>
      </div>

      <label>
        BUILD NAME
        <input
          id="buildName"
          placeholder="Untitled build"
          value={inspection.reference}
          onChange={(e) => set({ reference: e.target.value })}
        />
      </label>

      <div className="summary-table-wrap">
        <table>
          <thead>
            <tr>
              <th>POSITION</th>
              <th>RATE</th>
              <th>AMP</th>
              <th>BEAT</th>
            </tr>
          </thead>
          <tbody id="summaryRows">
            {WIZARD_ORDER.map((id) => {
              const r = inspection.readings.find((x) => x.position === id);
              return (
                <tr key={id}>
                  <td>{positionName(id)}</td>
                  <td>{cell(r, (x) => `${x.rate >= 0 ? '+' : ''}${x.rate.toFixed(1)}`)}</td>
                  <td>{cell(r, (x) => (x.amplitude > 0 ? x.amplitude.toFixed(0) : DASH))}</td>
                  <td>{cell(r, (x) => x.beatError.toFixed(1))}</td>
                </tr>
              );
            })}
          </tbody>
          {average && (
            /*
               The average sits with the readings rather than beside them: it is
               the figure that gets written down, and the spread next to it is
               what says whether the average means anything. A watch uniformly
               fast wants the regulator moved; one fine flat and poor on edge
               has a different problem entirely.
            */
            <tfoot>
              <tr>
                <th scope="row">Average</th>
                <td>{average.averageRate >= 0 ? '+' : ''}{average.averageRate.toFixed(1)}</td>
                <td>{average.averageAmplitude === null ? DASH : average.averageAmplitude.toFixed(0)}</td>
                <td>{average.averageBeatError.toFixed(1)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="summary-units">Rate: s/day · Amp: ° · Beat error: ms</p>

      {/* Which pass this is. A reading filed against the wrong one makes a
          before-and-after say the opposite of what happened. */}
      <fieldset className="inline-radio" aria-label="Regulation">
        {(['pre', 'post'] as Phase[]).map((phase) => (
          <label key={phase}>
            <input
              type="radio"
              name="regulation"
              value={phase}
              checked={inspection.phase === phase}
              onChange={() => set({ phase })}
            />
            {' '}{phase === 'pre' ? 'Pre' : 'Post'}
          </label>
        ))}
        <span>Regulation</span>
      </fieldset>

      <label>
        MEASURED BY
        <input
          id="measuredBy"
          autoComplete="name"
          value={inspection.technician}
          onChange={(e) => set({ technician: e.target.value })}
        />
      </label>

      <label>
        NOTES
        <textarea
          id="inspectionNotes"
          rows={3}
          value={inspection.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>

      <fieldset className="inline-radio pdf-sizes" aria-label="PDF size">
        <label title="3.5 × 2 inches">
          <input
            type="radio"
            name="pdfSize"
            value="small"
            checked={size === 'small'}
            onChange={() => setSize('small')}
          />
          {' '}Small (3.5″ × 2″)
        </label>
        <label title="8.5 × 11 inches">
          <input
            type="radio"
            name="pdfSize"
            value="large"
            checked={size === 'large'}
            onChange={() => setSize('large')}
          />
          {' '}Large (8.5″ × 11″)
        </label>
        <span>PDF size</span>
      </fieldset>

      <button id="exportInspection" className="export-button" onClick={() => void exportReport()}>
        Export PDF
      </button>
      <p className="summary-units">Choose Save as PDF in the print dialog.</p>
    </Dialog>
  );
}
