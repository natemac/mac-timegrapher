/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GUIDE, GUIDE_ORDER, type Topic } from './guide-content';
import { ZOOM_STEPS, ZOOM_AUTO } from '../timegrapher/trace-zoom';
import { SourceFooter } from './SourceFooter';
import { MOVEMENTS } from '../timegrapher/movements';
import { SETTLED_BOUNDS, type BestSpread } from '../timegrapher/stability';

export interface Settings {
  /** Milliseconds of drift spanning the trace width. Smaller magnifies more. */
  zoomMs: number;
  /** Seconds of history the trace shows. */
  traceSeconds: number;
  /*
     Whether the MAC mark appears — in the app, on the certificate and on a
     saved reading.

     Off by default. Branding is not covered by the GPL the way the code is,
     and almost nobody running this is MAC — a stranger's logo on your own
     timing certificate is worse than no logo at all. The source link in the
     footer is a licence obligation and is not affected by this.
  */
  showLogo: boolean;
}

/* Auto by default: the operator should not have to work out that +17 s/day
   over thirty seconds needs more than ten milliseconds of strip. */
export const DEFAULT_SETTINGS: Settings = {
  zoomMs: ZOOM_AUTO,
  traceSeconds: 30,
  showLogo: false,
};

/* Magnification in the units a watchmaker already thinks in, plus Auto. */
const ZOOM_CHOICES = [ZOOM_AUTO, ...ZOOM_STEPS];
const HISTORY_STEPS = [15, 30, 60];

const STORAGE_KEY = 'mac-timegrapher.settings';

/**
 * Stored settings merged over the defaults.
 *
 * Merged rather than replaced so a preference saved before a setting existed
 * keeps working, and so turning the mark back on is done once — the stored
 * value wins over the default, which is the whole point of the default being
 * off.
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? { ...DEFAULT_SETTINGS, ...parsed }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing or a full quota. A forgotten preference is not worth
    // failing over.
  }
}

interface Props {
  open: boolean;
  /** A single section to explain, or null for the full guide and settings. */
  topic: Topic | null;
  onClose: () => void;
  onShowFullGuide: () => void;
  settings: Settings;
  onChange: (s: Settings) => void;
  movementId: string | null;
  onSelectMovement: (id: string | null) => void;
  /** The tightest spread this bench has held, for calibrating the thresholds. */
  best: BestSpread;
}

type Tab = 'guide' | 'settings';

/*
   One setting: its name, a ? that opens its explanation, and the control.

   The prose used to sit under every control, which made a page of five
   settings read as five paragraphs with switches buried in them. The words are
   unchanged and still come from guide-content — the single source — but they
   are now asked for rather than imposed.
*/
function Setting({
  label, topic, children,
}: {
  label: string;
  topic: Topic;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const entry = GUIDE[topic];

  return (
    <section className="setting">
      <button
        className="setting__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="eyebrow">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.6-2.8 2.6" strokeLinecap="round" />
          <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
        </svg>
        <span className="visually-hidden">
          {open ? '— hide the explanation' : '— what is this?'}
        </span>
      </button>

      {open && (
        <div className="setting__note">
          <p className="sheet__lede">{entry.lede}</p>
          {entry.body}
        </div>
      )}

      {children}
    </section>
  );
}

function Choice<T extends number>({
  options, value, format, onSelect,
}: {
  options: readonly T[];
  value: T;
  format: (v: T) => string;
  onSelect: (v: T) => void;
}) {
  return (
    <div>
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
  movementId, onSelectMovement, best,
}: Props) {
  /* Settings first. The guide is read once; the settings are the reason the
     cog gets pressed again. */
  const [tab, setTab] = useState<Tab>('settings');
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
              <Setting label="Movement" topic="setting-movement">
                <select
                  aria-label="Movement"
                  value={movementId ?? ''}
                  onChange={(e) => onSelectMovement(e.target.value || null)}
                  style={{ width: '100%' }}
                >
                  <option value="">Detect beat rate automatically</option>
                  {MOVEMENTS.map((m) => (
                    <option key={m.id} value={m.id}>{m.maker} {m.name}</option>
                  ))}
                </select>
              </Setting>

              <Setting label="Trace magnification" topic="setting-magnification">
                <Choice
                  options={ZOOM_CHOICES}
                  value={settings.zoomMs}
                  format={(v) => (v === ZOOM_AUTO ? 'Auto' : `${v} ms`)}
                  onSelect={(zoomMs) => onChange({ ...settings, zoomMs })}
                />
              </Setting>

              <Setting label="Trace history" topic="setting-history">
                <Choice
                  options={HISTORY_STEPS}
                  value={settings.traceSeconds}
                  format={(v) => `${v} s`}
                  onSelect={(traceSeconds) => onChange({ ...settings, traceSeconds })}
                />
              </Setting>

              <Setting label="Branding" topic="setting-branding">
                <label className="setting-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showLogo}
                    onChange={(e) => onChange({ ...settings, showLogo: e.target.checked })}
                  />
                  <span>Show the MAC mark</span>
                </label>
              </Setting>

              {/* A readout rather than a setting, but it is what the Settled
                  threshold has to be chosen against, so it belongs here. */}
              <Setting label="Steadiness of this bench" topic="setting-steadiness">
                <table className="settings__bench">
                  <tbody>
                    <tr>
                      <th>Rate</th>
                      <td>{best.rate === null ? '—' : `±${best.rate.toFixed(2)}`}</td>
                      <td className="dim">of ±{SETTLED_BOUNDS.rate.toFixed(1)} s/day</td>
                    </tr>
                    <tr>
                      <th>Amplitude</th>
                      <td>{best.amplitude === null ? '—' : `±${best.amplitude.toFixed(1)}`}</td>
                      <td className="dim">of ±{SETTLED_BOUNDS.amplitude}°</td>
                    </tr>
                    <tr>
                      <th>Beat error</th>
                      <td>{best.beatError === null ? '—' : `±${best.beatError.toFixed(3)}`}</td>
                      <td className="dim">of ±{SETTLED_BOUNDS.beatError} ms</td>
                    </tr>
                  </tbody>
                </table>
              </Setting>
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
