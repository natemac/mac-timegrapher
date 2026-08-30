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
  PHASES, findPair, orderPair, comparePair, phaseShort, pairToTable,
  type Inspection,
} from '../timegrapher/inspections';
import { Sheet } from './Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  current: Inspection;
  saved: Inspection[];
  onChange: (next: Inspection) => void;
  onPrint: () => void;
  /** Start the next watch. The reading on screen is the only one there is. */
  onClear: () => void;
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
  open, onClose, current, saved, onChange, onPrint, onClear,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    setCopied(false);
    setConfirmClear(false);
  }, [open]);

  if (!open) return null;

  const summary = summarise(current.readings);
  const byPosition = new Map(current.readings.map((r) => [r.position, r]));
  const pair = findPair(saved, current);
  const runs = orderPair(current, pair);
  const comparison = pair
    ? comparePair(...(runs as [Inspection, Inspection]))
    : null;
  const title = current.reference.trim() || 'Unnamed watch';
  const set = (patch: Partial<Inspection>) => onChange({ ...current, ...patch });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pairToTable(runs));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

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
            <button
              className="secondary"
              onClick={() => (confirmClear ? onClear() : setConfirmClear(true))}
              /* The label follows the state, or pressing Clear would announce
                 nothing changed to anyone not looking at it. */
              aria-label={confirmClear
                ? 'Press again to clear this reading'
                : 'Clear this reading and start the next watch'}
              style={{ flex: '0 0 auto', fontSize: 13 }}
            >
              {confirmClear ? 'Sure?' : 'Clear'}
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
        <input
          className="run-name"
          placeholder="Build number"
          aria-label="Build number"
          value={current.reference}
          onChange={(e) => set({ reference: e.target.value })}
        />
      </div>

      <div className="sheet__body prose" data-sheet-scroll>
        {/*
          The reference and the mark, first and together, because between them
          they decide what this run is. The reference is the only thing that
          ties a before to an after — a run without one pairs with nothing.
        */}
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
          <fieldset className="phase-choice">
            <legend className="visually-hidden">Before or after regulation</legend>
            {PHASES.map((ph) => (
              <label key={ph.id} className="phase-choice__option">
                <input
                  type="radio"
                  name="phase"
                  checked={current.phase === ph.id}
                  onChange={() => set({ phase: ph.id })}
                />
                <span>{ph.id === 'pre' ? 'Pre' : 'Post'}</span>
              </label>
            ))}
            <span className="phase-choice__label">Regulation</span>
          </fieldset>

          {/*
            Said only when there is one. A note promising that a matching
            reading will turn up would be promising that the browser keeps
            things, and it does not — a cleared cache or another device and it
            is gone.
          */}
          {pair && (
            <p className="dim run-identity__note">
              Paired with the {phaseShort(pair.phase).toLowerCase()} reading of{' '}
              {new Date(pair.updatedAt).toLocaleDateString()}.
            </p>
          )}

          <input
            className="field"
            placeholder="Measured by"
            aria-label="Measured by"
            value={current.technician}
            onChange={(e) => set({ technician: e.target.value })}
          />

          <textarea
            className="field"
            placeholder="Notes (optional)"
            aria-label="Notes"
            rows={2}
            value={current.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>

      </div>
    </Sheet>
  );
}
