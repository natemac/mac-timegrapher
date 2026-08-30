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

/*
   The first screen.

   Four things, centred, and nothing else: what this is, what you are here to
   do, the one button, and what happens to the audio. An app opens; it does not
   introduce itself at length. The guide behind the cog explains what a
   timegrapher measures for anyone who wants that.

   Choosing the mode happens here, and only here. It is a decision made once —
   you know whether you are regulating or inspecting before you pick the watch
   up — and a control for it in the measuring view costs a row of height that
   the trace needs more. The consequence is that switching after the microphone
   is allowed takes a reload; the choice is remembered, so the reload lands
   where you left it.
*/
export function PermissionGate({ onGrant, error, busy, mode, onSelectMode }: Props) {
  return (
    <div className="panel" style={{ marginBottom: 0, textAlign: 'center' }}>
      <h2 style={{ marginTop: 0, marginBottom: 20, fontSize: 19 }}>
        A timegrapher in your browser
      </h2>

      <div className="gate__mode">
        <ModeSwitch value={mode} onChange={onSelectMode} />
      </div>

      {/* It grants access and opens the app in one press, so it says both.
          "Allow microphone" described the permission prompt rather than what
          the button was for. */}
      <button onClick={onGrant} disabled={busy} style={{ minWidth: 190 }}>
        {busy ? 'Requesting…' : 'Allow Mic & Begin'}
      </button>

      <p className="dim" style={{ fontSize: 13, marginTop: 20, marginBottom: 0 }}>
        Nothing is recorded or uploaded. The audio is analysed on this device
        and never leaves it.
      </p>

      {error && <p className="bad" style={{ fontSize: 13, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
