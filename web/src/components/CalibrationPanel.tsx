/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { AudioInput } from '../audio/device-manager';
import type { Calibration } from '../timegrapher/tg-engine';
import type { ClockResult } from '../audio/clock-calibration';
import { MIN_SECONDS, type ClockDebug } from '../audio/clock-calibration';
import { useState } from 'react';

/*
   Calibrating the sound card's clock.

   Its own tab, because it is a different job from either reading the guide or
   setting a preference: it takes a quarter of an hour, it needs the microphone
   and sometimes a second watch, and it is done once per device rather than per
   session.

   Two methods, kept visibly apart. They measure the same quantity, produce the
   same kind of number and feed the same correction — which is exactly why they
   were indistinguishable when they shared one block, with one counting to 60
   and the other to 900 under a single heading. Each now states what it needs
   before it states what it is doing.
*/

/** NSTEPS in the core: every analysis window converged on the one-second tick. */
const LOCKED_SIGNAL = 4;

interface Props {
  /* The guide entry for this. It carries the physics — parts per million,
     why a constant scale error hides from everything else — which the panel
     itself has no room for, and it would be unreachable otherwise. */
  onInfo: () => void;

  /** Microphone permission. Calibration is the one job that can be reached
      before the main screen has ever asked for it. */
  granted: boolean;
  onRequestMic: () => void;
  busy: boolean;

  devices: AudioInput[];
  selectedId: string | null;
  onSelectDevice: (deviceId: string) => void;
  sampleRate: number | null;
  capturing: boolean;
  onStartCapture: () => void;
  onStopCapture: () => void;

  /** The correction in force, and the field that edits it. */
  draft: string;
  onDraftChange: (v: string) => void;
  onDraftCommit: () => void;

  clock: ClockResult | null;
  /** The raw state of the fit, for when it produced nothing usable. */
  clockDebug: ClockDebug;
  clockSeconds: number;
  clockDisturbed: boolean;
  onApplyClock: (value: number) => void;
  onClearClock: () => void;
  hasCorrection: boolean;

  check: Calibration | null;
  onStartCheck: () => void;
  onStopCheck: () => void;
  onUseCheck: (value: number) => void;
}

function Method({ title, needs, children }: {
  title: string;
  needs: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="calibration__method">
      <h3 className="calibration__method-title">{title}</h3>
      <ul className="calibration__needs">
        {needs.map((n) => <li key={n}>{n}</li>)}
      </ul>
      {children}
    </section>
  );
}

