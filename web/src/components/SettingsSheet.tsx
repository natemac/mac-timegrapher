/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GUIDE, GUIDE_ORDER, type Topic } from './guide-content';
import { Sheet } from './Sheet';
import { InfoSheet } from './InfoSheet';
import { ZOOM_STEPS, ZOOM_AUTO } from '../timegrapher/trace-zoom';
import { SourceFooter } from './SourceFooter';
import { MOVEMENTS } from '../timegrapher/movements';
import { SETTLED_BOUNDS, type BestSpread } from '../timegrapher/stability';
import type { Calibration } from '../timegrapher/tg-engine';
import { MIN_SECONDS, type ClockResult } from '../audio/clock-calibration';

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
  /*
     What the audio device's clock gains per day, measured against the system
     clock. Zero until measured. Every rate reading is wrong by this much while
     it is left at zero — a constant offset, invisible to the spread.
  */
  clockDriftSecondsPerDay: number;
}

/* Auto by default: the operator should not have to work out that +17 s/day
   over thirty seconds needs more than ten milliseconds of strip. */
export const DEFAULT_SETTINGS: Settings = {
  zoomMs: ZOOM_AUTO,
  traceSeconds: 30,
  showLogo: false,
  clockDriftSecondsPerDay: 0,
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
  onExportDiagnostics: () => void;
  /** How much the log has to say. Zero means nothing has been measured yet. */
  diagnosticSamples: number;
  /** The clock measurement, once there is enough of a run for one. */
  clock: ClockResult | null;
  /** How far into that run it is, so the wait is visible. */
  clockSeconds: number;
  /** A quartz clock check in progress, or its result. Null when none is running. */
  clockCheck: Calibration | null;
  onStartClockCheck: () => void;
  onStopClockCheck: () => void;
}

type Tab = 'guide' | 'settings';

/*
   One setting: its name, a ? that opens its explanation, and the control.

   The prose used to sit under every control, which made a page of five
   settings read as five paragraphs with switches buried in them. The words are
   unchanged and still come from guide-content — the single source — but they
   are now asked for rather than imposed.
*/
/*
   The quartz clock check.

   Fifteen minutes is a long time to look at nothing, so every state says what
   is happening: whether the tick is being heard at all, how far through it is,
   and roughly how long is left. Without the lock indicator a run that never
   heard the watch looks identical to one that is simply not finished yet.

   Nothing is applied on its own. The number lands in the correction field only
   when it is pressed, because this measurement carries the reference watch's
   own error and that is the operator's call to accept.
*/
export function ClockCheck({
  check, onStart, onStop, onUse,
}: {
  check: Calibration | null;
  onStart: () => void;
  onStop: () => void;
  onUse: (value: number) => void;
}) {
  if (!check) {
    return (
      <button
        className="secondary settings__clock-check"
        onClick={onStart}
        style={{ width: '100%', fontSize: 13 }}
      >
        Check against a quartz watch
      </button>
    );
  }

  if (check.state === 1) {
    return (
      <div className="settings__clock-check">
        <p className="dim settings__clock-measured">
          Against the reference, this device measures{' '}
          <strong className="mono">{formatDrift(check.driftSecondsPerDay)} s/day</strong>.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="secondary"
            style={{ flex: '1 1 auto', fontSize: 13 }}
            onClick={() => onUse(check.driftSecondsPerDay)}
          >
            Use it
          </button>
          <button className="secondary" style={{ flex: '0 0 auto', fontSize: 13 }} onClick={onStop}>
            Discard
          </button>
        </div>
      </div>
    );
  }

  if (check.state === -1) {
    return (
      <div className="settings__clock-check">
        <p className="dim settings__clock-measured">
          Finished, but the fit was too scattered to trust. Hold the watch firmly
          against the sensor, somewhere quiet, and run it again.
        </p>
        <button className="secondary" style={{ width: '100%', fontSize: 13 }} onClick={onStop}>
          Close
        </button>
      </div>
    );
  }

  /* Still collecting. One sample a second, so what is left in samples is also
     what is left in seconds. */
  const remaining = Math.max(0, check.needed - check.collected);
  const heard = check.signal >= LOCKED_SIGNAL;

  return (
    <div className="settings__clock-check">
      <p className="dim settings__clock-measured">
        {heard
          ? `Heard it — ${check.collected} of ${check.needed} ticks, about ${Math.ceil(remaining / 60)} min left.`
          : 'Listening for a once-a-second tick. Put the quartz watch on the sensor and leave it still.'}
      </p>
      <button className="secondary" style={{ width: '100%', fontSize: 13 }} onClick={onStop}>
        Stop
      </button>
    </div>
  );
}

