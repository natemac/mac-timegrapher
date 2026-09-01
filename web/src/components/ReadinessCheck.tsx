/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { AudioInput } from '../audio/device-manager';
import type { CheckItem, CheckState, ReadinessReport, ReadinessStatus } from '../timegrapher/readiness';

/*
   The pre-measurement check.

   It reduces the live audio path to one verdict before a measurement, so a
   resample, a muffled pickup or a browser quietly applying gain is caught here
   rather than corrupting a reading. It is not calibration and says so — it
   asks whether the stream is configured, continuous and carrying a clear
   escapement, nothing about the absolute clock rate.

   No new audio: every row is the app's own live state, run through
   assessReadiness. The check simply needs a capture going, which is why it
   carries the same microphone and input controls as calibration.
*/

interface Props {
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
  report: ReadinessReport;
}

const MARK: Record<CheckState, string> = {
  pass: '✓', warning: '!', fail: '✕', unknown: '?', pending: '·',
};

const STATUS_LABEL: Record<ReadinessStatus, string> = {
  ready: 'Ready for measurement',
  warning: 'Ready, with warnings',
  'not-ready': 'Not ready',
  pending: 'Checking…',
};

function Row({ item }: { item: CheckItem }) {
  return (
    <li className={`readiness__row readiness__row--${item.state}`}>
      <span className="readiness__mark" aria-hidden="true">{MARK[item.state]}</span>
      <span className="readiness__label">{item.label}</span>
      <span className="readiness__detail">{item.detail}</span>
    </li>
  );
}

export function ReadinessCheck(p: Props) {
  if (!p.granted) {
    return (
      <div className="readiness">
        <p className="dim">
          The check listens to the audio input, so it needs the microphone — the
          same permission the measuring screen asks for.
        </p>
        <button style={{ width: '100%' }} onClick={p.onRequestMic} disabled={p.busy}>
          Allow microphone
        </button>
      </div>
    );
  }

  const { report } = p;

  return (
    <div className="readiness">
      <div className={`readiness__banner readiness__banner--${report.overall}`}>
        {STATUS_LABEL[report.overall]}
      </div>

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
      </label>

      <button
        style={{ width: '100%' }}
        onClick={p.capturing ? p.onStopCapture : p.onStartCapture}
        disabled={p.devices.length === 0 || p.busy}
      >
        {p.capturing ? 'Stop check' : 'Run check'}
      </button>

      <section className="readiness__phase">
        <h3 className="readiness__phase-title">Device</h3>
        <p className="dim readiness__phase-note">Needs nothing on the sensor.</p>
        <ul className="readiness__list">
          {report.device.map((i) => <Row key={i.id} item={i} />)}
        </ul>
      </section>

      <section className="readiness__phase">
        <h3 className="readiness__phase-title">Signal</h3>
        <p className="dim readiness__phase-note">With the movement on the pickup.</p>
        <ul className="readiness__list">
          {report.signal.map((i) => <Row key={i.id} item={i} />)}
        </ul>
      </section>

      <p className="dim readiness__note">
        This checks the audio path, not the clock. It cannot prove the sample
        rate is exactly its nominal value — that is what Calibration is for.
      </p>
    </div>
  );
}
