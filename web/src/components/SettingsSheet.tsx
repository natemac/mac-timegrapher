/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState } from 'react';
import { GUIDE, GUIDE_ORDER, type Topic } from './guide-content';
import { ZOOM_STEPS, ZOOM_AUTO } from '../timegrapher/trace-zoom';
import { SourceFooter } from './SourceFooter';

export interface Settings {
  /** Milliseconds of drift spanning the trace width. Smaller magnifies more. */
  zoomMs: number;
  /** Seconds of history the trace shows. */
  traceSeconds: number;
  /*
     Whether the MAC mark appears — in the app, on the certificate and on a
     saved reading.

     Branding is not covered by the GPL the way the code is, so a fork or
     another shop running this has every reason to turn it off. The source link
     in the footer is a licence obligation and is not affected by this.
  */
  showLogo: boolean;
}

/* Auto by default: the operator should not have to work out that +17 s/day
   over thirty seconds needs more than ten milliseconds of strip. */
export const DEFAULT_SETTINGS: Settings = {
  zoomMs: ZOOM_AUTO,
  traceSeconds: 30,
  showLogo: true,
};

/* Magnification in the units a watchmaker already thinks in, plus Auto. */
const ZOOM_CHOICES = [ZOOM_AUTO, ...ZOOM_STEPS];
const HISTORY_STEPS = [15, 30, 60];

interface Props {
  open: boolean;
  /** A single section to explain, or null for the full guide and settings. */
  topic: Topic | null;
  onClose: () => void;
  onShowFullGuide: () => void;
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
    <div style={{ marginBottom: 16 }}>
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

export function SettingsSheet({
  open, topic, onClose, onShowFullGuide, settings, onChange,
}: Props) {
  const [tab, setTab] = useState<Tab>('guide');
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /*
     Focus moves into the sheet, and the body returns to the top, when the sheet
     opens or changes subject — not whenever the parent re-renders. Keeping this
     apart from the Escape listener matters: that one depends on `onClose`,
     which the parent recreates on every render, and re-running a focus call at
     that rate fights whatever the operator is doing.
  */
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    bodyRef.current?.scrollTo({ top: 0 });
  }, [open, topic]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const focused = topic !== null ? GUIDE[topic] : null;

  return (
    <div
      className="sheet__scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={focused ? focused.title : 'Guide and settings'}>
        <div className="sheet__head">
          {focused ? (
            <span style={{ fontWeight: 600, fontSize: 15 }}>{focused.title}</span>
          ) : (
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
          )}
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

        <div className="sheet__body prose" ref={bodyRef}>
          {focused ? (
            <>
              <p className="sheet__lede">{focused.lede}</p>
              {focused.body}
              <button
                className="secondary"
                style={{ marginTop: 8, fontSize: 13 }}
                onClick={onShowFullGuide}
              >
                Full guide
              </button>
            </>
          ) : tab === 'settings' ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Branding</div>
                <label className="setting-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showLogo}
                    onChange={(e) => onChange({ ...settings, showLogo: e.target.checked })}
                  />
                  <span>Show the MAC mark</span>
                </label>
              </div>
              <p className="dim">
                Hides the logo in the app, on the certificate and on a saved
                reading. The open-source notice in the footer stays either way —
                that one is a licence condition, not branding.
              </p>

              <Choice
                label="Trace magnification"
                options={ZOOM_CHOICES}
                value={settings.zoomMs}
                format={(v) => (v === ZOOM_AUTO ? 'Auto' : `${v} ms`)}
                onSelect={(zoomMs) => onChange({ ...settings, zoomMs })}
              />
              <p className="dim">
                How much drift spans the width of the trace. A smaller number
                magnifies more, so a small rate error leans further.
                <strong> Auto</strong> keeps the lean as steep as it can while
                the line still fits on the strip, and is usually what you want.
                Lines running off one edge and reappearing on the other means
                the magnification is tighter than the watch's error needs.
              </p>

              <Choice
                label="Trace history"
                options={HISTORY_STEPS}
                value={settings.traceSeconds}
                format={(v) => `${v} s`}
                onSelect={(traceSeconds) => onChange({ ...settings, traceSeconds })}
              />
              <p className="dim">
                How far back the trace remembers. Longer shows the trend more
                clearly; shorter reacts faster when you move the regulator.
              </p>
            </>
          ) : (
            <>
              <p className="sheet__lede">
                Hold the watch firmly against the sensor and press Start. Give it
                twenty to thirty seconds — readings wander at first and then
                settle. Tap any panel for a note on what it is showing.
              </p>

              {GUIDE_ORDER.map((t) => (
                <section key={t} style={{ marginBottom: 22 }}>
                  <h3>{GUIDE[t].title}</h3>
                  <p className="sheet__lede" style={{ marginTop: 0 }}>{GUIDE[t].lede}</p>
                  {GUIDE[t].body}
                </section>
              ))}

              <h3>Getting a reading you can trust</h3>
              <ul>
                <li>Wind the watch fully and let it settle for ten minutes first.</li>
                <li>Keep firm, steady contact with the sensor.</li>
                <li>Work somewhere quiet; the sensor hears the room too.</li>
                <li>Wait for Settled before recording the number.</li>
                <li>
                  Measure in several positions — dial up, dial down, crown down. A
                  watch that is perfect flat and poor on its side has a different
                  problem from one that is simply fast.
                </li>
              </ul>
            </>
          )}

          {/* Every route into the sheet ends here, so the source offer is
              reachable from the measuring screen in one tap. */}
          <div className="sheet__source">
            <SourceFooter />
          </div>
        </div>
      </div>
    </div>
  );
}
