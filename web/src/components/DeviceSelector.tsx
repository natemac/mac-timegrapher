/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { AudioInput } from '../audio/device-manager';
import type { ProcessingWarning } from '../audio/audio-engine';

interface Props {
  devices: AudioInput[];
  selectedId: string | null;
  sampleRate: number | null;
  requestedSampleRate: number | null;
  warnings: ProcessingWarning[];
  capturing: boolean;
  onSelect: (deviceId: string) => void;
  onStart: () => void;
  onStop: () => void;
}

export function DeviceSelector({
  devices, selectedId, sampleRate, requestedSampleRate, warnings, capturing,
  onSelect, onStart, onStop,
}: Props) {
  const applied = warnings.filter((w) => w.state === 'applied');
  const unreported = warnings.filter((w) => w.state === 'unreported');

  // Only a rate that was actually asked for can be said to have been refused,
  // so a device that reported no rate of its own cannot produce a mismatch.
  const rateMismatch =
    sampleRate !== null && requestedSampleRate !== null && requestedSampleRate !== sampleRate
      ? { requested: requestedSampleRate, actual: sampleRate }
      : null;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Audio input</h2>

      {devices.length === 0 ? (
        <p className="bad">No audio inputs found. Connect a device and reload.</p>
      ) : (
        <select
          aria-label="Audio input"
          value={selectedId ?? ''}
          disabled={capturing}
          onChange={(e) => onSelect(e.target.value)}
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={capturing ? onStop : onStart} disabled={devices.length === 0}>
          {capturing ? 'Stop' : 'Start'}
        </button>
        {sampleRate !== null && (
          <span className="mono dim">{sampleRate.toLocaleString()} Hz</span>
        )}
      </div>

      {rateMismatch && (
        <p className="bad" style={{ marginBottom: 0 }}>
          This browser refused the device's own{' '}
          {rateMismatch.requested.toLocaleString()} Hz and is running at{' '}
          {rateMismatch.actual.toLocaleString()} Hz, so incoming audio is being
          resampled before it reaches this page. The waveform and level meter
          are still useful for checking that the movement is audible, but a WAV
          recorded in this state is a resampled derivative rather than the
          device's own samples — do not keep it as a reference fixture.
        </p>
      )}

      {applied.length > 0 && (
        <p className="warn" style={{ marginBottom: 0 }}>
          This browser applied {applied.map((w) => w.setting).join(', ')} despite
          being asked not to. Tick timing is still usable, but amplitude
          measurement from this input will not be trustworthy.
        </p>
      )}

      {unreported.length > 0 && (
        <p className="dim" style={{ marginBottom: 0, fontSize: 13 }}>
          This browser does not report whether{' '}
          {unreported.map((w) => w.setting).join(', ')}{' '}
          {unreported.length === 1 ? 'is' : 'are'} active. We asked for
          {unreported.length === 1 ? ' it' : ' them'} to be off, but cannot
          confirm it from here.
        </p>
      )}
    </div>
  );
}
