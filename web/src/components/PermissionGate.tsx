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

/*
   The first screen, and the only one that has to explain itself.

   Someone arriving here has been handed a link and does not yet know what a
   timegrapher measures or why a web page wants their microphone. Both get
   answered before the button, because a permission prompt you do not
   understand is a permission prompt you decline.
*/
export function PermissionGate({ onGrant, error, busy }: Props) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 19 }}>
          A timegrapher in your browser
        </h2>
        <p className="dim" style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>
          Hold a mechanical watch against a microphone and this listens to its
          escapement, then tells you how fast it runs, how far the balance
          swings and how evenly it beats.
        </p>
        <button onClick={onGrant} disabled={busy} style={{ minWidth: 190 }}>
          {busy ? 'Requesting…' : 'Allow microphone'}
        </button>
      </div>

      <p className="dim" style={{ fontSize: 13, marginTop: 18, marginBottom: 0 }}>
        Nothing is recorded or uploaded. The audio is analysed on this device
        and never leaves it.
      </p>

      {/* Named up front so the switch at the top of the next screen is not the
          first time either word appears. */}
      <div className="gate__modes">
        <p>
          <strong>Measure</strong> is the live view — one reading, watched while
          you adjust.
        </p>
        <p>
          <strong>Certify</strong> walks you through six positions and produces
          a printable timing certificate.
        </p>
      </div>

      {error && <p className="bad" style={{ fontSize: 13, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
