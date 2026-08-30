/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { SignalState, SignalStrength } from '../audio/signal-strength';
import { PanelHead } from './PanelHead';
import type { Topic } from './guide-content';

/** Map dBFS onto the bar, with a -60 dB floor. */
function toPercent(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

const STRENGTH_LABEL: Record<SignalStrength, string> = {
  none: 'No signal',
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  excellent: 'Excellent',
};

const STRENGTH_COLOUR: Record<SignalStrength, string> = {
  none: 'var(--text-faint)',
  weak: 'var(--bad)',
  fair: 'var(--warn)',
  good: 'var(--ok)',
  excellent: 'var(--ok)',
};

export function LevelMeter({ signal, onHelp }: { signal: SignalState | null; onHelp: (t: Topic) => void }) {
  const level = signal ? toPercent(signal.levelDb) : 0;
  const peak = signal ? toPercent(20 * Math.log10(Math.max(signal.peakHold, 1e-6))) : 0;
  const strength: SignalStrength = signal?.strength ?? 'none';
  const clipped = signal?.clipped ?? false;

  return (
    <div className="panel panel--tight">
      <PanelHead
        label="Signal"
        topic="signal"
        onHelp={onHelp}
        right={
        <span
          className="mono"
          style={{
            fontSize: 12,
            letterSpacing: '0.06em',
            color: clipped ? 'var(--bad)' : STRENGTH_COLOUR[strength],
          }}
        >
          {clipped ? 'TOO LOUD' : STRENGTH_LABEL[strength]}
        </span>
        }
      />

      <div
        style={{
          position: 'relative',
          height: 8,
          background: 'var(--panel-3)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${level}%`,
            height: '100%',
            background: clipped ? 'var(--bad)' : STRENGTH_COLOUR[strength],
            // Matches the meter's own release, so the bar and the number agree.
            transition: 'width 120ms linear, background-color 300ms ease',
          }}
        />
        {/* Peak marker: holds, then drifts down. It is what tells you a
            transient happened after the bar itself has fallen back. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${peak}%`,
            width: 2,
            height: '100%',
            background: 'var(--text)',
            opacity: peak > 0 ? 0.8 : 0,
            transition: 'left 200ms linear',
          }}
        />
      </div>

      <p className="dim" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
        {signal && signal.strength !== 'none'
          ? `Ticks stand ${signal.headroomDb.toFixed(0)} dB above the room.`
          : 'Nothing detected yet.'}
      </p>
    </div>
  );
}
