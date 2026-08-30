/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { SETTLED_BOUNDS, type Settling, type Spread } from '../timegrapher/stability';

/*
   When is it safe to write the number down?

   The dot is the current rate's distance from its own recent mean, and the
   band is how close counts as close enough. A wandering reading swings the
   dot; as it stops wandering the dot draws in and comes to rest inside the
   band. Nothing here is decorative — the movement is the measurement, so an
   operator can tell at a glance whether the watch has settled or they are
   still watching it hunt.

   The full width is three times the settled tolerance, so a dot at the edge is
   three times further out than acceptable.
*/

interface Props {
  settling: Settling;
  rate: number | null;
  spread: Spread | null;
  onReset: () => void;
}

const LABEL: Record<Settling, string> = {
  waiting: 'Listening',
  moving: 'Moving',
  settling: 'Settling',
  settled: 'Settled',
};

export function SettlingIndicator({ settling, rate, spread, onReset }: Props) {
  const settled = settling === 'settled';
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const live = rate !== null && spread !== null;

  // -1 .. 1 across the track. Centre is "exactly where it has been sitting".
  const offset = live
    ? Math.max(-1, Math.min(1, (rate - spread.mean) / (SETTLED_BOUNDS.rate * 3)))
    : 0;

  const bandHalfWidth = (1 / 3) * 50; // the tolerance as a % of half the track

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          position: 'relative',
          flex: '1 1 auto',
          height: 14,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Track */}
        <div style={{ position: 'absolute', inset: '50% 0 auto 0', height: 1, background: 'var(--line)' }} />

        {/* The band the reading has to stay inside to count as settled. */}
        <div
          style={{
            position: 'absolute',
            left: `${50 - bandHalfWidth}%`,
            width: `${bandHalfWidth * 2}%`,
            top: 3,
            bottom: 3,
            border: '1px solid var(--line)',
            borderRadius: 2,
            background: settled ? 'color-mix(in srgb, var(--ok) 14%, transparent)' : 'transparent',
            transition: reduceMotion ? 'none' : 'background-color 400ms ease',
          }}
        />

        {/* The reading itself. */}
        <div
          style={{
            position: 'absolute',
            left: `calc(${50 + offset * 50}% - 4px)`,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: settled ? 'var(--ok)' : 'var(--text)',
            transition: reduceMotion
              ? 'none'
              : 'left 420ms cubic-bezier(0.22, 1, 0.36, 1), background-color 400ms ease',
          }}
        />
      </div>

      <span
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: settled ? 'var(--ok)' : 'var(--text-faint)',
          minWidth: 66,
          textAlign: 'right',
        }}
      >
        {LABEL[settling]}
      </span>

      {/*
        Repositioning the watch makes a burst of noise that the spread has no
        way to tell from the movement misbehaving, and it stays in the window
        for the next thirty seconds. Rather than wait it out, discard what has
        been collected and start the average again — without stopping capture,
        which would throw away the audio too.
      */}
      <button
        className="panel__help-icon"
        onClick={onReset}
        aria-label="Restart the average"
        title="Restart the average"
        style={{ flex: '0 0 auto' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 2.6-6.4" strokeLinecap="round" />
          <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
