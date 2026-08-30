/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { Measurement } from '../timegrapher/tg-engine';

interface Props {
  measurement: Measurement | null;
  capturing: boolean;
  secondsCaptured: number;
}

/** The shortest analysis window is two seconds; nothing is shown before that. */
const MIN_SECONDS = 2;

function Reading({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 140 }}>
      <div className="dim" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 34, lineHeight: 1.15, fontWeight: 500 }}>
        {value}
        {unit && <span className="dim" style={{ fontSize: 15, marginLeft: 5 }}>{unit}</span>}
      </div>
    </div>
  );
}

export function MeasurementPanel({ measurement, capturing, secondsCaptured }: Props) {
  const warmingUp = capturing && secondsCaptured < MIN_SECONDS;
  const m = measurement;
  const show = m?.valid ?? false;

  // An em dash rather than a zero: a reading that is not yet trustworthy must
  // not look like a measured value of zero.
  const dash = '—';

  return (
    <div className="panel">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        <Reading
          label="Rate"
          value={show ? `${m!.rate >= 0 ? '+' : ''}${m!.rate.toFixed(1)}` : dash}
          unit={show ? 's/day' : undefined}
        />
        <Reading
          label="Amplitude"
          value={show && m!.amplitude > 0 ? m!.amplitude.toFixed(0) : dash}
          unit={show && m!.amplitude > 0 ? '°' : undefined}
        />
        <Reading
          label="Beat error"
          value={show ? m!.beatError.toFixed(1) : dash}
          unit={show ? 'ms' : undefined}
        />
        <Reading
          label="Beat rate"
          value={show ? m!.detectedBph.toLocaleString() : dash}
          unit={show ? 'bph' : undefined}
        />
      </div>

      <p className="dim" style={{ fontSize: 13, marginBottom: 0, marginTop: 16 }}>
        {!capturing
          ? 'Press Start, then hold the watch against the sensor.'
          : warmingUp
            ? `Listening… ${secondsCaptured.toFixed(0)} s of the ${MIN_SECONDS} s needed for a first reading.`
            : show
              ? `Signal ${(m!.signalQuality * 100).toFixed(0)}% · readings settle over about 30 seconds.`
              : 'No stable reading yet. Check the watch is in firm contact with the sensor.'}
      </p>

      {show && m!.amplitude === 0 && (
        <p className="warn" style={{ fontSize: 13, marginBottom: 0 }}>
          Amplitude is outside the measurable range. Rate and beat error are still valid.
        </p>
      )}
    </div>
  );
}
