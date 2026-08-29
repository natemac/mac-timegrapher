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
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Microphone access</h2>
      <p className="dim">
        This tool listens to your watch through an audio input. Nothing is
        recorded or uploaded until you press record, and recordings stay on
        this device.
      </p>
      <button onClick={onGrant} disabled={busy}>
        {busy ? 'Requesting…' : 'Allow microphone'}
      </button>
      {error && <p className="bad">{error}</p>}
    </div>
  );
}
