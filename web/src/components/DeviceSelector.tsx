/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { AudioInput } from '../audio/device-manager';
import { PanelHead } from './PanelHead';
import type { Topic } from './guide-content';

interface Props {
  devices: AudioInput[];
  selectedId: string | null;
  sampleRate: number | null;
  requestedSampleRate: number | null;
  capturing: boolean;
  busy: boolean;
  onSelect: (deviceId: string) => void;
  onStart: () => void;
  onStop: () => void;
  onHelp: (t: Topic) => void;
}

export function DeviceSelector({
  devices, selectedId, sampleRate, requestedSampleRate,
  capturing, busy, onSelect, onStart, onStop, onHelp,
}: Props) {
  // A rate the browser refused means it resampled, which makes the recording a
  // derivative rather than a reference. Worth surfacing; the applied-processing
  // detail behind it is debugging information and lives in the console.
  const rateMismatch =
    capturing && sampleRate !== null && requestedSampleRate !== null &&
    Math.abs(sampleRate - requestedSampleRate) > 1;

  return (
    <div className="panel panel--tight">
      <PanelHead
        label="Audio input"
        topic="input"
        onHelp={onHelp}
        right={capturing && sampleRate !== null ? (
          <span className="mono dim" style={{ fontSize: 11 }}>
            {sampleRate.toLocaleString()} Hz
          </span>
        ) : undefined}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={capturing ? onStop : onStart}
          disabled={devices.length === 0 || busy}
          style={{ flex: '0 0 auto', minWidth: 84 }}
        >
          {capturing ? 'Stop' : 'Start'}
        </button>
        <select
          aria-label="Audio input"
          value={selectedId ?? ''}
          disabled={capturing || busy}
          onChange={(e) => onSelect(e.target.value)}
          style={{ flex: '1 1 auto', minWidth: 0 }}
        >
          {devices.length === 0 ? (
            <option>No audio inputs found</option>
          ) : (
            devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))
          )}
        </select>
      </div>

      {rateMismatch && (
        <p className="bad" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          The browser resampled this input to {sampleRate?.toLocaleString()} Hz.
          Readings are still usable; a recording made now is not a reference fixture.
        </p>
      )}
    </div>
  );
}
