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
  warnings: ProcessingWarning[];
  capturing: boolean;
  onSelect: (deviceId: string) => void;
  onStart: () => void;
  onStop: () => void;
}

export function DeviceSelector({
  devices, selectedId, sampleRate, warnings, capturing, onSelect, onStart, onStop,
}: Props) {
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

      {warnings.length > 0 && (
        <p className="warn" style={{ marginBottom: 0 }}>
          This browser applied {warnings.map((w) => w.setting).join(', ')} despite
          being asked not to. Tick timing is still usable, but amplitude
          measurement from this input will not be trustworthy.
        </p>
      )}
    </div>
  );
}
