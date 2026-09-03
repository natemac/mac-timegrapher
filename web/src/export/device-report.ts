/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { DeviceTestReport, LockResult, VariantResult } from '../audio/device-test';

/*
   The device test as a file, with its own conclusion at the top.

   A log of numbers still needs somebody who knows what they mean. The point of
   running every configuration in one press is that the answer is then
   available without that, so the report says what it found before it shows the
   working.
*/

const db = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} dB` : 'silent');

/*
   What the numbers add up to.

   Ordered by how badly each finding invalidates the ones below it: a
   band-limited input cannot be fixed by gain, and a stream that never arrives
   cannot be judged for bandwidth.
*/
export function verdict(report: DeviceTestReport): string[] {
  const out: string[] = [];
  const ours = report.variants.find((v) => v.id === 'ours');
  const voice = report.variants.find((v) => v.id === 'voice');
  const locked = report.locks.filter((l) => l.validReadings > 0);

  if (ours?.error) {
    out.push(`The app's own configuration could not open this input: ${ours.error}`);
    return out;
  }

  if (report.variants.every((v) => !Number.isFinite(v.rmsDb))) {
    out.push('Every configuration recorded silence. The microphone is delivering nothing at all —');
    out.push('check that the right input is selected and that something is making a sound.');
    return out;
  }

  if (ours?.bandLimited) {
    out.push('This input is band-limited: it carries almost nothing above 4 kHz.');
    out.push('That is a voice channel — a Bluetooth headset, or a headset microphone routed');
    out.push('through one. An escapement lives above that range, so no amount of gain will');
    out.push('make it measurable. Disconnect Bluetooth and select the built-in microphone or');
    out.push('the USB pickup, then run this again.');
    return out;
  }

  if (locked.length > 0) {
    const best = locked.reduce((a, b) => (b.validReadings > a.validReadings ? b : a));
    out.push(`The analysis locked onto a beat under "${best.label}" —`);
    out.push(`${best.validReadings} valid readings of ${best.samples}, detected ${best.detectedBph} bph.`);
    out.push('This device can measure. If a real session still fails, the difference is the');
    out.push('watch, the contact, or the room rather than the phone.');
    return out;
  }

  out.push('No configuration produced a single valid reading.');
  if (ours && voice && Number.isFinite(ours.rmsDb) && Number.isFinite(voice.rmsDb)) {
    const gain = voice.rmsDb - ours.rmsDb;
    if (gain > 12) {
      out.push(`Voice processing is ${gain.toFixed(0)} dB louder than the configuration the app`);
      out.push('asks for, which is a large enough gap to be the whole problem on this device.');
    } else {
      out.push(`Voice processing is only ${gain.toFixed(0)} dB louder, so gain is unlikely to be`);
      out.push('what is missing here.');
    }
  }
  out.push('If a watch was against the sensor throughout, this is the case to send on.');
  return out;
}

function variantBlock(v: VariantResult): string[] {
  const lines: string[] = [];
  lines.push(`### ${v.label}`);
  if (v.error) {
    lines.push(`could not open: ${v.error}`);
    lines.push('');
    return lines;
  }
  lines.push(`level                 rms ${db(v.rmsDb)}   peak ${db(v.peakDb)}`);
  lines.push(`context rate          ${v.contextSampleRate ?? '?'} Hz`);
  if (v.granted) {
    for (const key of Object.keys(v.granted).sort()) {
      lines.push(`  ${key.padEnd(20)}${JSON.stringify(v.granted[key])}`);
    }
  }
  lines.push('spectrum');
  for (const b of v.bands) lines.push(`  ${b.label.padEnd(20)}${db(b.db)}`);
  if (v.bandLimited) lines.push('  ^ band-limited: nothing above 4 kHz, this is a voice channel');
  lines.push('');
  return lines;
}

function lockBlock(l: LockResult): string[] {
  const lines: string[] = [];
  lines.push(`### ${l.label} — ${l.seconds}s of analysis`);
  if (l.error) lines.push(`error                 ${l.error}`);
  lines.push(`valid readings        ${l.validReadings} of ${l.samples}${
    l.validReadings === 0 ? '  <- never locked onto a beat' : ''
  }`);
  lines.push(`best signal quality   ${l.bestQuality.toFixed(2)}`);
  if (Number.isFinite(l.headroomDb ?? NaN)) {
    lines.push(`headroom              ${db(l.headroomDb!)}`);
  }
  if (l.validReadings > 0) {
    lines.push(`detected              ${l.detectedBph} bph`);
    lines.push(`rate                  ${l.rate?.toFixed(1)} s/day`);
    lines.push(`amplitude             ${l.amplitude?.toFixed(0)}°`);
    lines.push(`beat error            ${l.beatError?.toFixed(2)} ms`);
  }
  lines.push('');
  return lines;
}

export function deviceReportText(report: DeviceTestReport): string {
  const lines: string[] = [];
  lines.push('MAC Bespoke Web Timegrapher — device test');
  lines.push(report.startedAt);
  lines.push('');
  lines.push('Contains: the audio inputs this device offers, what each processing');
  lines.push('configuration was actually granted, the level and spectrum of each,');
  lines.push('and whether the analysis locked onto a beat. No audio, no notes.');
  lines.push('');

  lines.push('## What this found');
  for (const line of verdict(report)) lines.push(line);
  lines.push('');

  lines.push('## Setup');
  lines.push(`selected input        ${report.selected?.label ?? 'none'}`);
  lines.push(`movement              ${report.movement.name ?? 'not chosen'}`);
  lines.push(`beat rate             ${report.movement.bph} bph`);
  lines.push(`lift angle            ${report.movement.liftAngle}°`);
  lines.push(`user agent            ${report.userAgent}`);
  lines.push('');

  lines.push('## Every audio input this device offers');
  if (report.devices.length === 0) lines.push('(none reported)');
  for (const d of report.devices) {
    lines.push(`${d.deviceId === report.selected?.deviceId ? '* ' : '  '}${d.label}`);
    lines.push(`    id ${d.deviceId}`);
  }
  lines.push('');

  lines.push('## Each processing configuration');
  for (const v of report.variants) for (const line of variantBlock(v)) lines.push(line);

  lines.push('## Did the analysis lock onto a beat');
  for (const l of report.locks) for (const line of lockBlock(l)) lines.push(line);

  return lines.join('\n');
}

export function deviceReportFilename(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `timegrapher-device-test-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.txt`;
}
