/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState } from 'react';

export interface Settings {
  /** Milliseconds of drift spanning the trace width. Smaller magnifies more. */
  zoomMs: number;
  /** Seconds of history the trace shows. */
  traceSeconds: number;
}

export const DEFAULT_SETTINGS: Settings = { zoomMs: 20, traceSeconds: 30 };

/*
   Magnification, in the units a watchmaker already thinks in. 5 ms across the
   width is enough to see a single second a day lean; 100 ms takes in a badly
   out-of-beat movement without the lines wrapping every few seconds.
*/
const ZOOM_STEPS = [5, 10, 20, 50, 100];
const HISTORY_STEPS = [15, 30, 60];

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
}

type Tab = 'guide' | 'settings';

function Choice<T extends number>({
  label, options, value, format, onSelect,
}: {
  label: string;
  options: readonly T[];
  value: T;
  format: (v: T) => string;
  onSelect: (v: T) => void;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <button
            key={o}
            className={o === value ? undefined : 'secondary'}
            style={{ flex: '1 1 0', minWidth: 56, fontSize: 13, padding: '9px 0' }}
            onClick={() => onSelect(o)}
            aria-pressed={o === value}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Entry({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{term}</div>
      <div className="dim" style={{ fontSize: 13.5, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function SettingsSheet({ open, onClose, settings, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('guide');
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus moves into the sheet when it opens so a keyboard
  // user is not left behind on the page underneath.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet__scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" ref={panelRef} role="dialog" aria-modal="true" aria-label="Guide and settings">
        <div className="sheet__head">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['guide', 'settings'] as const).map((t) => (
              <button
                key={t}
                className={tab === t ? undefined : 'secondary'}
                style={{ fontSize: 13, padding: '7px 14px', textTransform: 'capitalize' }}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            ref={closeRef}
            className="secondary"
            onClick={onClose}
            aria-label="Close"
            style={{ padding: '7px 13px', fontSize: 15, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        <div className="sheet__body">
          {tab === 'settings' ? (
            <>
              <Choice
                label="Trace magnification"
                options={ZOOM_STEPS}
                value={settings.zoomMs}
                format={(v) => `${v} ms`}
                onSelect={(zoomMs) => onChange({ ...settings, zoomMs })}
              />
              <p className="dim" style={{ fontSize: 13, lineHeight: 1.55, marginTop: -8 }}>
                How much drift spans the width of the trace. A smaller number
                magnifies more, so a small rate error leans further. If the lines
                wrap around the edges faster than you can read them, choose a
                larger number.
              </p>

              <Choice
                label="Trace history"
                options={HISTORY_STEPS}
                value={settings.traceSeconds}
                format={(v) => `${v} s`}
                onSelect={(traceSeconds) => onChange({ ...settings, traceSeconds })}
              />
              <p className="dim" style={{ fontSize: 13, lineHeight: 1.55, marginTop: -8 }}>
                How far back the trace remembers. Longer shows the trend more
                clearly; shorter reacts faster when you move the regulator.
              </p>
            </>
          ) : (
            <>
              <p style={{ marginTop: 0, fontSize: 14, lineHeight: 1.6 }}>
                Hold the watch firmly against the sensor and press Start. Give it
                twenty to thirty seconds — readings wander at first and then
                settle.
              </p>

              <h3 style={{ fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
                The readings
              </h3>

              <Entry term="Rate">
                How many seconds a day the watch gains or loses. Positive is
                fast. This is the one you change by moving the regulator. Most
                mechanical watches are considered good within about ±10 s/day,
                and a chronometer-grade movement within about −4 to +6.
              </Entry>

              <Entry term="Amplitude">
                How far the balance wheel swings, in degrees. It tells you about
                the health of the movement rather than its accuracy — roughly
                270–310° fully wound and lying flat is healthy. Much below 250°
                usually means old oil, dirt, or a mainspring past its best. It
                falls naturally in vertical positions and as the watch unwinds.
              </Entry>

              <Entry term="Beat error">
                Whether the tick and the tock are evenly spaced, in milliseconds.
                Think of a limp: the watch still runs, but unevenly. Under about
                0.5 ms is good and under 0.3 ms is very good. High beat error
                costs amplitude and makes the watch more position-sensitive.
                Correcting it means moving the hairspring collet, not the
                regulator.
              </Entry>

              <Entry term="Beat rate">
                How many beats an hour the movement makes — its design speed,
                not a fault. An NH35 is 21,600 bph; many chronographs are 28,800.
                The app works this out from the sound. If it shows a number you
                do not expect, the reading is probably picking up something other
                than the escapement.
              </Entry>

              <h3 style={{ fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
                The displays
              </h3>

              <Entry term="Settling">
                The dot shows how far the current reading sits from where it has
                been. While the watch is being found, it swings. As the reading
                steadies, the dot draws in and comes to rest inside the band and
                turns green. Wait for that before writing a number down.
              </Entry>

              <Entry term="Signal">
                How far the ticks stand above the room noise. Good or Excellent
                means the sensor has a clear signal. Weak means press the watch
                more firmly against the sensor or find somewhere quieter. Too
                loud means the input is clipping — turn the input level down in
                your system sound settings.
              </Entry>

              <Entry term="Trace">
                The classic paper strip. Every beat leaves a mark, newest at the
                top. Two lines: tick and tock.
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  <li><strong>Straight down</strong> — keeping time.</li>
                  <li><strong>Leaning right</strong> — gaining. Leaning left — losing.</li>
                  <li><strong>Steeper lean</strong> — further off.</li>
                  <li><strong>Gap between the two lines</strong> — the beat error.</li>
                  <li><strong>Fuzzy or scattered marks</strong> — a dirty movement, or a poor grip on the sensor.</li>
                </ul>
                Turn the regulator and watch the slope change; you will see it
                long before the numbers catch up.
              </Entry>

              <Entry term="Waveform">
                The raw sound. Useful for checking the sensor is picking up the
                watch: you want evenly spaced spikes in pairs against a quiet
                floor. A continuous fuzzy band means it is hearing the room, not
                the escapement.
              </Entry>

              <h3 style={{ fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
                Getting a reading you can trust
              </h3>

              <ul className="dim" style={{ fontSize: 13.5, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
                <li>Wind the watch fully and let it settle for ten minutes first.</li>
                <li>Keep firm, steady contact with the sensor.</li>
                <li>Work somewhere quiet; the sensor hears the room too.</li>
                <li>Wait for Settled before recording the number.</li>
                <li>Measure in several positions — dial up, dial down, crown down. A watch that is perfect flat and terrible on its side has a different problem from one that is simply fast.</li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
