/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { ReactNode } from 'react';
import type { AudioInput } from '../../audio/device-manager';

/*
   The input row shared by Device Check and Quartz Calibration.

   Both tabs can be reached before the measuring screen has ever asked for the
   microphone, so both carry the request. It is the same permission and the same
   selection in both places — a correction or a check belongs to one audio
   device, and running either against a different input than the one you measure
   with produces a number for hardware you are not using.

   Granting does not start anything. That is deliberate: the operator should be
   able to see what is available before committing to a fifteen-minute run.
*/
interface Props {
  /** The select's id, which the design's stylesheet targets by name. */
  id: string;
  /** The grant button's id, likewise. */
  grantId: string;
  granted: boolean;
  busy: boolean;
  devices: AudioInput[];
  selectedId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onRequestMic: () => void;
  /** Locked while a check or calibration is using the device. */
  disabled?: boolean;
  hint: string | null;
  hintId: string;
  /** Run Check, or nothing at all on the calibration tab. */
  action?: ReactNode;
}

export function AudioInputRow({
  id, grantId, granted, busy, devices, selectedId, onSelectDevice, onRequestMic,
  disabled = false, hint, hintId, action,
}: Props) {
  return (
    <>
      <div className="device-input-row">
        <label htmlFor={id}>INPUT</label>
        <button
          id={grantId}
          className="export-button"
          hidden={granted}
          disabled={busy}
          onClick={onRequestMic}
        >
          {busy ? 'Requesting…' : 'Grant Permission'}
        </button>
        <select
          id={id}
          aria-label="Audio input"
          aria-describedby={hintId}
          hidden={!granted}
          value={selectedId ?? ''}
          disabled={disabled || devices.length === 0}
          onChange={(e) => onSelectDevice(e.target.value)}
        >
          {devices.length === 0 && <option value="">No audio inputs found</option>}
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
        {action}
      </div>
      {/* Rendered without a fallback string: the stylesheet hides this with
          :empty, which only matches an element with no child nodes at all. */}
      <p id={hintId} className="device-hint" role="status">{hint}</p>
    </>
  );
}
