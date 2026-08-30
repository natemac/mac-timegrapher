/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { Measurement } from '../timegrapher/tg-engine';
import type { Settling, Spread } from '../timegrapher/stability';
import { SettlingIndicator } from './SettlingIndicator';
import { PanelHead } from './PanelHead';
import type { Topic } from './guide-content';

interface Props {
  measurement: Measurement | null;
  capturing: boolean;
  secondsCaptured: number;
  settling: Settling;
  spreads: {
    rate: Spread | null;
    amplitude: Spread | null;
    beatError: Spread | null;
  };
  onHelp: (t: Topic) => void;
  onResetAverage: () => void;
  /** Save the reading on screen as an image. Absent while there is none. */
  onSnapshot?: () => void;
  /*
     Whether this panel explains itself.

     In a certification run the wizard is saying the same thing one step at a
     time — and saying it better, because it knows which position is being
     measured. Two lines of advice under one reading is one line too many in a
     view that must not scroll.
  */
  guidance?: boolean;
}

/** The shortest analysis window is two seconds. */
const MIN_SECONDS = 2;

/** An em dash, not a zero: an untrustworthy reading must not look measured. */
const DASH = '—';

function Reading({
  label, value, unit, spread, format,
}: {
  label: string;
  value: string;
  unit?: string;
  spread: Spread | null;
  format?: (n: number) => string;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className="mono"
        style={{
          fontSize: 'clamp(26px, 8vw, 34px)',
          lineHeight: 1.1,
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
        {unit && <span className="dim" style={{ fontSize: 13, marginLeft: 4 }}>{unit}</span>}
      </div>
      {/* Spread is the point: a reading cannot be judged without it. */}
      <div className="mono dim" style={{ fontSize: 11, minHeight: 15 }}>
        {spread && format ? `±${format(spread.plusMinus)}` : ''}
      </div>
    </div>
  );
}

export function MeasurementPanel({
  measurement, capturing, secondsCaptured, settling, spreads, onHelp, onResetAverage,
  onSnapshot, guidance = true,
}: Props) {
  const m = measurement;
  const show = m?.valid ?? false;
  const warmingUp = capturing && secondsCaptured < MIN_SECONDS;
  const hasAmplitude = show && m!.amplitude > 0;

  return (
    <div className="panel panel--tight">
      <PanelHead
        label="Measurement"
        topic="measurement"
        onHelp={onHelp}
        right={capturing ? (
          <div style={{ display: 'flex', gap: 2 }}>
            {/* Only once there is something worth saving — an image of four
                dashes is not a reading. */}
            {show && onSnapshot && (
              <button
                className="panel__help-icon"
                onClick={onSnapshot}
                aria-label="Save this reading as an image"
                title="Save this reading as an image"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="6" width="18" height="14" rx="2.5" />
                  <circle cx="12" cy="13" r="3.4" />
                  <path d="M8.5 6l1.4-2.2h4.2L15.5 6" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            {/*
              Repositioning the watch makes a burst of noise the spread cannot
              tell from the movement misbehaving, and it would otherwise sit in
              the window for the next thirty seconds. This throws the average
              away and starts again without stopping capture.
            */}
            <button
              className="panel__help-icon"
              onClick={onResetAverage}
              aria-label="Restart the average"
              title="Restart the average"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 2.6-6.4" strokeLinecap="round" />
                <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : undefined}
      />

      {/* Two by two so all four read at a glance without scrolling. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
        <Reading
          label="Rate"
          value={show ? `${m!.rate >= 0 ? '+' : ''}${m!.rate.toFixed(1)}` : DASH}
          unit={show ? 's/d' : undefined}
          spread={show ? spreads.rate : null}
          format={(n) => n.toFixed(1)}
        />
        <Reading
          label="Amplitude"
          value={hasAmplitude ? m!.amplitude.toFixed(0) : DASH}
          unit={hasAmplitude ? '°' : undefined}
          spread={hasAmplitude ? spreads.amplitude : null}
          format={(n) => n.toFixed(0)}
        />
        <Reading
          label="Beat error"
          value={show ? m!.beatError.toFixed(1) : DASH}
          unit={show ? 'ms' : undefined}
          spread={show ? spreads.beatError : null}
          format={(n) => n.toFixed(2)}
        />
        <Reading
          label="Beat rate"
          value={show ? m!.detectedBph.toLocaleString() : DASH}
          unit={show ? 'bph' : undefined}
          spread={null}
        />
      </div>

      {capturing && (
        <div style={{ marginTop: 10 }}>
          <SettlingIndicator
            settling={settling}
            rate={show ? m!.rate : null}
            spread={show ? spreads.rate : null}
          />
        </div>
      )}

      {guidance && (
      <p className="dim" style={{ fontSize: 12, marginBottom: 0, marginTop: 6 }}>
        {!capturing
          ? 'Press Start, then hold the watch against the sensor.'
          : warmingUp
            ? `Listening… ${secondsCaptured.toFixed(0)}s of ${MIN_SECONDS}s.`
            : !show
              ? 'No stable reading. Check the watch is in firm contact.'
              : settling === 'settled'
                ? 'Readings have stopped moving.'
                : 'Still moving. Give it a few more seconds.'}
      </p>
      )}
    </div>
  );
}
