/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { LevelReading } from '../audio/level-meter';

/** Map dBFS onto a 0–100 bar, with a -60 dB floor. */
function toPercent(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export function LevelMeter({ reading }: { reading: LevelReading | null }) {
  const peak = reading ? toPercent(reading.peakDb) : 0;
  const rms = reading ? toPercent(reading.rmsDb) : 0;
  const clipped = reading?.clipped ?? false;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Signal level</h2>
      <div style={{ position: 'relative', height: 18, background: 'var(--panel-3)', borderRadius: 4 }}>
        <div style={{ width: `${rms}%`, height: '100%', background: 'var(--ok)', borderRadius: 4 }} />
        <div style={{
          position: 'absolute', top: 0, left: `${peak}%`, width: 2, height: '100%',
          background: clipped ? 'var(--bad)' : 'var(--text)',
        }} />
      </div>
      <p className="mono dim" style={{ marginBottom: 0, fontSize: 13 }}>
        {reading
          ? `peak ${reading.peakDb === -Infinity ? '−∞' : reading.peakDb.toFixed(1)} dBFS · rms ${
              reading.rmsDb === -Infinity ? '−∞' : reading.rmsDb.toFixed(1)} dBFS`
          : 'not capturing'}
        {clipped && <span className="bad"> · CLIPPING</span>}
      </p>
    </div>
  );
}
