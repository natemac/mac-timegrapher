/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState } from 'react';
import {
  POSITIONS, summarise, toTable, type Reading,
} from '../timegrapher/session';

interface Props {
  open: boolean;
  onClose: () => void;
  readings: Reading[];
  movementName: string | null;
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

export function SessionSheet({ open, onClose, readings, movementName, onClear }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    setCopied(false);
    setConfirmClear(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const summary = summarise(readings);
  const byPosition = new Map(readings.map((r) => [r.position, r]));

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
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Session">
        <div className="sheet__head">
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            Session{movementName ? ` — ${movementName}` : ''}
          </span>
          <button
            ref={closeRef}
            className="secondary"
            onClick={onClose}
            aria-label="Close"
            style={{ padding: '7px 13px', fontSize: 15, lineHeight: 1 }}
          >
            ✕
          </button>
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

              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <button onClick={copy} style={{ flex: '1 1 auto', fontSize: 13 }}>
                  {copied ? 'Copied' : 'Copy results'}
                </button>
                <button
                  className="secondary"
                  onClick={() => (confirmClear ? onClear() : setConfirmClear(true))}
                  style={{ flex: '1 1 auto', fontSize: 13 }}
                >
                  {confirmClear ? 'Tap again to clear' : 'Clear session'}
                </button>
              </div>
            </>
          ) : (
            <p className="dim" style={{ marginTop: 16 }}>
              Nothing recorded yet. Choose a position, wait for the reading to
              settle, then press Capture.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
