/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef } from 'react';
import { AudioInputRow } from './AudioInputRow';
import type { AudioInput } from '../../audio/device-manager';
import {
  STEPS, GROUP_LABEL, badgeFor, summarise, estimatedSeconds,
  type StepGroup, type StepId, type StepResult,
} from '../../timegrapher/device-check';

/*
   One check, top to bottom.

   It answers a single question — is this device fit to measure a watch on — and
   it answers it by working down a list in dependency order, one row lit at a
   time. There is no second button and no partial mode: a diagnostic somebody
   has to assemble out of two runs is a diagnostic they get wrong.

   The three movement rows are the exception, and are opt-in rather than
   skipped-by-default-with-an-excuse: they need a watch on the sensor, and a
   check that failed them because there was no watch would be reporting on the
   operator rather than on the device.
*/
interface Props {
  granted: boolean;
  busy: boolean;
  devices: AudioInput[];
  selectedId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onRequestMic: () => void;
  /** A measurement is holding the input, so a check cannot take it. */
  capturing: boolean;
  running: boolean;
  /** Which row is being worked on right now. */
  activeStep: StepId | null;
  results: StepResult[];
  elapsedSeconds: number;
  includeMovement: boolean;
  onIncludeMovement: (include: boolean) => void;
  onRun: () => void;
  onCancel: () => void;
  onExport: () => void;
  canExport: boolean;
  /** Whether the last run finished, so the summary line means something. */
  finished: boolean;
  hint: string | null;
}

function Row({ spec, result, active }: {
  spec: (typeof STEPS)[number];
  result: StepResult | undefined;
  active: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /*
     Follow the check down the list. Fifteen rows do not fit a phone, and a
     check that scrolled off the top while it ran would be a progress bar with
     extra steps.
  */
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const state = result?.state ?? 'pending';
  return (
    <div
      className="device-result"
      id={`result-${spec.id}`}
      data-active={active || undefined}
      ref={ref}
    >
      <div>
        <strong>{spec.label}</strong>
        <p id={`detail-${spec.id}`}>
          {state === 'running' ? spec.doing : (result?.detail ?? 'Not checked yet')}
        </p>
      </div>
      <span className="check-badge" id={`badge-${spec.id}`} data-state={state}>
        {badgeFor(state)}
      </span>
    </div>
  );
}

function Group({ group, results, activeStep }: {
  group: StepGroup;
  results: Map<StepId, StepResult>;
  activeStep: StepId | null;
}) {
  return (
    <div className="device-check-rows">
      {STEPS.filter((s) => s.group === group).map((spec) => (
        <Row
          key={spec.id}
          spec={spec}
          result={results.get(spec.id)}
          active={activeStep === spec.id}
        />
      ))}
    </div>
  );
}

export function DeviceCheckPanel({
  granted, busy, devices, selectedId, onSelectDevice, onRequestMic,
  capturing, running, activeStep, results, elapsedSeconds,
  includeMovement, onIncludeMovement, onRun, onCancel, onExport, canExport,
  finished, hint,
}: Props) {
  const byId = new Map(results.map((r) => [r.id, r]));
  const total = estimatedSeconds(includeMovement);
  const doing = activeStep ? STEPS.find((s) => s.id === activeStep)?.doing : null;

  return (
    <section role="tabpanel" id="panel-device" aria-labelledby="tab-device">
      <AudioInputRow
        id="audioInput"
        grantId="grantAudioPermission"
        hintId="inputHint"
        granted={granted}
        busy={busy}
        devices={devices}
        selectedId={selectedId}
        onSelectDevice={onSelectDevice}
        onRequestMic={onRequestMic}
        disabled={capturing || running}
        hint={hint}
        action={(
          <button
            id="runDeviceCheck"
            className="export-button"
            /* The check drives the microphone itself, so it refuses while a
               measurement is holding it — two acquisitions of one input is a
               confounder in exactly the measurement being diagnosed. */
            disabled={!granted || capturing || devices.length === 0}
            onClick={running ? onCancel : onRun}
          >
            {running ? 'Cancel' : 'Run Check'}
          </button>
        )}
      />

      <div className="device-progress">
        <progress
          id="deviceProgress"
          max={total}
          value={running ? Math.min(elapsedSeconds, total) : (finished ? total : 0)}
          aria-label="Device check progress"
        />
        <p id="deviceProgressText" role="status" aria-live="polite">
          {running
            ? `${doing ?? 'Working'}…`
            : finished
              ? summarise(results)
              : capturing
                ? 'Stop the measurement to run a check.'
                : `Ready. About ${Math.round(total)} seconds${includeMovement ? ' with the movement checks' : ''}.`}
        </p>
      </div>

      <div className="device-check-group">
        <h3 className="settings-section-heading">{GROUP_LABEL.device}</h3>
        <Group group="device" results={byId} activeStep={activeStep} />
      </div>

      <div className="device-check-group">
        <h3 className="settings-section-heading">{GROUP_LABEL.signal}</h3>
        <Group group="signal" results={byId} activeStep={activeStep} />
      </div>

      <div className="device-check-group">
        <label className="movement-check-heading" htmlFor="includeMovementCheck">
          <input
            type="checkbox"
            id="includeMovementCheck"
            checked={includeMovement}
            disabled={running}
            onChange={(e) => onIncludeMovement(e.target.checked)}
          />
          <span>
            {GROUP_LABEL.movement}
            <small>Optional · put the movement on the sensor first</small>
          </span>
        </label>
        <div id="movementCheckRows" hidden={!includeMovement}>
          <Group group="movement" results={byId} activeStep={activeStep} />
        </div>
      </div>

      <div className="device-export-row">
        <div>
          <span>EXPORT</span>
          <p className="device-hint">Only needed to assist Developer.</p>
        </div>
        <button id="exportDeviceCheck" className="export-button" disabled={!canExport} onClick={onExport}>
          Export
        </button>
      </div>
    </section>
  );
}
