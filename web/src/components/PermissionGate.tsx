/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
interface Props {
  onGrant: () => void;
  error: string | null;
  busy: boolean;
}

export function PermissionGate({ onGrant, error, busy }: Props) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      {/* Heading and action centred together so the eye lands on the one thing
          there is to do; the explanation stays left-aligned below, because
          centred body text is harder to read. */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ marginTop: 0, marginBottom: 14, fontSize: 17 }}>Microphone access</h2>
        <button onClick={onGrant} disabled={busy} style={{ minWidth: 190 }}>
          {busy ? 'Requesting…' : 'Allow microphone'}
        </button>
      </div>

      <p className="dim" style={{ fontSize: 13, marginTop: 18, marginBottom: 0 }}>
        This tool listens to your watch through an audio input. Nothing is
        recorded or uploaded, and everything is processed on this device.
      </p>

      {error && <p className="bad" style={{ fontSize: 13, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