function Setting({
  label, topic, onInfo, children,
}: {
  label: string;
  topic: Topic;
  onInfo: (t: Topic) => void;
  children: ReactNode;
}) {
  return (
    <section className="setting">
      <button className="setting__head" onClick={() => onInfo(topic)}>
        <span className="eyebrow">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.6-2.8 2.6" strokeLinecap="round" />
          <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
        </svg>
        <span className="visually-hidden">— what is this?</span>
      </button>
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

/*
   A sound card's crystal is tens to a few hundred parts per million out. Two
   hundred seconds a day is 2,300 ppm — far beyond anything real, and past it a
   typed figure is a slipped decimal point rather than a measurement. Clamped
   because this one number silently rescales every reading taken afterwards.
*/
const MAX_DRIFT = 200;

/* NSTEPS in the core: every analysis window converged on the one-second tick.
   Anything less means it is not hearing the reference cleanly. */
const LOCKED_SIGNAL = 4;

function clampDrift(value: number): number {
  return Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, value));
}

/*
   Always signed, including zero — tg writes "+0.0" in the same field, and in a
   box you can type a negative number into, a bare "0.00" reads like a value
   that has not been set rather than one deliberately at zero.
*/
export function formatDrift(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

/*
   Reads what someone might actually type: "1.7", "+1.7", "-0.25", and tg's own
   display format straight off its toolbar. Returns null for anything it cannot
   make a number of, which the caller treats as "leave it alone" rather than as
   zero — zero is a real correction, and losing one without saying so would
   shift every later reading.
*/
export function parseDrift(text: string): number | null {
  const parsed = Number.parseFloat(text.replace(/[\s,]/g, '').replace(/s\/?d(ay)?$/i, ''));
  return Number.isFinite(parsed) ? clampDrift(parsed) : null;
}

export function SettingsSheet({
  open, topic, onClose, onShowFullGuide, settings, onChange,
  movementId, onSelectMovement, best, onExportDiagnostics, diagnosticSamples,
  clock, clockSeconds, clockCheck, onStartClockCheck, onStopClockCheck,
}: Props) {
  /* Settings first. The guide is read once; the settings are the reason the
     cog gets pressed again. */
  const [tab, setTab] = useState<Tab>('settings');
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<Topic | null>(null);

  /*
     The correction as typed, held apart from the setting itself: parsing on
     every keystroke would reject a half-written "-" or "1." and write the
     wrong number back. Committed on blur or Enter.
  */
  const [clockDraft, setClockDraft] = useState(() => formatDrift(settings.clockDriftSecondsPerDay));

  /* The one place the correction changes, so the field and the setting cannot
     disagree — the Apply and Clear buttons come through here too. */
  const applyDrift = (value: number) => {
    setClockDraft(formatDrift(value));
    onChange({ ...settings, clockDriftSecondsPerDay: value });
  };

  const commitClockDraft = () => {
    const parsed = parseDrift(clockDraft);
    if (parsed === null) {
      setClockDraft(formatDrift(settings.clockDriftSecondsPerDay));
      return;
    }
    applyDrift(parsed);
  };

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
    setInfo(null);
  }, [open, topic]);

  /*
     The correction can change while the sheet is shut — Apply on a fresh
     measurement, or a value restored from storage — so the field is resynced
     on open rather than only at first mount. Keyed on the number itself, not
     on `settings`, so an unrelated preference cannot reach in and overwrite
     what is being typed.
  */
  useEffect(() => {
    if (!open) return;
    setClockDraft(formatDrift(settings.clockDriftSecondsPerDay));
  }, [open, settings.clockDriftSecondsPerDay]);

  if (!open) return null;

  const focused = topic !== null ? GUIDE[topic] : null;

  return (
    <>
    <Sheet open={open} onClose={onClose} label={focused ? focused.title : 'Guide and settings'}>
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

        <div className="sheet__body prose" ref={bodyRef} data-sheet-scroll>
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
              <Setting onInfo={setInfo} label="Movement" topic="setting-movement">
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

              <Setting onInfo={setInfo} label="Trace magnification" topic="setting-magnification">
                <Choice
                  options={ZOOM_CHOICES}
                  value={settings.zoomMs}
                  format={(v) => (v === ZOOM_AUTO ? 'Auto' : `${v} ms`)}
                  onSelect={(zoomMs) => onChange({ ...settings, zoomMs })}
                />
              </Setting>

              <Setting onInfo={setInfo} label="Trace history" topic="setting-history">
                <Choice
                  options={HISTORY_STEPS}
                  value={settings.traceSeconds}
                  format={(v) => `${v} s`}
                  onSelect={(traceSeconds) => onChange({ ...settings, traceSeconds })}
                />
              </Setting>

              <Setting onInfo={setInfo} label="Branding" topic="setting-branding">
                <label className="setting-toggle">
                  <input
                    type="checkbox"
                    checked={settings.showLogo}
                    onChange={(e) => onChange({ ...settings, showLogo: e.target.checked })}
                  />
                  <span>Show the MAC mark</span>
                </label>
              </Setting>

              <Setting onInfo={setInfo} label="Session diagnostics" topic="setting-diagnostics">
                <button
                  className="secondary"
                  onClick={onExportDiagnostics}
                  disabled={diagnosticSamples === 0}
                  style={{ width: '100%', fontSize: 13 }}
                >
                  {diagnosticSamples === 0
                    ? 'Nothing measured yet'
                    : `Export log — ${diagnosticSamples} readings`}
                </button>
              </Setting>

              {/*
                The one correction that changes what a reading *is* rather than
                how it is judged. A sound card reporting 44,100 Hz is ten to a
                hundred parts per million out, and every part per million is
                0.0864 s/day — invisible everywhere else, because a constant
                scale error is perfectly repeatable.
              */}
              <Setting onInfo={setInfo} label="Audio clock" topic="setting-clock">
                {/* Typeable rather than a read-out, so a figure measured
                    elsewhere can be entered without measuring it again here.
                    tg's `cal` is the same quantity in the same units with the
                    same sign — its number can be typed straight in. */}
                <label className="settings__clock-manual">
                  <span className="dim">Correction</span>
                  <input
                    className="field settings__clock-field mono"
                    inputMode="text"
                    value={clockDraft}
                    onChange={(e) => setClockDraft(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={commitClockDraft}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    aria-label="Audio clock correction, seconds per day"
                  />
                  <span className="dim">s/day</span>
                </label>

                {clock ? (
                  <>
                    <p className="dim settings__clock-measured">
                      This device measures{' '}
                      <strong className="mono">
                        {clock.driftSecondsPerDay > 0 ? '+' : ''}
                        {clock.driftSecondsPerDay.toFixed(2)} ± {clock.errorSecondsPerDay.toFixed(2)} s/day
                      </strong>{' '}
                      over {clock.seconds.toFixed(0)}s.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="secondary"
                        style={{ flex: '1 1 auto', fontSize: 13 }}
                        onClick={() => applyDrift(clock.driftSecondsPerDay)}
                      >
                        Apply
                      </button>
                      {settings.clockDriftSecondsPerDay !== 0 && (
                        <button
                          className="secondary"
                          style={{ flex: '0 0 auto', fontSize: 13 }}
                          onClick={() => applyDrift(0)}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="dim settings__clock-measured">
                    {clockSeconds > 0
                      ? `Measuring — ${clockSeconds.toFixed(0)}s of ${MIN_SECONDS}s so far. It needs one uninterrupted run.`
                      : `Measure it by leaving a capture running for ${MIN_SECONDS} seconds or more, in one go.`}
                  </p>
                )}

                {/*
                   A second, independent way to get the same number: upstream's
                   Calibrate, driven by a quartz watch on the sensor. It is a
                   check rather than a replacement — it measures the difference
                   between the card and the watch and blames all of it on the
                   card, so it is only ever as good as the reference.
                */}
                <ClockCheck
                  check={clockCheck}
                  onStart={onStartClockCheck}
                  onStop={onStopClockCheck}
                  onUse={(v) => { applyDrift(v); onStopClockCheck(); }}
                />
              </Setting>

              {/* A readout rather than a setting, but it is what the Settled
                  threshold has to be chosen against, so it belongs here. */}
              <Setting onInfo={setInfo} label="Steadiness of this bench" topic="setting-steadiness">
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
    </Sheet>

    {/* Above the settings, so answering a question leaves the list where it
        was rather than pushing it about underneath the finger that asked. */}
    <InfoSheet topic={info} onClose={() => setInfo(null)} />
    </>
  );
}
