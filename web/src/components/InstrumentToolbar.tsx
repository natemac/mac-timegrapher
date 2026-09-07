/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { AudioInput } from '../audio/device-manager';

/*
   Input, transport and calibre, on one row.

   The same row serves both modes: in Live Timing it sits under the heading, and
   in an Inspection it moves inside the wizard, so the operator is not reaching
   between two panels for every position.

   Permission is asked for here rather than on the way in. Before it is granted
   there is nothing to choose and nothing to start, so the row is a single
   button; afterwards the button is replaced by the input and the transport. The
   swap is done with the `hidden` attribute rather than by rendering nothing,
   because the stylesheet sizes the row from which of the two is present.
*/
interface Props {
  granted: boolean;
  busy: boolean;
  devices: AudioInput[];
  selectedId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onRequestMic: () => void;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  /*
     The run is finished, so the transport clears it instead of starting it.
     There is nothing left to measure and the next thing anybody wants is the
     next watch.
  */
  clearing?: boolean;
  onClear?: () => void;
  /** No input to open, or a start/stop already in flight. */
  transportDisabled: boolean;
  movementName: string;
  movementMeta: string;
  onOpenMovement: () => void;
}

export function InstrumentToolbar({
  granted, busy, devices, selectedId, onSelectDevice, onRequestMic,
  running, onStart, onStop, clearing = false, onClear, transportDisabled,
  movementName, movementMeta, onOpenMovement,
}: Props) {
  const label = clearing ? 'Clear' : running ? 'Pause' : 'Start';
  return (
    <div className="instrument-toolbar" id="instrumentToolbar">
      <div className="instrument-input">
        <span className="microphone-symbol" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M6 11v2a6 6 0 0 0 12 0v-2M12 19v3m-4 0h8" />
          </svg>
        </span>

        <button
          id="instrumentGrant"
          className="plain-control"
          hidden={granted}
          disabled={busy}
          onClick={onRequestMic}
        >
          {busy ? 'Requesting…' : 'Grant Permission'}
        </button>

        <select
          id="instrumentInput"
          aria-label="Audio input"
          hidden={!granted}
          value={selectedId ?? ''}
          disabled={running || devices.length === 0}
          onChange={(e) => onSelectDevice(e.target.value)}
        >
          {devices.length === 0 && <option value="">Default audio input</option>}
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>

        {/*
           Start is the filled button because it is the one thing to do. Pause
           is not: while a reading runs, the button is a way to interrupt it,
           and dressing it identically meant an operator glancing down could not
           tell from the colour whether it was time to move the watch.
        */}
        <button
          id="readingToggle"
          className="reading-toggle"
          data-action={clearing ? 'clear' : running ? 'pause' : 'start'}
          hidden={!granted}
          disabled={transportDisabled && !clearing}
          onClick={clearing ? onClear : running ? onStop : onStart}
          aria-label={clearing ? 'Clear this inspection' : running ? 'Pause readings' : 'Start readings'}
        >
          {label}
        </button>
      </div>

      {/* The calibre is a reading of the setting, not a second place to change
          it — pressing it opens the one place that does. A wrong calibre is a
          wrong amplitude, so it is worth having on screen throughout. */}
      <button
        id="instrumentMovement"
        className="movement-control"
        onClick={onOpenMovement}
        aria-label={`Movement: ${movementName}, ${movementMeta}. Change in Settings`}
      >
        <span id="instrumentMovementName">{movementName}</span>
        <small id="instrumentMovementMeta">{movementMeta}</small>
        <span aria-hidden="true">⌄</span>
      </button>
    </div>
  );
}
