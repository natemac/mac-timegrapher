/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { POSITIONS, positionName, summarise, type Reading } from '../timegrapher/session';
import {
  phaseName, findPair, orderPair, comparePair, type Inspection,
} from '../timegrapher/inspections';

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
  /** The run on screen. */
  current: Inspection;
  /** Everything recorded, so the opposite pass for this watch can be found. */
  saved: Inspection[];
  liftAngle: number;
  /** What the readings were taken with, for the method statement. */
  deviceLabel: string | null;
  sampleRate: number | null;
  /** The mark is branding, not a licence condition; a fork turns it off. */
  showLogo: boolean;
  /** Amplitude and beat error describe a balance wheel; quartz has none. */
  quartz: boolean;
}

function fmtRate(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

function summaryFor(run: Inspection) {
  return summarise(run.readings);
}

function fmtAmplitude(v: number | undefined): string {
  return v && v > 0 ? `${v.toFixed(0)}°` : '—';
}

function fmtBeat(v: number | undefined): string {
  return v === undefined ? '—' : `${v.toFixed(2)} ms`;
}

/*
   Both passes, a position to a line.

   Only the positions measured in both are compared; one measured in a single
   pass still prints, with a dash where the other reading would be, because
   leaving it out would quietly shorten the record.
*/
function PairedTable({
  before, after, quartz,
}: { before: Inspection; after: Inspection; quartz: boolean }) {
  const seen = POSITIONS.filter(
    (p) => before.readings.some((r) => r.position === p.id)
      || after.readings.some((r) => r.position === p.id),
  );

  const cell = (run: Inspection, id: string, pick: (r: Reading) => string) => {
    const r = run.readings.find((x) => x.position === id);
    return r ? pick(r) : '—';
  };

  return (
    <section className="certificate__phase">
      <h2 className="certificate__phase-title">
        {phaseName(before.phase)} → {phaseName(after.phase)}
      </h2>
      <table className="certificate__table certificate__paired">
        <thead>
          <tr>
            <th>Position</th>
            <th>Rate<span> s/day</span></th>
            <th>Amplitude<span> degrees</span></th>
            <th>Beat error<span> ms</span></th>
          </tr>
        </thead>
        <tbody>
          {seen.map((p) => (
            <tr key={p.id}>
              <td>{positionName(p.id)}</td>
              <td>
                {cell(before, p.id, (r) => fmtRate(r.rate))}
                <span className="certificate__to"> → </span>
                {cell(after, p.id, (r) => fmtRate(r.rate))}
              </td>
              <td>
                {quartz ? '—' : (
                  <>
                    {cell(before, p.id, (r) => (r.amplitude > 0 ? r.amplitude.toFixed(0) : '—'))}
                    <span className="certificate__to"> → </span>
                    {cell(after, p.id, (r) => (r.amplitude > 0 ? r.amplitude.toFixed(0) : '—'))}
                  </>
                )}
              </td>
              <td>
                {quartz ? '—' : (
                  <>
                    {cell(before, p.id, (r) => r.beatError.toFixed(2))}
                    <span className="certificate__to"> → </span>
                    {cell(after, p.id, (r) => r.beatError.toFixed(2))}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** One phase's table. Rendered when there is only the one pass. */
function RunTable({
  run, label, quartz,
}: { run: Inspection; label: string; quartz: boolean }) {
  const rows: Reading[] = run.readings;
  if (rows.length === 0) return null;

  const summary = summarise(rows);

  return (
    <section className="certificate__phase">
      <h2 className="certificate__phase-title">{label}</h2>
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
          {POSITIONS.filter((p) => rows.some((r) => r.position === p.id)).map((p) => {
            const r = rows.find((x) => x.position === p.id)!;
            return (
              <tr key={p.id}>
                <td>{positionName(p.id)}</td>
                <td>{fmtRate(r.rate)}</td>
                <td>{!quartz && r.amplitude > 0 ? r.amplitude.toFixed(0) : '—'}</td>
                <td>{quartz ? '—' : r.beatError.toFixed(2)}</td>
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
            {!quartz && (
              <tr>
                <th>Lowest amplitude</th>
                <td>{summary.minAmplitude > 0 ? `${summary.minAmplitude.toFixed(0)}°` : '—'}</td>
                <th>Greatest beat error</th>
                <td>{summary.maxBeatError.toFixed(2)} ms</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Certificate({
  current, saved, liftAngle, deviceLabel, sampleRate, showLogo, quartz,
}: Props) {
  /*
     The other half of the before-and-after, found on the reference alone. It
     may have been measured weeks earlier with a dozen other watches in
     between; nothing about order or timing is assumed.
  */
  const pair = findPair(saved, current);
  const runs = orderPair(current, pair);
  const regulated = runs.length > 1;
  const comparison = regulated ? comparePair(runs[0], runs[1]) : null;

  const meta = current;
  const readings = current.readings;
  const measured = readings.length > 0 ? new Date(readings[readings.length - 1].at) : new Date();
  const bph = readings[0]?.bph;
  const movementName = current.movementName;

  return (
    <div className="certificate" aria-hidden="true">
      <header className="certificate__head">
        {/* The positive mark: this prints on white paper. */}
        {showLogo && (
          <img
            className="certificate__logo"
            src={`${import.meta.env.BASE_URL}mac-logo-pos.png`}
            alt="MAC Bespoke Watch Co."
          />
        )}
        <div className="certificate__title">Timing Inspection</div>
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
        <dd>{quartz ? 'Not applicable — quartz' : `${liftAngle}°`}</dd>
        <dt>Measured</dt>
        <dd>
          {/* The time as well as the day: a watch measured twice in an
              afternoon otherwise produces two documents that cannot be told
              apart. */}
          {measured.toLocaleString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </dd>
        {meta.technician && (
          <>
            <dt>Measured by</dt>
            <dd>{meta.technician}</dd>
          </>
        )}
      </dl>

      {/* One table when a watch was only measured, two when it was regulated:
          the second is only meaningful next to the first. */}
      {/*
        Two passes go in one table, a position to a line, rather than two tables
        stacked. It reads better — the change at each position is on one row
        instead of thirty lines apart — and it is what keeps a regulated watch's
        document to a single page. Stacked, it ran to two, the second carrying
        little but the footer.
      */}
      {regulated ? (
        <PairedTable before={runs[0]} after={runs[1]} quartz={quartz} />
      ) : (
        <RunTable
          run={runs[0]}
          /*
             Named even when it is alone. A reading marked after regulation and
             printed as plain "Measurements" throws the mark away — the one fact
             the operator went out of their way to record.
          */
          label={phaseName(runs[0].phase)}
          quartz={quartz}
        />
      )}

      {comparison && (
        <table className="certificate__summary certificate__compare">
          <thead>
            <tr>
              <th />
              <th>{phaseName('pre')}</th>
              <th>{phaseName('post')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Average rate</th>
              <td>{fmtRate(comparison.rateBefore)} s/day</td>
              <td>{fmtRate(comparison.rateAfter)} s/day</td>
            </tr>
            <tr>
              <th>Positional spread</th>
              <td>{comparison.spreadBefore.toFixed(1)} s/day</td>
              <td>{comparison.spreadAfter.toFixed(1)} s/day</td>
            </tr>
            {!quartz && (
              <>
                <tr>
                  <th>Lowest amplitude</th>
                  <td>{fmtAmplitude(summaryFor(runs[0])?.minAmplitude)}</td>
                  <td>{fmtAmplitude(summaryFor(runs[1])?.minAmplitude)}</td>
                </tr>
                <tr>
                  <th>Greatest beat error</th>
                  <td>{fmtBeat(summaryFor(runs[0])?.maxBeatError)}</td>
                  <td>{fmtBeat(summaryFor(runs[1])?.maxBeatError)}</td>
                </tr>
              </>
            )}
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
          stabilised.
          {quartz
            ? ' This movement is quartz: it has no balance wheel, so amplitude and beat error do not apply and are not reported.'
            : ' Amplitude is derived from the stated lift angle; a different lift angle gives a proportionally different amplitude.'}
        </p>
        <p>
          This inspection records measurements. It does not assert conformance
          to any standard.
          {regulated && ' Readings are reported both before and after the regulation.'}
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
