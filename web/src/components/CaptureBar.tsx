/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { POSITIONS, type PositionId, type Reading } from '../timegrapher/session';
import type { Settling } from '../timegrapher/stability';

/*
   Choose a position, capture the reading.

   Capture is deliberately withheld until the reading has settled. The whole
   point of recording a number is that it is repeatable, and a number caught
   while it was still wandering is worse than no number — it looks just as
   authoritative in a build record.
*/
interface Props {
  position: PositionId;
  onSelectPosition: (p: PositionId) => void;
  settling: Settling;
  canCapture: boolean;
  readings: Reading[];
  onCapture: () => void;
  justCaptured: boolean;
}

export function CaptureBar({
  position, onSelectPosition, settling, canCapture, readings, onCapture, justCaptured,
}: Props) {
  const measured = new Set(readings.map((r) => r.position));
  const settled = settling === 'settled';
  const enabled = canCapture && settled;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
      <select
        aria-label="Position"
        value={position}
        onChange={(e) => onSelectPosition(e.target.value as PositionId)}
        style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, padding: '9px 10px' }}
      >
        {POSITIONS.map((p) => (
          <option key={p.id} value={p.id}>
            {measured.has(p.id) ? `${p.name} ✓` : p.name}
          </option>
        ))}
      </select>

      <button
        onClick={onCapture}
        disabled={!enabled}
        style={{ flex: '0 0 auto', minWidth: 104, fontSize: 13, padding: '9px 12px' }}
        title={settled ? undefined : 'Wait for the reading to settle'}
      >
        {justCaptured ? 'Captured' : measured.has(position) ? 'Re-capture' : 'Capture'}
      </button>
    </div>
  );
}
