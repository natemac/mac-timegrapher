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

   What this is, what you are here to do, the one button, and what happens to
   the audio. An app opens; it does not introduce itself at length. The guide
   behind the cog explains what a timegrapher measures for anyone who wants
   that.

   Only the choice sits in the panel. The tagline above it and the privacy line
   below are about the app rather than the decision, so they are outside the
   box — the panel is the thing you act on, and it holds only what you act on.

   Choosing the mode happens here, and only here. It is a decision made once —
   you know whether you are regulating or inspecting before you pick the watch
   up — and a control for it in the measuring view costs a row of height that
   the trace needs more. The consequence is that switching after the microphone
   is allowed takes a reload; the choice is remembered, so the reload lands
   where you left it.
*/

/* One line each, because the switch labels alone do not say what the two jobs
   are — and the difference decides the whole session, not a setting. */
const MODE_NOTE: Record<Mode, string> = {
  measure: 'One live reading, for watching the rate move as you turn the regulator.',
  inspection: 'Six positions recorded one at a time, ending in a printable document.',
};

export function PermissionGate({ onGrant, error, busy, mode, onSelectMode }: Props) {
  return (
    <>
      <p className="gate__tagline">A timegrapher in your browser</p>

      <div className="panel gate__panel">
        <div className="gate__mode">
          <ModeSwitch value={mode} onChange={onSelectMode} />
        </div>

        <p className="gate__mode-note">{MODE_NOTE[mode]}</p>

        {/* "Allow Mic & Begin" named the permission rather than the act. The
            microphone prompt follows immediately and the line below says what
            happens to the audio, so the button can just say what it does. */}
        <button onClick={onGrant} disabled={busy} style={{ minWidth: 190 }}>
          {busy ? 'Requesting…' : 'Begin'}
        </button>

        {error && <p className="bad" style={{ fontSize: 13, margin: '14px 0 0' }}>{error}</p>}
      </div>

      <p className="gate__privacy">
        Nothing is recorded or uploaded. The audio is analysed on this device
        and never leaves it.
      </p>

      {/* The build being served, not the moment this page was opened — frozen
          at build time so a bug report names a build. */}
      <p className="gate__version mono">{__BUILD_VERSION__}</p>
    </>
  );
}
