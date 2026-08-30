/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import {
  POSITIONS, positionName, summarise, type Reading, type SessionMeta,
} from '../timegrapher/session';

/*
   The printable timing certificate.

   Rendered as a normal element and revealed only by the print stylesheet, so
   there is no PDF library in the bundle. Every browser's print dialog offers
   "Save as PDF", and what it produces has selectable text and real page
   geometry — better output than a canvas-based library, at no download cost on
   top of a 580 KB WebAssembly module.

   It records what was measured and how. It does not grade the watch: pass and
   fail thresholds are a shop's own business rules, they differ by calibre and
   by customer, and a public tool asserting one would be making a claim it
   cannot support. The numbers and the method are stated; the judgement stays
   with the watchmaker who signs it.
*/

interface Props {
  readings: Reading[];
  meta: SessionMeta;
  movementName: string | null;
  liftAngle: number;
  /** What the readings were taken with, for the method statement. */
  deviceLabel: string | null;
  sampleRate: number | null;
}

function fmtRate(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

export function Certificate({
  readings, meta, movementName, liftAngle, deviceLabel, sampleRate,
}: Props) {
  const summary = summarise(readings);
  const measured = readings.length > 0 ? new Date(readings[readings.length - 1].at) : new Date();
  const bph = readings[0]?.bph;

  return (
    <div className="certificate" aria-hidden="true">
      <header className="certificate__head">
        {/* The positive mark: this prints on white paper. */}
        <img
          className="certificate__logo"
          src={`${import.meta.env.BASE_URL}mac-logo-pos.png`}
          alt="MAC Bespoke Watch Co."
        />
        <div className="certificate__title">Timing Certificate</div>
      </header>

      <dl className="certificate__facts">
        {meta.reference && (
          <>
            <dt>Reference</dt>
            <dd>{meta.reference}</dd>
          </>
        )}
        <dt>Movement</dt>
        <dd>{movementName ?? 'Not specified'}</dd>
        {bph ? (
          <>
            <dt>Beat rate</dt>
            <dd>{bph.toLocaleString()} bph</dd>
          </>
        ) : null}
        <dt>Lift angle</dt>
        <dd>{liftAngle}°</dd>
        <dt>Measured</dt>
        <dd>
          {measured.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </dd>
        {meta.technician && (
          <>
            <dt>Measured by</dt>
            <dd>{meta.technician}</dd>
          </>
        )}
      </dl>

      <table className="certificate__table">
        <thead>
          <tr>
            <th>Position</th>
            <th>Rate<span> s/day</span></th>
            <th>Amplitude<span> degrees</span></th>
            <th>Beat error<span> ms</span></th>
          </tr>
        </thead>
        <tbody>
          {POSITIONS.filter((p) => readings.some((r) => r.position === p.id)).map((p) => {
            const r = readings.find((x) => x.position === p.id)!;
            return (
              <tr key={p.id}>
                <td>{positionName(p.id)}</td>
                <td>{fmtRate(r.rate)}</td>
                <td>{r.amplitude > 0 ? r.amplitude.toFixed(0) : '—'}</td>
                <td>{r.beatError.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {summary && (
        <table className="certificate__summary">
          <tbody>
            <tr>
              <th>Average rate</th>
              <td>{fmtRate(summary.averageRate)} s/day</td>
              <th>Positional spread</th>
              <td>{summary.positionalSpread.toFixed(1)} s/day</td>
            </tr>
            <tr>
              <th>Lowest amplitude</th>
              <td>{summary.minAmplitude > 0 ? `${summary.minAmplitude.toFixed(0)}°` : '—'}</td>
              <th>Greatest beat error</th>
              <td>{summary.maxBeatError.toFixed(2)} ms</td>
            </tr>
          </tbody>
        </table>
      )}

      {meta.notes && (
        <div className="certificate__notes">
          <div className="certificate__notes-label">Notes</div>
          <p>{meta.notes}</p>
        </div>
      )}

      <div className="certificate__sign">
        <div className="certificate__sign-line">
          <span>Signature</span>
        </div>
        <div className="certificate__sign-line">
          <span>Date</span>
        </div>
      </div>

      {/*
        The method belongs on the document. A rate figure means nothing without
        knowing what took it, over how long, and on what assumption — and the
        lift angle in particular is an input to amplitude, not a measurement of
        it.
      */}
      <footer className="certificate__method">
        <p>
          <strong>Method.</strong> Measured acoustically from the escapement
          {deviceLabel ? ` using ${deviceLabel}` : ''}
          {sampleRate ? ` at ${sampleRate.toLocaleString()} Hz` : ''}. Each figure
          is the reading at the moment of capture, taken once the measurement had
          stabilised. Amplitude is derived from the stated lift angle; a different
          lift angle gives a proportionally different amplitude.
        </p>
        <p>
          This certificate records measurements. It does not assert conformance
          to any standard.
        </p>
        <p>
          Measured with the MAC Bespoke Web Timegrapher, derived from tg by
          Marcello Mamino. Open source (GPLv2):
          github.com/natemac/mac-timegrapher
        </p>
      </footer>
    </div>
  );
}
