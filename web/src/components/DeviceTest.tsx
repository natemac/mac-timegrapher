/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { AudioInput } from '../audio/device-manager';
import type { DeviceTestReport, TestProgress, CaptureProfile } from '../audio/device-test';
import { verdict } from '../export/device-report';

/*
   Everything worth asking of a device, in one press.

   Diagnosing a phone that will not measure cost a round trip per hypothesis,
   and two of those trips were spent on the wrong microphone and the wrong
   processing configuration without either being visible. This asks all of it
   at once — every configuration, the spectrum, and whether the analysis
   actually locks — and produces a file that says what it found.
*/

interface Props {
  granted: boolean;
  onRequestMic: () => void;
  busy: boolean;
  devices: AudioInput[];
  selectedId: string | null;
  onSelectDevice: (deviceId: string) => void;
  capturing: boolean;
  running: boolean;
  progress: TestProgress | null;
  report: DeviceTestReport | null;
  onRun: () => void;
  onExport: () => void;
  /* The profile an ordinary capture runs under, for identifying by hand which
     microphone is physically being heard. */
  profile: CaptureProfile;
  onProfileChange: (p: CaptureProfile) => void;
}

export function DeviceTest(p: Props) {
  if (!p.granted) {
    return (
      <div className="calibration">
        <p className="dim">
          The test listens to the audio input, so it needs the microphone — the
          same permission the measuring screen asks for.
        </p>
        <button style={{ width: '100%' }} onClick={p.onRequestMic} disabled={p.busy}>
          Allow microphone
        </button>
      </div>
    );
  }

  return (
    <div className="calibration">
      <p className="dim" style={{ fontSize: 12, margin: 0 }}>
        Runs the whole set on this device: every processing configuration the
        platform offers, what each one is actually granted, where the sound
        energy sits, and whether the analysis locks onto a beat. Takes about a
        minute and needs no calibration.
      </p>

      <ul className="calibration__needs">
        <li>Put the watch on the sensor first — the last part listens for a beat.</li>
        <li>Stay on this tab and keep the screen awake.</li>
        <li>About ninety seconds. It will say what it found at the end.</li>
      </ul>

      <label className="calibration__device">
        <span className="dim">Input</span>
        <select
          aria-label="Audio input"
          value={p.selectedId ?? ''}
          onChange={(e) => p.onSelectDevice(e.target.value)}
          disabled={p.capturing || p.running || p.devices.length === 0}
        >
          {p.devices.length === 0 && <option value="">No audio inputs found</option>}
          {p.devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
      </label>

      <button
        style={{ width: '100%' }}
        onClick={p.onRun}
        disabled={p.running || p.capturing || !p.selectedId}
      >
        {p.running ? 'Running…' : 'Run the full test'}
      </button>

      {p.capturing && !p.running && (
        <p className="dim" style={{ fontSize: 12, margin: 0 }}>
          Stop the capture first; the test needs the microphone to itself.
        </p>
      )}

      {p.running && p.progress && (
        <div className="devicetest__progress">
          <p className="devicetest__phase">{p.progress.label}…</p>
          <div className="devicetest__bar">
            <div
              className="devicetest__bar-fill"
              style={{ width: `${(p.progress.step / p.progress.total) * 100}%` }}
            />
          </div>
          <p className="dim" style={{ fontSize: 11, margin: 0 }}>
            Step {p.progress.step} of {p.progress.total}. Leave it running.
          </p>
        </div>
      )}

      {/*
         Automatic three-second samples cannot settle which microphone is
         physically in use — a sound reaches both, and a level or bandwidth
         difference can equally be the same microphone on a different route.
         This holds an ordinary capture open, waveform and all, under one
         changed variable, so the question can be answered by hand.
      */}
      <div className="devicetest__profile">
        <p className="devicetest__profile-title">Capture profile</p>
        <div className="devicetest__profile-row">
          {([
            ['ours', 'App default'],
            ['ec-only', 'Echo cancellation'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              className={p.profile === id ? '' : 'secondary'}
              onClick={() => p.onProfileChange(id)}
              disabled={p.capturing || p.running}
              aria-pressed={p.profile === id}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="dim settings__probe-note">
          {p.profile === 'ours'
            ? 'All processing off — what the app normally asks for.'
            : 'Echo cancellation on, gain control and noise suppression off. Amplitude under this profile is not trustworthy until it has been checked against a known-good reading.'}
        </p>
        <p className="dim settings__probe-note">
          Close this sheet and press Start to hold a capture open under the
          chosen profile. Tap only the pickup, then only near the phone, and
          watch which one the waveform follows. It stays selected until you
          change it back.
        </p>
      </div>

      {p.report && !p.running && (
        <>
          <div className="devicetest__verdict">
            {verdict(p.report).map((line, i) => <p key={i}>{line}</p>)}
          </div>
          <button className="secondary" style={{ width: '100%' }} onClick={p.onExport}>
            Export the test — send this file
          </button>
        </>
      )}
    </div>
  );
}