/*
   The numbers behind a run, shown on request.

   A failed calibration is otherwise a dead end: the figure is withheld, and
   what is left says only that something went wrong. These are the values the
   fit was built from, including the steps it threw away — which is the part
   that distinguishes an interrupted run from a systematically wrong one, since
   both produce an impossible answer and look identical from outside.
*/
function Details({ d, sampleRate }: { d: ClockDebug; sampleRate: number | null }) {
  const [open, setOpen] = useState(false);
  const ppm = (r: number | null) => (r === null ? '—' : `${((r - 1) * 1e6).toFixed(0)} ppm`);
  const sd = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)} s/day`);

  if (!open) {
    return (
      <button className="calibration__what" onClick={() => setOpen(true)}>
        Show the numbers
      </button>
    );
  }

  const dropped = d.steps - d.points;
  const rows: [string, string][] = [
    ['blocks seen', String(d.steps)],
    ['points used', String(d.points)],
    /* A high rate here means audio is arriving in fits and starts. It also
       explains any gap between the two times below: a rejected step's wall
       time is discarded along with it. */
    ['rejected', d.steps > 0 ? `${dropped} (${((dropped / d.steps) * 100).toFixed(1)}%)` : '0'],
    ['real elapsed', `${d.elapsedSeconds.toFixed(2)} s`],
    ['wall time in fit', `${d.wallSeconds.toFixed(2)} s`],
    ['audio time', `${d.audioSeconds.toFixed(2)} s`],
    ['fitted slope', `${ppm(d.fittedRatio)}  ${sd(d.fittedDriftSecondsPerDay)}`],
    ['ratio of totals', `${ppm(d.totalsRatio)}  ${sd(d.totalsDriftSecondsPerDay)}`],
    ['step ratio range', `${ppm(d.minStepRatio)} … ${ppm(d.maxStepRatio)}`],
    ['frames delivered', `${d.frames.toLocaleString()}`],
    ['frames as time', d.framesSeconds === null ? '—' : `${d.framesSeconds.toFixed(2)} s  ${sd(d.framesDriftSecondsPerDay)}`],
    ['rejected — gap', String(d.rejectedGap)],
    ['rejected — ratio', String(d.rejectedRatio)],
    ['rejected — backwards', String(d.rejectedBackwards)],
    ['context rate', sampleRate ? `${sampleRate.toLocaleString()} Hz` : '—'],
  ];

  return (
    <div className="calibration__details">
      <table className="calibration__table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><th>{k}</th><td className="mono">{v}</td></tr>
          ))}
        </tbody>
      </table>
      <button className="calibration__what" onClick={() => setOpen(false)}>Hide</button>
    </div>
  );
}

export function CalibrationPanel(p: Props) {
  /* Nothing below works without an input, so the microphone comes first
     rather than failing silently behind two buttons that look ready. */
  if (!p.granted) {
    return (
      <div className="calibration">
        <button className="calibration__what" onClick={p.onInfo}>
          Why does this matter?
        </button>
        <p className="dim">
          Calibration listens to the audio input, so it needs the microphone —
          the same permission the measuring screen asks for.
        </p>
        <button style={{ width: '100%' }} onClick={p.onRequestMic} disabled={p.busy}>
          Allow microphone
        </button>
      </div>
    );
  }

  const running = p.check !== null;

  return (
    <div className="calibration">
      <button className="calibration__what" onClick={p.onInfo}>
        Why does this matter?
      </button>

      {/* Which input, shown here as well as on the measuring screen: a
          correction belongs to one audio device, and calibrating with the
          wrong one selected produces a number for hardware you are not
          using. */}
      <label className="calibration__device">
        <span className="dim">Input</span>
        <select
          aria-label="Audio input"
          value={p.selectedId ?? ''}
          onChange={(e) => p.onSelectDevice(e.target.value)}
          disabled={p.capturing || p.devices.length === 0}
        >
          {p.devices.length === 0 && <option value="">No audio inputs found</option>}
          {p.devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
        <span className="dim mono calibration__rate">
          {p.sampleRate ? `${p.sampleRate.toLocaleString()} Hz` : '—'}
        </span>
      </label>

      <label className="calibration__correction">
        <span className="dim">Correction in force</span>
        <input
          className="field mono"
          value={p.draft}
          onChange={(e) => p.onDraftChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={p.onDraftCommit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          aria-label="Audio clock correction, seconds per day"
        />
        <span className="dim">s/day</span>
        {p.hasCorrection && (
          <button className="secondary" onClick={p.onClearClock} style={{ fontSize: 13 }}>
            Clear
          </button>
        )}
      </label>

      <Method
        title="Against the system clock"
        needs={[
          'Nothing on the sensor — it does not listen to a watch.',
          `About ${MIN_SECONDS} seconds, in one go.`,
          'The app in front and the screen awake, or the audio is interrupted.',
        ]}
      >
        {p.clock ? (
          <>
            <p className="dim">
              This device measures{' '}
              <strong className="mono">
                {p.clock.driftSecondsPerDay > 0 ? '+' : ''}
                {p.clock.driftSecondsPerDay.toFixed(2)} ± {p.clock.errorSecondsPerDay.toFixed(2)} s/day
              </strong>{' '}
              over {p.clock.seconds.toFixed(0)}s.
            </p>
            <button
              className="secondary"
              style={{ width: '100%' }}
              onClick={() => p.onApplyClock(p.clock!.driftSecondsPerDay)}
            >
              Use it
            </button>
          </>
        ) : p.clockDisturbed ? (
          <p className="dim">
            That run measured a shift too large for a crystal, so it is not
            being offered. It may be real — a cheap USB device can be this far
            out — or it may be frames going missing rather than the clock being
            slow, which this method cannot tell apart. Run the quartz check: it
            uses a physical reference and will say which. The figures are under
            <em> Show the numbers</em>.
          </p>
        ) : p.capturing ? (
          <p className="dim">
            Listening — {p.clockSeconds.toFixed(0)}s of {MIN_SECONDS}s.
          </p>
        ) : (
          <p className="dim">Not started.</p>
        )}

        {!p.clock && (
          <button
            className="secondary"
            style={{ width: '100%' }}
            onClick={p.capturing ? p.onStopCapture : p.onStartCapture}
            disabled={p.devices.length === 0 || p.busy}
          >
            {p.capturing ? 'Stop listening' : 'Start listening'}
          </button>
        )}

        <Details d={p.clockDebug} sampleRate={p.sampleRate} />
      </Method>

      <Method
        title="Against a quartz watch"
        needs={[
          'An analogue quartz watch with a ticking seconds hand, on the sensor.',
          'About 15 minutes, dead still, on something rigid.',
          'The app in front and the screen awake.',
        ]}
      >
        {running && p.check!.state === 1 ? (
          <>
            <p className="dim">
              Against the reference, this device measures{' '}
              <strong className="mono">
                {p.check!.driftSecondsPerDay > 0 ? '+' : ''}
                {p.check!.driftSecondsPerDay.toFixed(2)} s/day
              </strong>.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="secondary"
                style={{ flex: '1 1 auto' }}
                onClick={() => p.onUseCheck(p.check!.driftSecondsPerDay)}
              >
                Use it
              </button>
              <button className="secondary" onClick={p.onStopCheck}>Discard</button>
            </div>
          </>
        ) : running && p.check!.state === -1 ? (
          <>
            <p className="dim">
              Finished, but the fit was too scattered to trust. Hold the watch
              firmly against the sensor, somewhere quiet, and run it again.
            </p>
            <button className="secondary" style={{ width: '100%' }} onClick={p.onStopCheck}>
              Close
            </button>
          </>
        ) : running ? (
          <>
            <p className="dim">
              {p.check!.signal >= LOCKED_SIGNAL
                ? `Heard it — ${p.check!.collected} of ${p.check!.needed} ticks, about ${Math.ceil((p.check!.needed - p.check!.collected) / 60)} min left.`
                : 'Listening for a once-a-second tick. If it has not found one within a minute, the watch is not coupling to the sensor.'}
            </p>
            <button className="secondary" style={{ width: '100%' }} onClick={p.onStopCheck}>
              Stop
            </button>
          </>
        ) : (
          <button
            className="secondary"
            style={{ width: '100%' }}
            onClick={p.onStartCheck}
            disabled={p.devices.length === 0 || p.busy}
          >
            Start quartz check
          </button>
        )}
      </Method>

      <p className="dim calibration__note">
        Both measure the same thing and feed the same correction, and both run
        off one capture — so a quartz run also produces a system-clock figure
        over the same time. The system clock is disciplined against network time
        and is the better reference; the quartz result is only as good as the
        watch, because it cannot tell the card apart from it.
      </p>
    </div>
  );
}
