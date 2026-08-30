/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState } from 'react';
import {
  POSITIONS, summarise, toTable, sessionTitle, type Reading, type SessionMeta,
} from '../timegrapher/session';

interface Props {
  open: boolean;
  onClose: () => void;
  readings: Reading[];
  movementName: string | null;
  meta: SessionMeta;
  onChangeMeta: (m: SessionMeta) => void;
  onPrint: () => void;
  onClear: () => void;
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
  open, onClose, readings, movementName, meta, onChangeMeta, onPrint, onClear,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  /*
     Focus moves into the sheet when it opens — and only when it opens.

     This used to share an effect with the Escape listener, which depends on
     `onClose`. The parent passes a fresh arrow for that on every render, so
     every keystroke in the certificate fields re-ran the effect and pulled
     focus onto the close button. The field accepted exactly one character per
     tap, which read as a broken keyboard rather than as stolen focus.
  */
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    setCopied(false);
    setConfirmClear(false);
  }, [open]);

  // Re-registering this when onClose changes identity is harmless: it adds and
  // removes a listener and touches nothing the operator is looking at.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const summary = summarise(readings);
  const byPosition = new Map(readings.map((r) => [r.position, r]));
  const title = sessionTitle(meta.reference, movementName);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toTable(readings, movementName));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="sheet__scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        {/*
          Actions first, close beside them, name underneath. Both rows are
          outside the scrolling body — these used to sit at the foot of the
          table, so producing the certificate meant scrolling past every
          position and the summary to reach the button the sheet was opened
          for.
        */}
        <div className="sheet__actions">
          {summary && (
            <>
              <button
                onClick={onPrint}
                aria-label="Certificate — print or save as PDF"
                style={{ flex: '1 1 auto', fontSize: 13 }}
              >
                Certificate
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

        {/* The reference becomes the name as soon as one is typed, so the
            sheet says which job it is rather than "Session". */}
        <div className="sheet__head">
          <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
        </div>

        <div className="sheet__body prose">
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
                    <td>{r ? `${r.rate >= 0 ? '+' : ''}${r.rate.toFixed(1)}` : '—'}</td>
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
              <Row
                label="Average rate"
                value={`${summary.averageRate >= 0 ? '+' : ''}${summary.averageRate.toFixed(1)}`}
                unit="s/day"
              />
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

              {/* What identifies the watch. A certificate without a reference
                  is a table of numbers that could belong to anything. */}
              <h3 style={{ marginTop: 20 }}>Certificate details</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  className="field"
                  placeholder="Reference or build number"
                  value={meta.reference}
                  onChange={(e) => onChangeMeta({ ...meta, reference: e.target.value })}
                />
                <input
                  className="field"
                  placeholder="Measured by"
                  value={meta.technician}
                  onChange={(e) => onChangeMeta({ ...meta, technician: e.target.value })}
                />
                <textarea
                  className="field"
                  placeholder="Notes (optional)"
                  rows={2}
                  value={meta.notes}
                  onChange={(e) => onChangeMeta({ ...meta, notes: e.target.value })}
                />
              </div>

            </>
          ) : (
            <p className="dim" style={{ marginTop: 16 }}>
              Nothing recorded yet. Choose a position, wait for the reading to
              settle, then press Record.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
