/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { ModeSwitch, type Mode } from './ModeSwitch';

interface Props {
  onGrant: () => void;
  error: string | null;
  busy: boolean;
  mode: Mode;
  onSelectMode: (m: Mode) => void;
}

const DESCRIPTION: Record<Mode, string> = {
  measure: 'One live reading, watched while you adjust the regulator.',
  certify: 'Six positions, one at a time, ending in a printable certificate.',
};

/*
   The first screen, and the only one that has to explain itself.

   Someone arriving here has been handed a link and does not yet know what a
   timegrapher measures or why a web page wants their microphone. Both get
   answered before the button, because a permission prompt you do not
   understand is a permission prompt you decline.

   Choosing the mode happens here rather than on the measuring screen. It is a
   decision made once — you know whether you are regulating or certifying
   before you pick the watch up — and a control for it in the measuring view
   costs a row of height that the trace needs more. It can still be changed
   later from the settings sheet.
*/
export function PermissionGate({ onGrant, error, busy, mode, onSelectMode }: Props) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 19 }}>
          A timegrapher in your browser
        </h2>
        <p className="dim" style={{ fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          Hold a mechanical watch against a microphone and this listens to its
          escapement, then tells you how fast it runs, how far the balance
          swings and how evenly it beats.
        </p>

        <div className="gate__mode">
          <ModeSwitch value={mode} onChange={onSelectMode} />
        </div>
        {/* The description follows the selection, so both modes explain
            themselves without a paragraph each sitting on screen. */}
        <p className="dim gate__mode-note">{DESCRIPTION[mode]}</p>

        <button onClick={onGrant} disabled={busy} style={{ minWidth: 190 }}>
          {busy ? 'Requesting…' : 'Allow microphone'}
        </button>
      </div>

      <p className="dim" style={{ fontSize: 13, marginTop: 20, marginBottom: 0 }}>
        Nothing is recorded or uploaded. The audio is analysed on this device
        and never leaves it.
      </p>

      {error && <p className="bad" style={{ fontSize: 13, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
