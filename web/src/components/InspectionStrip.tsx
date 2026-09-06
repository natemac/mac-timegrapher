/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { ReactNode } from 'react';

/*
   The inspection run, as one instruction at a time.

   The six markers are progress, not navigation: they say which position is
   being measured and which are done, and there is nothing to press. The loop is
   place the watch, press Start, wait — and the panel says which of those three
   the operator is currently in.

   Capture is deliberately available as a button whether or not automatic
   capture is on. Automatic does not replace it, it presses it for you.
*/
export interface PositionMark {
  name: string;
  captured: boolean;
}

interface Props {
  /** The input, transport and calibre row, which lives inside the wizard here. */
  children: ReactNode;
  positions: PositionMark[];
  step: number;
  /** What the operator should do or wait for, right now. */
  note: string;
  auto: boolean;
  onAutoChange: (auto: boolean) => void;
  /*
     Whether a reading may be kept. Every condition has to hold — running, past
     the grace, locked, and with all three figures finite — because this is what
     lands on a customer's document. Elapsed time alone never qualifies.
  */
  canCapture: boolean;
  onCapture: () => void;
}

function Indicator({ index, name, current, captured }: {
  index: number;
  name: string;
  current: boolean;
  captured: boolean;
}) {
  const state = captured ? 'captured' : current ? 'current position' : 'pending';
  return (
    <span
      className="position-indicator"
      data-position={index}
      data-current={current}
      data-captured={captured}
      role="img"
      aria-label={`${name}, ${state}`}
      title={`${name}, ${state}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path className="position-hand" d="M12 7v5l3 2" />
        <path className="position-check" d="m8 12 3 3 5-6" />
      </svg>
    </span>
  );
}

export function InspectionStrip({
  children, positions, step, note, auto, onAutoChange, canCapture, onCapture,
}: Props) {
  const current = positions[step];

  return (
    <div className="inspection-strip" id="inspectionControls">
      <div className="wizard-input" id="wizardInput">{children}</div>

      <div className="position-top">
        <div>
          <span className="stat-label">
            POSITION <span id="positionCount">{Math.min(step + 1, positions.length)} / {positions.length}</span>
          </span>
          <strong id="positionName">{current?.name ?? 'Complete'}</strong>
        </div>

        <div className="capture-actions">
          <label>
            <input
              type="checkbox"
              id="autoCapture"
              checked={auto}
              onChange={(e) => onAutoChange(e.target.checked)}
            />
            {' '}Auto capture
          </label>
          <button
            id="capturePosition"
            className="export-button"
            disabled={!canCapture}
            onClick={onCapture}
          >
            Capture
          </button>
        </div>
      </div>

      <div className="wizard-feedback">
        <p id="inspectionCaptureNote" role="status">{note}</p>
        <div className="position-track" role="group" aria-label="Inspection progress">
          {positions.map((p, i) => (
            <Indicator
              key={p.name}
              index={i}
              name={p.name}
              current={i === step}
              captured={p.captured}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
