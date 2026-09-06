/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { STEPS, GROUP_LABEL, badgeFor, summarise, verdictOf, type StepGroup } from '../timegrapher/device-check';
import type { DeviceCheckReport } from '../audio/device-check-run';

/*
   The device check, as a file somebody can send on.

   Written for the person reading it rather than for a parser: the conclusion
   first, then the checks in the order they ran, then the raw material
   underneath. Somebody diagnosing a phone they cannot hold needs to know what
   failed before they need to know what the browser reported about the track.

   It carries the device name and the user agent, so it leaves only when it is
   asked for and nothing here uploads it.
*/

const HEADING = 'MAC Bespoke Timegrapher — device check';

function line(label: string, value: unknown): string {
  return `${label.padEnd(22)}${value === null || value === undefined ? '—' : String(value)}`;
}

function db(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)} dBFS`;
}

export function deviceReportText(report: DeviceCheckReport): string {
  const out: string[] = [];
  const results = new Map(report.results.map((r) => [r.id, r]));

  out.push(HEADING, '='.repeat(HEADING.length), '');
  out.push(summarise(report.results));
  out.push('');

  out.push(line('Started', report.startedAt));
  out.push(line('Finished', report.finishedAt));
  out.push(line('Input asked for', report.requestedDeviceId));
  out.push(line('Input opened', report.deviceLabel));
  out.push(line('Capture profile', report.profile));
  out.push(line('Sample rate', report.sampleRate === null ? null : `${report.sampleRate} Hz`));
  out.push(line('Device reports', report.requestedSampleRate === null ? null : `${report.requestedSampleRate} Hz`));
  out.push(line('Clock correction', `${report.clockDriftSecondsPerDay.toFixed(2)} s/day`));
  out.push(line('Movement checks', report.includeMovement ? 'included' : 'not included'));
  if (report.includeMovement) {
    out.push(line('Movement', report.movement.name ?? 'not chosen'));
    out.push(line('Lift angle', `${report.movement.liftAngle}°`));
  }
  out.push('');

  let group: StepGroup | null = null;
  for (const spec of STEPS) {
    const r = results.get(spec.id);
    if (!r) continue;
    if (spec.group !== group) {
      group = spec.group;
      out.push(`${GROUP_LABEL[group]}  [${verdictOf(report.results.filter(
        (x) => STEPS.find((s) => s.id === x.id)?.group === group,
      )).toUpperCase()}]`);
    }
    out.push(`  ${badgeFor(r.state).padEnd(10)} ${spec.label.padEnd(24)} ${r.detail}`);
  }
  out.push('');

  out.push('SPECTRUM');
  out.push(`  ${line('0.5–2 kHz', db(report.voiceBandDb))}`);
  out.push(`  ${line('4–8 kHz', db(report.tickBandDb))}`);
  out.push('');

  if (report.clock) {
    const c = report.clock;
    out.push('AUDIO CLOCK');
    out.push(`  ${line('Elapsed', `${c.elapsedSeconds.toFixed(1)} s`)}`);
    out.push(`  ${line('Steps / points', `${c.steps} / ${c.points}`)}`);
    out.push(`  ${line('Rejected', `gap ${c.rejectedGap}, ratio ${c.rejectedRatio}, backwards ${c.rejectedBackwards}`)}`);
    out.push(`  ${line('Frames vs wall', c.framesDriftSecondsPerDay === null ? null : `${c.framesDriftSecondsPerDay.toFixed(1)} s/day`)}`);
    out.push(`  ${line('currentTime vs wall', c.fittedDriftSecondsPerDay === null ? null : `${c.fittedDriftSecondsPerDay.toFixed(1)} s/day`)}`);
    out.push('');
  }

  /*
     Verbatim, and last. The interesting keys here are the ones nobody thought
     to ask about — a phone that quietly picked a different audio source, or a
     device that cannot turn gain control off at all.
  */
  out.push('TRACK SETTINGS AS REPORTED');
  out.push(`  ${JSON.stringify(report.grantedSettings ?? {}, null, 2).split('\n').join('\n  ')}`);
  out.push('');
  out.push('TRACK CAPABILITIES AS REPORTED');
  out.push(`  ${JSON.stringify(report.capabilities ?? {}, null, 2).split('\n').join('\n  ')}`);
  out.push('');
  out.push(line('User agent', report.userAgent));

  return `${out.join('\n')}\n`;
}

export function deviceReportFilename(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `timegrapher-device-check-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.txt`;
}
