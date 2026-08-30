/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { Measurement } from '../timegrapher/tg-engine';
import type { Settling, Spread } from '../timegrapher/stability';

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
}

/** The shortest analysis window is two seconds; nothing is shown before that. */
const MIN_SECONDS = 2;

/** An em dash, not a zero: an untrustworthy reading must not look measured. */
const DASH = '—';

const SETTLING_LABEL: Record<Settling, string> = {
  waiting: 'Listening',
  moving: 'Moving',
  settling: 'Settling',
  settled: 'Settled',
};

function Reading({
  label,
  value,
  unit,
  spread,
  format,
}: {
  label: string;
  value: string;
  unit?: string;
  spread: Spread | null;
  format?: (n: number) => string;
}) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 150 }}>
      <div
        className="dim"
        style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
        {unit && <span className="dim" style={{ fontSize: 14, marginLeft: 5 }}>{unit}</span>}
      </div>
      {/* The spread is the point: a number without it cannot be judged. */}
      <div className="mono dim" style={{ fontSize: 12, minHeight: 17 }}>
        {spread && format ? `±${format(spread.plusMinus)} over ${Math.round(spread.count / 2)}s` : ''}
      </div>
    </div>
  );
}

export function MeasurementPanel({
  measurement,
  capturing,
  secondsCaptured,
  settling,
  spreads,
}: Props) {
  const m = measurement;
  const show = m?.valid ?? false;
  const warmingUp = capturing && secondsCaptured < MIN_SECONDS;
  const hasAmplitude = show && m!.amplitude > 0;

  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15 }}>Measurement</h2>
        {capturing && (
          <span
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: settling === 'settled' ? 'var(--ok)' : 'var(--text-dim)',
            }}
          >
            {SETTLING_LABEL[settling]}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }}>
        <Reading
          label="Rate"
          value={show ? `${m!.rate >= 0 ? '+' : ''}${m!.rate.toFixed(1)}` : DASH}
          unit={show ? 's/day' : undefined}
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

      <p className="dim" style={{ fontSize: 13, marginBottom: 0, marginTop: 6 }}>
        {!capturing
          ? 'Press Start, then hold the watch against the sensor.'
          : warmingUp
            ? `Listening… ${secondsCaptured.toFixed(0)} s of the ${MIN_SECONDS} s needed for a first reading.`
            : !show
              ? 'No stable reading yet. Check the watch is in firm contact with the sensor.'
              : settling === 'settled'
                ? 'Readings have stopped moving. Safe to record.'
                : 'Readings are still moving. Give it a few more seconds.'}
      </p>

      {show && !hasAmplitude && (
        <p className="warn" style={{ fontSize: 13, marginBottom: 0 }}>
          Amplitude is outside the measurable range. Rate and beat error are still valid.
        </p>
      )}
    </div>
  );
}
