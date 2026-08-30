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

/** The shortest analysis window is two seconds. */
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
  measurement, capturing, secondsCaptured, settling, spreads,
}: Props) {
  const m = measurement;
  const show = m?.valid ?? false;
  const warmingUp = capturing && secondsCaptured < MIN_SECONDS;
  const hasAmplitude = show && m!.amplitude > 0;

  return (
    <div className="panel panel--tight">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="eyebrow">Measurement</span>
        {capturing && (
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: settling === 'settled' ? 'var(--ok)' : 'var(--text-faint)',
            }}
          >
            {SETTLING_LABEL[settling]}
          </span>
        )}
      </div>

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

      <p className="dim" style={{ fontSize: 12, marginBottom: 0, marginTop: 4 }}>
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
    </div>
  );
}
