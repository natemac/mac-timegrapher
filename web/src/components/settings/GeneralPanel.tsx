/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState } from 'react';
import type { Settings, Appearance } from '../../settings/settings-store';
import { ZOOM_AUTO, ZOOM_STEPS } from '../../timegrapher/trace-zoom';
import {
  MANUAL_ID, movementSummary, movementsByMaker, validateManual,
  type ManualMovement,
} from '../../timegrapher/movement-choice';

/*
   Preferences, the calibre, the trace, and the diagnostics hand-off.

   Everything here is stored in this browser on this device and nothing syncs.
   Only two of these change what a reading means — the calibre, whose lift angle
   amplitude is derived from, and the clock correction, which lives with
   calibration because that is where it is measured.
*/
interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  /** null is automatic detection; MANUAL_ID is both numbers typed in. */
  movementId: string | null;
  onSelectMovement: (id: string | null) => void;
  manual: ManualMovement;
  onManualChange: (m: ManualMovement) => void;
  onExportDiagnostics: () => void;
  /** Whatever the last export said, or nothing. */
  status: string | null;
}

const HISTORY_STEPS = [15, 30, 60];

/* Long enough to swallow the keystrokes of a two- or three-digit entry, short
   enough that the summary line under the control still feels live. */
const COMMIT_DELAY_MS = 500;

const AUTO_OPTION = 'Auto';

