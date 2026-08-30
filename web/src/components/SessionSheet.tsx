/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState } from 'react';
import { POSITIONS, summarise } from '../timegrapher/session';
import {
  PHASES, findPair, orderPair, comparePair, phaseName, phaseShort, inspectionAverage,
  formatAverage, byRecency, pairToTable,
  type Inspection,
} from '../timegrapher/inspections';
import { SlideSwitch } from './SlideSwitch';
import { Sheet } from './Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  current: Inspection;
  saved: Inspection[];
  onChange: (next: Inspection) => void;
  onPrint: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function fmtRate(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

function Row({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}>
      <span className="dim" style={{ fontSize: 13 }}>{label}</span>
      <span className="mono" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {unit && <span className="dim" style={{ marginLeft: 3 }}>{unit}</span>}
      </span>
    </div>
  );
}

export function SessionSheet({
  open, onClose, current, saved, onChange, onPrint, onNew, onOpen, onDelete,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    setCopied(false);
    setConfirmDelete(null);
    setShowHistory(false);
  }, [open]);

  if (!open) return null;

  const summary = summarise(current.readings);
  const byPosition = new Map(current.readings.map((r) => [r.position, r]));
  const pair = findPair(saved, current);
  const runs = orderPair(current, pair);
  const comparison = pair
    ? comparePair(...(runs as [Inspection, Inspection]))
    : null;
  const average = inspectionAverage(current);
  const title = current.reference.trim() || 'Unnamed watch';
  const history = byRecency(saved).filter((i) => i.readings.length > 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pairToTable(runs));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const set = (patch: Partial<Inspection>) => onChange({ ...current, ...patch });

  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="sheet__actions">
        {current.readings.length > 0 && (
          <>
            <button
              onClick={onPrint}
              aria-label="Export inspection — print or save as PDF"
              style={{ flex: '1 1 auto', fontSize: 13 }}
            >
              Export Inspection
            </button>
            <button
              className="secondary"
              onClick={copy}
              aria-label="Copy the results as text"
              style={{ flex: '0 0 auto', fontSize: 13 }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </>
        )}
        <button
          ref={closeRef}
          className="secondary"
          onClick={onClose}
          aria-label="Close"
          style={{ marginLeft: 'auto', padding: '7px 13px', fontSize: 15, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div className="sheet__head sheet__head--title">
        <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
      </div>

      <div className="sheet__body prose" data-sheet-scroll>
        {/*
          The reference and the mark, first and together, because between them
          they decide what this run is. The reference is the only thing that
          ties a before to an after — a run without one pairs with nothing.
        */}
        <div className="run-identity">
          <input
            className="field"
            placeholder="Reference or build number"
            aria-label="Reference or build number"
            value={current.reference}
            onChange={(e) => set({ reference: e.target.value })}
          />
          <SlideSwitch
            className="switch--phase"
            value={current.phase}
            options={PHASES.map((p) => ({ id: p.id, label: p.name }))}
            onChange={(phase) => set({ phase })}
            label="Before or after regulation"
          />
          <p className="dim run-identity__note">
            {pair
              ? `Paired with the ${phaseShort(pair.phase).toLowerCase()} reading of ${new Date(pair.updatedAt).toLocaleDateString()}.`
              : current.reference.trim()
                ? current.phase === 'pre'
                  ? 'Nothing recorded after regulation for this reference yet.'
                  : 'Nothing recorded before regulation for this reference yet.'
                : 'Give it a reference and the before and after will pair themselves, however long apart.'}
          </p>
        </div>

        {/* Every position is listed whether measured or not, so what is left
            to do is as visible as what is done. */}
        <table className="session-table">
          <thead>
            <tr>
              <th>Position</th>
              <th>Rate</th>
              <th>Amp</th>
              <th>Beat</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((p) => {
              const r = byPosition.get(p.id);
              return (
                <tr key={p.id} className={r ? undefined : 'session-table__pending'}>
                  <td>{p.name}</td>
                  <td>{r ? fmtRate(r.rate) : '—'}</td>
                  <td>{r && r.amplitude > 0 ? r.amplitude.toFixed(0) : '—'}</td>
                  <td>{r ? r.beatError.toFixed(2) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {summary ? (
          <>
            <h3 style={{ marginTop: 20 }}>Summary</h3>
            <Row label="Positions measured" value={`${summary.count} of ${POSITIONS.length}`} />
            <Row label="Average rate" value={fmtRate(summary.averageRate)} unit="s/day" />
            <Row label="Positional spread" value={summary.positionalSpread.toFixed(1)} unit="s/day" />
            <Row
              label="Lowest amplitude"
              value={summary.minAmplitude > 0 ? summary.minAmplitude.toFixed(0) : '—'}
              unit={summary.minAmplitude > 0 ? '°' : undefined}
            />
            <Row label="Worst beat error" value={summary.maxBeatError.toFixed(2)} unit="ms" />

            <p className="dim" style={{ marginTop: 14 }}>
              Positional spread is the number worth watching. A watch that is
              uniformly fast needs the regulator; one that reads well flat and
              poorly on its side has a poising or pivot problem the regulator
              will not fix.
            </p>

            {comparison && (
              <>
                <h3 style={{ marginTop: 20 }}>Before and after</h3>
                <Row
                  label="Average rate"
                  value={`${fmtRate(comparison.rateBefore)} → ${fmtRate(comparison.rateAfter)}`}
                  unit="s/day"
                />
                <Row
                  label="Positional spread"
                  value={`${comparison.spreadBefore.toFixed(1)} → ${comparison.spreadAfter.toFixed(1)}`}
                  unit="s/day"
                />
                <p className="dim" style={{ marginTop: 10 }}>
                  Over the {comparison.positions} position
                  {comparison.positions === 1 ? '' : 's'} measured in both runs.
                </p>
              </>
            )}
          </>
        ) : (
          <p className="dim" style={{ marginTop: 16 }}>
            Nothing recorded in this run yet. Choose a position, wait for the
            reading to settle, then press Record.
          </p>
        )}

        <h3 style={{ marginTop: 20 }}>Inspection details</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <input
            className="field"
            placeholder="Measured by"
            aria-label="Measured by"
            value={current.technician}
            onChange={(e) => set({ technician: e.target.value })}
          />

          {/*
            One line per run, in the watchmaker's own words — "+27, uniformly
            fast" and "+27, all over the place" are the same average and
            different watches. Fill writes this run's own average, which is
            unambiguous now that a run is one pass over one watch.
          */}
          <div className="fillable">
            <input
              className="field"
              placeholder={`${phaseName(current.phase)} — in a line`}
              aria-label={`${phaseName(current.phase)} summary`}
              value={current.summaryText}
              onChange={(e) => set({ summaryText: e.target.value })}
            />
            <button
              className="secondary fillable__fill"
              onClick={() => average && set({ summaryText: formatAverage(average) })}
              disabled={average === null}
              aria-label="Fill with this run's measured average"
            >
              Fill
            </button>
          </div>

          <textarea
            className="field"
            placeholder="Notes (optional)"
            aria-label="Notes"
            rows={2}
            value={current.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>

        <button className="secondary run-new" onClick={onNew}>
          Start a new reading
        </button>

        {/* Kept for looking back at and for clearing out. Nothing in the
            normal flow needs them: the document pairs a before with an after on
            the reference by itself. */}
        {history.length > 0 && (
          <>
            <button
              className="secondary"
              onClick={() => setShowHistory((v) => !v)}
              style={{ width: '100%', marginTop: 18, fontSize: 13 }}
              aria-expanded={showHistory}
            >
              {showHistory ? 'Hide past readings' : `Past readings — ${history.length}`}
            </button>

            {showHistory && (
              <ul className="run-list">
                {history.map((i) => (
                  <li key={i.id} className={i.id === current.id ? 'run-list__item is-current' : 'run-list__item'}>
                    <button className="run-list__open" onClick={() => onOpen(i.id)}>
                      <span className="run-list__name">{i.reference.trim() || 'Unnamed'}</span>
                      <span className="dim run-list__meta">
                        {phaseShort(i.phase)} · {i.readings.length} of {POSITIONS.length} ·{' '}
                        {new Date(i.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      className="secondary run-list__delete"
                      onClick={() => (confirmDelete === i.id ? onDelete(i.id) : setConfirmDelete(i.id))}
                      aria-label={`Delete the ${phaseName(i.phase).toLowerCase()} reading for ${i.reference.trim() || 'this unnamed watch'}`}
                    >
                      {confirmDelete === i.id ? 'Sure?' : 'Delete'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
