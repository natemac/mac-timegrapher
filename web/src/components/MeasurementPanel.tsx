/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { Measurement, Calibration } from '../timegrapher/tg-engine';
import type { Settling, Spread } from '../timegrapher/stability';
import { SettlingIndicator } from './SettlingIndicator';
import { PanelHead } from './PanelHead';
import type { Topic } from './guide-content';
import type { RunningSummary } from '../timegrapher/session';

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
  /*
     A clock check in progress. It stops the measurement, because what is on
     the sensor is a quartz reference rather than the movement — so without
     this the panel sits at four dashes saying "no stable reading" and looks
     broken at exactly the moment it is working.
  */
  clockCheck?: Calibration | null;
  onHelp: (t: Topic) => void;
  onResetAverage: () => void;
  /** Save the reading on screen as an image. Absent while there is none. */
  onSnapshot?: () => void;
  /*
     A quartz movement. Amplitude and beat error both describe a balance
     wheel — how far it swings, and whether its two half-turns are even. A
     stepper motor has neither, so those readings are withheld rather than
     shown as a number somebody could act on.
  */
  quartz?: boolean;
  /*
     Whether this panel explains itself.

     In a certification run the wizard is saying the same thing one step at a
     time — and saying it better, because it knows which position is being
     measured. Two lines of advice under one reading is one line too many in a
     view that must not scroll.
  */
  guidance?: boolean;
  /*
     What the run has found so far, shown while capture is stopped between
     positions. Without it the panel is four dashes at exactly the moment there
     is something worth looking at.
  */
  summary?: RunningSummary | null;
}

/** The shortest analysis window is two seconds. */
const MIN_SECONDS = 2;

/** An em dash, not a zero: an untrustworthy reading must not look measured. */
const DASH = '—';

function Reading({
  label, value, unit, spread, format, sub,
}: {
  label: string;
  value: string;
  unit?: string;
  spread: Spread | null;
  format?: (n: number) => string;
  /** Replaces the ± line — a range, when the figure is a summary not a reading. */
  sub?: string;
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
        {sub ?? (spread && format ? `±${format(spread.plusMinus)}` : '')}
      </div>
    </div>
  );
}

export function MeasurementPanel({
  measurement, capturing, secondsCaptured, settling, spreads, onHelp, onResetAverage,
  onSnapshot, guidance = true, quartz = false, summary = null, clockCheck = null,
}: Props) {
  const m = measurement;
  const live = m?.valid ?? false;
  /*
     The summary stands in only while nothing is being measured. A live reading
     always wins — the panel must never show yesterday's average over a watch
     that is on the sensor now.
  */
  const showSummary = !capturing && summary !== null;
  const show = live;

  const fmtRate = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
  const range = (lo: number, hi: number, f: (n: number) => string) =>
    (lo === hi ? '' : `${f(lo)} to ${f(hi)}`);
  const warmingUp = capturing && secondsCaptured < MIN_SECONDS;
  const hasAmplitude = show && !quartz && m!.amplitude > 0;

  return (
    <div className="panel panel--tight">
      <PanelHead
        label="Measurement"
        topic="measurement"
        onHelp={onHelp}
        right={capturing ? (
          /*
            Repositioning the watch makes a burst of noise the spread cannot
            tell from the movement misbehaving, and it would otherwise sit in
            the window for the next thirty seconds. This throws the average
            away and starts again without stopping capture.
          */
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
        ) : undefined}
      />

      {/* Two by two so all four read at a glance without scrolling. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}>
        <Reading
          label="Rate"
          value={show ? fmtRate(m!.rate) : showSummary ? fmtRate(summary!.rate.mean) : DASH}
          unit={show || showSummary ? 's/d' : undefined}
          spread={show ? spreads.rate : null}
          format={(n) => n.toFixed(1)}
          sub={showSummary ? range(summary!.rate.min, summary!.rate.max, fmtRate) : undefined}
        />
        <Reading
          label="Amplitude"
          value={
            hasAmplitude ? m!.amplitude.toFixed(0)
              : showSummary && !quartz && summary!.amplitude
                ? summary!.amplitude.mean.toFixed(0)
                : DASH
          }
          unit={hasAmplitude || (showSummary && !quartz && summary!.amplitude) ? '°' : undefined}
          spread={hasAmplitude ? spreads.amplitude : null}
          format={(n) => n.toFixed(0)}
          sub={showSummary && !quartz && summary!.amplitude
            ? range(summary!.amplitude.min, summary!.amplitude.max, (n) => n.toFixed(0))
            : undefined}
        />
        <Reading
          label="Beat error"
          value={
            show && !quartz ? m!.beatError.toFixed(1)
              : showSummary && !quartz ? summary!.beatError.mean.toFixed(1)
                : DASH
          }
          unit={(show || showSummary) && !quartz ? 'ms' : undefined}
          spread={show && !quartz ? spreads.beatError : null}
          format={(n) => n.toFixed(2)}
          sub={showSummary && !quartz
            ? range(summary!.beatError.min, summary!.beatError.max, (n) => n.toFixed(2))
            : undefined}
        />
        <Reading
          label="Beat rate"
          value={
            show ? m!.detectedBph.toLocaleString()
              : showSummary ? summary!.bph.toLocaleString()
                : DASH
          }
          unit={show || showSummary ? 'bph' : undefined}
          spread={null}
        />
      </div>

      {/* Capture rides the settling row rather than taking one of its own.
          The two belong together anyway: the indicator is what tells you the
          reading is worth saving. */}
      {capturing && (
        <div className="panel__settle">
          <div className="panel__settle-bar">
            <SettlingIndicator
              settling={settling}
              rate={show ? m!.rate : null}
              spread={show ? spreads.rate : null}
            />
          </div>

          {/* Only once there is something worth saving — an image of four
              dashes is not a reading. */}
          {show && onSnapshot && (
            <button className="capture-button" onClick={onSnapshot}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="6" width="18" height="14" rx="2.5" />
                <circle cx="12" cy="13" r="3.4" />
                <path d="M8.5 6l1.4-2.2h4.2L15.5 6" strokeLinejoin="round" />
              </svg>
              Capture
            </button>
          )}
        </div>
      )}

      {showSummary && (
        <div className="panel__foot">
          <p className="dim panel__foot-note">
            {summary!.count} position{summary!.count === 1 ? '' : 's'} so far
            {summary!.count > 1 && (
              <> · spread <span className="mono">{summary!.positionalSpread.toFixed(1)}</span> s/day</>
            )}
          </p>
        </div>
      )}

      {!showSummary && (guidance || quartz) && (
      <div className="panel__foot">
        {quartz ? (
          <p className="dim panel__foot-note">
            Quartz: no balance wheel, so amplitude and beat error do not apply.
          </p>
        ) : clockCheck ? (
          <p className="dim panel__foot-note">
            {clockCheck.state === 1
              ? 'Audio clock checked. The result is in Settings.'
              : clockCheck.signal >= 4
                ? `Checking the audio clock — ${clockCheck.collected} of ${clockCheck.needed} ticks.`
                : 'Checking the audio clock. Listening for a once-a-second tick.'}
          </p>
        ) : (
          <p className="dim panel__foot-note">
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
      )}
    </div>
  );
}