export function GeneralPanel({
  settings, onChange, movementId, onSelectMovement, manual, onManualChange,
  onExportDiagnostics, status,
}: Props) {
  const isManual = movementId === MANUAL_ID;
  const isAuto = movementId === null;

  /*
     What is in the two boxes, held apart from the stored values: parsing on
     every keystroke would reject a half-typed "2" and write 2 bph back into the
     setting the engine is built from.
  */
  const [draft, setDraft] = useState(() => ({
    bph: String(manual.bph),
    liftAngle: String(manual.liftAngle),
  }));

  // Resynced when the stored figures change beneath the panel — a preset being
  // chosen, or a value restored from storage on a later open.
  useEffect(() => {
    setDraft({ bph: String(manual.bph), liftAngle: String(manual.liftAngle) });
  }, [manual.bph, manual.liftAngle]);

  const check = validateManual(draft, isManual);

  /*
     Committed on a short delay, not on every keystroke.

     The lift angle is a dependency of the measurement engine, which is a Worker
     with a WebAssembly module inside it. Typing "53" is two valid entries — 5,
     then 53 — so a straight-through commit tore the engine down and rebuilt it
     twice, clearing the reading each time, in the one field somebody is most
     likely to adjust while a watch is on the sensor.

     The panel still validates and re-renders as you type; only the value handed
     to the engine waits.
  */
  const pending = useRef<number | undefined>(undefined);

  const commit = (value: ManualMovement) => {
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => onManualChange(value), COMMIT_DELAY_MS);
  };

  // A half-typed entry must not be left in flight when the panel goes away.
  useEffect(() => () => window.clearTimeout(pending.current), []);

  const editManual = (next: { bph: string; liftAngle: string }) => {
    setDraft(next);
    const judged = validateManual(next, isManual);
    // Only a complete, usable pair is committed. A half-written entry leaves
    // the engine on the last good one rather than on a number nobody meant.
    if (judged.value) commit(judged.value);
  };

  /* Leaving the field is a finished entry, so it does not wait out the delay. */
  const flush = () => {
    const judged = validateManual(draft, isManual);
    if (!judged.value) return;
    window.clearTimeout(pending.current);
    onManualChange(judged.value);
  };

  const selectValue = isAuto ? AUTO_OPTION : movementId!;

  return (
    <section role="tabpanel" id="panel-general" aria-labelledby="tab-general">
      <div className="settings-group">
        <h3 className="settings-section-heading">GENERAL</h3>
        <div className="settings-group-surface">
          <div className="preferences-row">
            <div className="option-copy">
              <label htmlFor="appearance">APPEARANCE</label>
              <p>Match your device or choose a theme.</p>
            </div>
            <select
              id="appearance"
              value={settings.appearance}
              onChange={(e) => onChange({ ...settings, appearance: e.target.value as Appearance })}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>

          <div className="preferences-row">
            <div className="option-copy">
              <label htmlFor="keepAwake">KEEP SCREEN AWAKE</label>
              <p>Prevent the screen from sleeping.</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                id="keepAwake"
                aria-label="Keep Screen Awake"
                checked={settings.keepAwake}
                onChange={(e) => onChange({ ...settings, keepAwake: e.target.checked })}
              />
              <span />
            </label>
          </div>

          <div className="preferences-row">
            <div className="option-copy">
              <label htmlFor="showBrand">SHOW BRAND LOGO</label>
              <p>Display MAC branding in the header.</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                id="showBrand"
                aria-label="Show Brand Logo"
                checked={settings.showLogo}
                onChange={(e) => onChange({ ...settings, showLogo: e.target.checked })}
              />
              <span />
            </label>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-section-heading">MOVEMENT</h3>
        <div className="settings-group-surface">
          <div className="preferences-row">
            <div className="option-copy">
              <label htmlFor="movement">MOVEMENT</label>
              <p id="movementSummary" aria-live="polite">
                {movementSummary(movementId, manual)}
              </p>
            </div>
            <select
              id="movement"
              aria-describedby="movementSummary"
              value={selectValue}
              onChange={(e) => {
                const v = e.target.value;
                onSelectMovement(v === AUTO_OPTION ? null : v);
              }}
            >
              <option value={AUTO_OPTION}>Auto</option>
              <option value={MANUAL_ID}>Manual</option>
              {movementsByMaker().map((group) => (
                <optgroup key={group.maker} label={group.maker}>
                  {group.movements.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/*
             Shown for Manual and for Auto, because automatic detection finds
             the beat rate and cannot find the lift angle — nothing in the sound
             carries it, and amplitude is calculated directly from it.
          */}
          <div id="manualMovement" className="manual-movement" hidden={!(isManual || isAuto)}>
            <div id="manualBeatField" hidden={!isManual}>
              <label htmlFor="manualBeatRate">BEAT RATE <span>(bph)</span></label>
              <input
                id="manualBeatRate"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={draft.bph}
                aria-describedby="manualError"
                aria-invalid={check.badBph || undefined}
                onChange={(e) => editManual({ ...draft, bph: e.target.value })}
                onBlur={flush}
              />
            </div>
            <div>
              <label htmlFor="manualLiftAngle">LIFT ANGLE <span>(°)</span></label>
              <input
                id="manualLiftAngle"
                type="number"
                inputMode="decimal"
                min="0.1"
                max="360"
                step="any"
                value={draft.liftAngle}
                aria-describedby="manualError"
                aria-invalid={check.badLiftAngle || undefined}
                onChange={(e) => editManual({ ...draft, liftAngle: e.target.value })}
                onBlur={flush}
              />
            </div>
            <p id="manualError" role="status">{check.error ?? ''}</p>
            <p id="autoMovementNote" hidden={!isAuto}>
              Auto detects beat rate from the signal. Set the lift angle for your
              movement.
            </p>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-section-heading">TRACE</h3>
        <div className="settings-group-surface">
          <div className="preferences-row">
            <div className="option-copy">
              <label htmlFor="magnification">TRACE MAGNIFICATION</label>
              <p>Set the timing scale of the trace.</p>
            </div>
            <select
              id="magnification"
              value={settings.zoomMs}
              onChange={(e) => onChange({ ...settings, zoomMs: Number(e.target.value) })}
            >
              <option value={ZOOM_AUTO}>Auto</option>
              {ZOOM_STEPS.map((z) => (
                <option key={z} value={z}>{z}ms</option>
              ))}
            </select>
          </div>

          <div className="preferences-row">
            <div className="option-copy">
              <label htmlFor="history">TRACE HISTORY</label>
              <p>Set how much trace to keep visible.</p>
            </div>
            <select
              id="history"
              value={settings.traceSeconds}
              onChange={(e) => onChange({ ...settings, traceSeconds: Number(e.target.value) })}
            >
              {HISTORY_STEPS.map((s) => (
                <option key={s} value={s}>{s}s</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-section-heading">SESSION DIAGNOSTICS</h3>
        <div className="settings-group-surface">
          <div className="preferences-row">
            <div className="option-copy">
              <label htmlFor="exportDiagnostics">EXPORT DIAGNOSTICS</label>
              <p>Download details for troubleshooting.</p>
            </div>
            <button className="export-button" id="exportDiagnostics" onClick={onExportDiagnostics}>
              Export
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <p className="section-note" id="preferencesStatus" role="status">{status ?? ''}</p>
    </section>
  );
}
