/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { Measurement } from '../timegrapher/tg-engine';
import type { Settling, Spread } from '../timegrapher/stability';
import type { SignalState, SignalStrength } from '../audio/signal-strength';
import {
  stabilityPosition, stabilityState, stabilityLimiter, LOCKED_FROM,
  type Limiter,
} from '../timegrapher/stability-position';

/*
   The four readings, how steady they are, and what the input is doing.

   An em dash rather than a zero throughout. A figure the analysis did not
   produce must not look like one it did — a nought in the amplitude column is a
   measurement somebody could act on, and a dash is not.
*/
interface Props {
  measurement: Measurement | null;
  capturing: boolean;
  settling: Settling;
  /** Seconds of reading so far; one of the four things settling waits on. */
  secondsCaptured: number;
  spreads: {
    rate: Spread | null;
    amplitude: Spread | null;
    beatError: Spread | null;
  };
  signal: SignalState | null;
  onReset: () => void;
}

const DASH = '—';

const STRENGTH_LABEL: Record<SignalStrength, string> = {
  none: 'No signal',
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  excellent: 'Excellent',
};

/** Map dBFS onto the design's meter, which runs from -60 to 0. */
function meterPercent(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

const SPOKEN: Record<ReturnType<typeof stabilityState>, string> = {
  idle: 'Awaiting signal',
  moving: 'Readings still moving',
  locked: 'Readings locked',
  paused: 'Paused',
};

/*
   What the cursor is waiting on, named.

   "Still moving" is a state, not advice. Which of the four criteria is lagging
   is the difference between waiting a few more seconds, pressing the watch
   harder onto the sensor, and having a movement worth looking into — so the
   bar says which, in its tooltip and to a screen reader. It costs no height,
   which the measuring screen does not have to give.
*/
const WAITING_ON: Record<Exclude<Limiter, null>, string> = {
  rate: 'waiting on rate',
  beatError: 'waiting on beat error',
  amplitude: 'waiting on amplitude',
  time: 'needs a few more seconds',
};

function Stat({
  label, value, unit, sub,
}: {
  label: string;
  value: string;
  unit: string;
  /** The ± line, or whatever stands in its place. Always occupies its row. */
  sub: string;
}) {
  return (
    <div className="measurement-stat">
      <span className="stat-label">{label}</span>
      <div>
        <strong>{value}</strong>
        <span className="stat-unit">{unit}</span>
      </div>
      <small>{sub}</small>
    </div>
  );
}

export function ReadoutSurface({
  measurement, capturing, secondsCaptured, settling, spreads, signal, onReset,
}: Props) {
  const m = measurement;
  const valid = m?.valid ?? false;
  const state = stabilityState(capturing, m !== null, settling);
  const facts = {
    settling,
    seconds: secondsCaptured,
    rate: spreads.rate,
    beatError: spreads.beatError,
    /* Left out of the verdict, and so out of the bar, when the core produced
       no amplitude — a quartz movement, or a capture route that cannot read
       one. Pinning the cursor left for a figure nobody is waiting on would be
       a lie about what is holding the reading up. */
    amplitude: valid && m!.amplitude > 0 ? spreads.amplitude : null,
  };
  const position = stabilityPosition(facts);
  const limiter = stabilityLimiter(facts);
  const spoken = state === 'moving' && limiter
    ? `${SPOKEN.moving} — ${WAITING_ON[limiter]}`
    : SPOKEN[state];

  const plusMinus = (s: Spread | null, digits: number) =>
    (s ? `± ${s.plusMinus.toFixed(digits)}` : `± ${DASH}`);

  const db = signal?.levelDb ?? null;
  const hasDb = db !== null && Number.isFinite(db);
  const quality = signal === null
    ? 'No signal'
    : signal.clipped ? 'Too loud' : STRENGTH_LABEL[signal.strength];

  return (
    <div className="readout-surface">
      <div className="readout-top">
        <div className="stability-status" role="status">
          <span
            id="stabilityMoving"
            className={state === 'moving' ? 'stability-label active' : 'stability-label'}
          >
            MOVING
          </span>

          {/*
             One bar, two meanings: where the cursor sits is how tight the rate
             spread is, and the shaded region is the range the settled verdict
             accepts. Locked is a range of natural variation, not a constant.
          */}
          <span
            className="stability-mark"
            id="stabilityMark"
            data-state={state}
            title={spoken}
          >
            {/*
               The oval spans the cursor *centres* that count as settled, so its
               left edge is where the cursor's centre lands at exactly the
               threshold. Placing it in left-edge space instead put the whole
               shape 9px early, and a reading held just short of settling drew
               its cursor inside the green while the label beside it still read
               MOVING.
            */}
            <span
              className="locked-range"
              style={{ left: `calc(9px + (100% - 18px) * ${LOCKED_FROM})` }}
            />
            <span
              id="stabilityCursor"
              style={{
                // Inset by half the cursor's own width at each end, so it never
                // rides off the track it is measuring against.
                left: `calc(9px + (100% - 18px) * ${position ?? 0})`,
                opacity: position === null ? 0 : undefined,
              }}
            />
          </span>

          <span
            id="stabilityLocked"
            className={state === 'locked' ? 'stability-label active' : 'stability-label'}
          >
            LOCKED
          </span>

          <span id="stabilityText" className="stability-sr">{spoken}</span>
        </div>

        {/*
           Throw away the collected average and the trace without stopping the
           audio. Moving a watch onto the sensor makes a burst of noise the
           spread cannot tell from the movement misbehaving, and it would
           otherwise sit in the window for the next thirty seconds.
        */}
        <button
          id="resetReadings"
          className="reset-readings"
          onClick={onReset}
          aria-label="Reset readings and spread"
          title="Reset readings and spread"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 12l-3-5" />
          </svg>
        </button>
      </div>

      <div className="measurement-grid">
        <Stat
          label="RATE"
          value={valid ? `${m!.rate >= 0 ? '+' : ''}${m!.rate.toFixed(1)}` : DASH}
          unit="s/day"
          sub={plusMinus(valid ? spreads.rate : null, 1)}
        />
        <Stat
          label="AMPLITUDE"
          value={valid && m!.amplitude > 0 ? m!.amplitude.toFixed(0) : DASH}
          unit="°"
          sub={plusMinus(valid && m!.amplitude > 0 ? spreads.amplitude : null, 0)}
        />
        <Stat
          label="BEAT ERROR"
          value={valid ? m!.beatError.toFixed(1) : DASH}
          unit="ms"
          sub={plusMinus(valid ? spreads.beatError : null, 2)}
        />
        <Stat
          label="BEAT RATE"
          value={valid ? m!.detectedBph.toLocaleString('en-US') : DASH}
          unit="bph"
          sub={valid ? 'Detected' : 'Not detected'}
        />
      </div>

      <div className="signal-strip">
        <span className="signal-label">SIGNAL</span>
        <div
          className="db-meter"
          role="meter"
          aria-label="Input signal level"
          aria-valuemin={-60}
          aria-valuemax={0}
          aria-valuenow={hasDb ? Math.max(-60, Math.min(0, db!)) : -60}
          aria-valuetext={hasDb ? `${db!.toFixed(0)} dBFS` : 'No signal'}
        >
          <div id="dbFill" style={{ width: `${hasDb ? meterPercent(db!) : 0}%` }} />
        </div>
        <span className="signal-db" id="signalDb">{hasDb ? `${db!.toFixed(0)} dBFS` : `${DASH} dBFS`}</span>
        <span className="signal-quality" id="signalQuality">{quality}</span>
      </div>
    </div>
  );
}
