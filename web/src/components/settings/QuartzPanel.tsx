/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { AudioInputRow } from './AudioInputRow';
import type { AudioInput } from '../../audio/device-manager';
import type { Calibration } from '../../timegrapher/tg-engine';

/*
   The sound card's own clock, measured against a reference watch.

   Every rate reading is scaled by this figure, and it is zero until somebody
   measures it — which means an uncalibrated device is wrong by however far its
   crystal is out, constantly, invisibly, and without widening the spread that
   would otherwise give it away.

   The check attributes the entire difference between the card and the watch to
   the card, so it is only ever as good as the watch. That is stated on the
   panel rather than buried in the guide, because a correction applied from a
   poor reference is worse than no correction at all.
*/
interface Props {
  granted: boolean;
  busy: boolean;
  devices: AudioInput[];
  selectedId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onRequestMic: () => void;
  hint: string | null;
  check: Calibration | null;
  onStart: () => void;
  onStop: () => void;
  onUse: (driftSecondsPerDay: number) => void;
  /** The correction as typed, committed on blur or Enter. */
  draft: string;
  onDraftChange: (text: string) => void;
  onDraftCommit: () => void;
}

/** The core's own threshold for "this is a tick, not the room". */
const LOCKED_SIGNAL = 4;

const PREPARATION = [
  {
    title: 'Analogue quartz watch',
    detail: 'Use a watch with a ticking seconds hand. We recommend the Casio MQ24.',
  },
  {
    title: 'Watch against the sensor bar',
    detail: 'Position it for a clear, consistent tick.',
  },
  {
    title: 'About 15 minutes, completely still',
    detail: 'Rest the watch and sensor on a rigid surface.',
  },
  {
    title: 'App in front, screen awake',
    detail: 'Keep this app visible and prevent the screen from sleeping.',
  },
];

function statusLine(check: Calibration | null): string {
  if (!check) return 'Ready when your watch is in position.';
  if (check.state === 1) {
    const drift = check.driftSecondsPerDay;
    return `Finished. This device measures ${drift > 0 ? '+' : ''}${drift.toFixed(2)} s/day against the reference.`;
  }
  if (check.state === -1) {
    return 'Finished, but the fit was too scattered to trust. Hold the watch firmly against the sensor, somewhere quiet, and run it again.';
  }
  if (check.signal >= LOCKED_SIGNAL) {
    const left = Math.ceil((check.needed - check.collected) / 60);
    return `Heard it — about ${left} min left. Keep everything still.`;
  }
  return 'Listening for a once-a-second tick. If it has not found one within a minute, the watch is not coupling to the sensor.';
}

export function QuartzPanel({
  granted, busy, devices, selectedId, onSelectDevice, onRequestMic, hint,
  check, onStart, onStop, onUse, draft, onDraftChange, onDraftCommit,
}: Props) {
  const running = check !== null && check.state === 0;
  const finished = check !== null && check.state === 1;
  const needed = check?.needed ?? 900;

  return (
    <section role="tabpanel" id="panel-quartz" aria-labelledby="tab-quartz">
      <AudioInputRow
        id="quartzInput"
        grantId="quartzGrantPermission"
        hintId="quartzInputHint"
        granted={granted}
        busy={busy}
        devices={devices}
        selectedId={selectedId}
        onSelectDevice={onSelectDevice}
        onRequestMic={onRequestMic}
        disabled={running}
        hint={hint}
      />

      <div className="quartz-preparation">
        <h3 className="settings-section-heading">BEFORE YOU BEGIN</h3>
        <div className="device-check-rows">
          {/* Reminders, not a checklist. There is nothing to tick off; the
              marks are there to be read before a fifteen-minute run. */}
          {PREPARATION.map((step) => (
            <div className="quartz-prep-row" key={step.title}>
              <svg className="prep-check" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="m4 10 4 4 8-8" />
              </svg>
              <span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="device-progress">
        <progress
          id="quartzProgress"
          max={needed}
          value={check?.collected ?? 0}
          aria-label="Quartz calibration beats collected"
        />
        <p id="quartzBeatCount">{check?.collected ?? 0} of {needed} beats</p>
        <p id="calibrationStatus" className="device-hint" role="status" aria-live="polite">
          {statusLine(check)}
        </p>
      </div>

      {finished ? (
        <button className="primary" id="calibrationStart" onClick={() => onUse(check!.driftSecondsPerDay)}>
          Use this correction
        </button>
      ) : (
        <button
          className="primary"
          id="calibrationStart"
          disabled={!granted || devices.length === 0 || busy}
          onClick={running ? onStop : onStart}
        >
          {running ? 'Stop Calibration' : 'Run Calibration'}
        </button>
      )}

      <div className="quartz-correction">
        <label htmlFor="quartzCorrection">CORRECTION</label>
        <div>
          <span>Correction of</span>
          <input
            id="quartzCorrection"
            type="text"
            inputMode="decimal"
            value={draft}
            aria-describedby="correctionHint correctionError"
            aria-label="Audio clock correction, seconds per day"
            onChange={(e) => onDraftChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={onDraftCommit}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          <span>s/day</span>
        </div>
        <p id="correctionHint">Filled by calibration, or enter a correction manually.</p>
        <p id="correctionError" role="status" />
      </div>

      <p className="quartz-reference-note">
        Quartz calibration compares your sound card’s clock with the watch and
        attributes the entire difference to the sound card. It is only as
        accurate as your reference watch.
      </p>
    </section>
  );
}
