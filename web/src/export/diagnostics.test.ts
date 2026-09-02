/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  DiagnosticsLog, diagnosticsFilename, launchedAs,
  type DiagnosticContext, type DiagnosticSample,
} from './diagnostics';

const CONTEXT: DiagnosticContext = {
  device: 'USB PnP Sound Device',
  sampleRate: 44100,
  requestedSampleRate: 44100,
  processing: [],
  movement: 'Seiko / TMI NH35',
  liftAngle: 53,
  bph: 21600,
  quartz: false,
  mode: 'inspection',
  settledBounds: { rate: 1, amplitude: 15, beatError: 1.5 },
  clockDriftSecondsPerDay: 0,
};

function sample(over: Partial<DiagnosticSample> = {}): DiagnosticSample {
  return {
    t: 10,
    valid: true,
    rate: 14.5,
    amplitude: 232,
    beatError: 1.0,
    detectedBph: 21600,
    signalQuality: 0.9,
    settling: 'settled',
    rateSpread: 0.4,
    amplitudeSpread: 10,
    beatErrorSpread: 0.85,
    headroomDb: 29,
    levelDb: -18,
    floorDb: -47,
    clipped: false,
    ...over,
  };
}

describe('the report', () => {
  it('names the setup a run happened under', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    const text = log.toText();

    expect(text).toContain('USB PnP Sound Device');
    expect(text).toContain('44100 Hz');
    expect(text).toContain('Seiko / TMI NH35');
    expect(text).toContain('53°');
  });

  /* Automatic gain control does not degrade amplitude, it invalidates it, so
     the report has to say plainly whether any was applied. */
  it('reports the audio processing the browser admitted to', () => {
    const log = new DiagnosticsLog();
    log.setContext({ ...CONTEXT, processing: ['autoGainControl: applied'] });
    expect(log.toText()).toContain('autoGainControl: applied');

    const clean = new DiagnosticsLog();
    clean.setContext(CONTEXT);
    expect(clean.toText()).toContain('none reported');
  });

  it('flags a browser that resampled the input', () => {
    const log = new DiagnosticsLog();
    log.setContext({ ...CONTEXT, sampleRate: 48000, requestedSampleRate: 44100 });
    expect(log.toText()).toContain('the browser resampled');
  });

  it('says a quartz movement has no lift angle rather than printing one', () => {
    const log = new DiagnosticsLog();
    log.setContext({ ...CONTEXT, quartz: true, liftAngle: null });
    expect(log.toText()).toContain('n/a — quartz');
  });

  /*
     The whole point. A bound set below what the bench can hold means nothing
     ever settles, and the summary has to make that visible without reading
     two thousand rows.
  */
  it('summarises the spreads against the bounds they had to beat', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    log.sample(sample({ beatErrorSpread: 0.82 }));
    log.sample(sample({ beatErrorSpread: 0.89 }));

    const text = log.toText();
    expect(text).toContain('beat spread');
    expect(text).toMatch(/min 0\.82\s+max 0\.89/);
    expect(text).toContain('beat ±1.5');
  });

  it('calls out a run that never settled', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    log.sample(sample({ settling: 'moving' }));
    expect(log.toText()).toContain('never settled');
  });

  it('does not call out a run that did settle', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    log.sample(sample({ settling: 'settled' }));
    expect(log.toText()).not.toContain('never settled');
  });

  /* An invalid sample carries whatever the core last had, not a measurement,
     so averaging it in would misreport what the bench managed. */
  it('leaves invalid samples out of the statistics', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    log.sample(sample({ valid: true, rate: 10 }));
    log.sample(sample({ valid: false, rate: 9999 }));
    expect(log.toText()).toMatch(/rate\s+min 10\.00\s+max 10\.00/);
  });

  it('says so when nothing valid was measured', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    log.sample(sample({ valid: false }));
    expect(log.toText()).toContain('no valid samples');
  });

  it('writes a timeline of what the app did', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    log.event('start', '44100 Hz');
    log.event('recorded', 'dial-up (as-found)');

    const text = log.toText();
    expect(text).toContain('start');
    expect(text).toContain('recorded  dial-up (as-found)');
  });

  it('writes one row per sample under a header', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    log.sample(sample());
    log.sample(sample({ t: 10.5 }));

    const rows = log.toText().split('\n');
    const header = rows.findIndex((r) => r.startsWith('t\tvalid'));
    expect(header).toBeGreaterThan(0);
    expect(rows.slice(header + 1).filter((r) => r.trim()).length).toBe(2);
  });
});

describe('bounds', () => {
  /* A long session must not grow without limit, and the interesting part is
     almost always what just happened. */
  it('drops the oldest samples rather than the newest', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    for (let i = 0; i < 3000; i++) log.sample(sample({ t: i }));

    expect(log.size).toBeLessThanOrEqual(2600);
    const text = log.toText();
    expect(text).toContain('2999.0');
    expect(text).not.toContain('\n0.0\t');
  });

  it('starts empty and clears on reset', () => {
    const log = new DiagnosticsLog();
    log.sample(sample());
    expect(log.size).toBe(1);
    log.reset();
    expect(log.size).toBe(0);
  });
});

describe('diagnosticsFilename', () => {
  it('is a sortable text file', () => {
    expect(diagnosticsFilename(new Date(2026, 7, 30, 17, 53, 4)))
      .toBe('timegrapher-diagnostics-20260830-175304.txt');
  });
});

describe('what the file admits to holding', () => {
  /*
     Someone asked to share a log should be able to see what is in it without
     reading two thousand rows, and the person deciding is often not the person
     who exported it.
  */
  it('says what it contains, at the top', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    const head = log.toText().split('## Setup')[0];
    expect(head).toContain('audio device name');
    expect(head).toContain('browser version');
    expect(head).toContain('does not contain the build');
  });

  /* And the claim has to be true. */
  it('carries no build number, technician or notes', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    log.event('recorded', 'dial-up (pre)  rate 12.4  amp 248  beat 1.30');
    log.sample(sample());

    const text = log.toText();
    for (const secret of ['MB-0142', 'N. McGraw', 'customer', 'serial']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('the clock correction', () => {
  /* Every rate in the file is scaled by it, so two logs are only comparable
     once both are known. */
  it('says plainly when a run was uncorrected', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    expect(log.toText()).toContain('rate is uncorrected');
  });

  it('names the correction when there was one', () => {
    const log = new DiagnosticsLog();
    log.setContext({ ...CONTEXT, clockDriftSecondsPerDay: -4.32 });
    expect(log.toText()).toContain('-4.32 s/day');
  });
});

describe('how the app was launched', () => {
  const never = () => ({ matches: false });
  const only = (mode: string) => (q: string) => ({ matches: q === `(display-mode: ${mode})` });

  /*
     The user agent is identical from a home-screen launch and a browser tab,
     so without this a report of "the update did not arrive" cannot be told
     apart from a service-worker cache that has not cycled yet.
  */
  it('reports a home-screen launch on iOS, where the media query is not the signal', () => {
    expect(launchedAs(true, never)).toBe('installed app (home screen)');
  });

  it('falls back to the standard media query elsewhere', () => {
    expect(launchedAs(false, only('standalone'))).toBe('installed app (standalone)');
    expect(launchedAs(undefined, only('fullscreen'))).toBe('installed app (fullscreen)');
    expect(launchedAs(undefined, only('minimal-ui'))).toBe('installed app (minimal-ui)');
  });

  it('reports a browser tab when neither signal is set', () => {
    expect(launchedAs(false, never)).toBe('browser tab');
    expect(launchedAs(undefined, never)).toBe('browser tab');
  });

  /* A browser too old to report either is a browser tab, so the absence of
     both signals is not an error worth surfacing in the log. */
  it('says browser tab rather than failing when nothing can be asked', () => {
    expect(launchedAs(undefined, undefined)).toBe('browser tab');
  });

  it('puts the answer in the exported log', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    expect(log.toText()).toMatch(/launched as {2,}(installed app.*|browser tab)/);
  });
});

describe('telling a quiet input from a noisy one', () => {
  /*
     From a Pixel 9 Pro report: audio arrived, tapping the pickup was audible,
     but the escapement never locked and the signal read "really weak". The
     same phone and the same USB pickup worked in another app.

     headroomDb alone cannot answer that, because it is a difference: a tiny
     tick over a tiny floor and a loud tick under a loud floor produce the same
     number. Level and floor separately say which — and that decides whether
     more gain would help at all.
  */
  it('reports level and floor separately, not only their difference', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    // A quiet but clean input: 8 dB of headroom, both values far down.
    log.sample(sample({ levelDb: -52, floorDb: -60, headroomDb: 8 }));
    const text = log.toText();
    expect(text).toMatch(/level dBFS/);
    expect(text).toMatch(/noise floor dBFS/);
    expect(text).toMatch(/-52/);
    expect(text).toMatch(/-60/);
  });

  /*
     The keys nobody predicted are the point. A platform that quietly chose a
     different audio source, or cannot honour a constraint at all, shows up
     here and nowhere else.
  */
  it('dumps what the browser granted and what the device can do', () => {
    const log = new DiagnosticsLog();
    log.setContext({
      ...CONTEXT,
      trackSettings: { autoGainControl: false, sampleRate: 48000, channelCount: 1 },
      trackCapabilities: { autoGainControl: [true, false], channelCount: { max: 2, min: 1 } },
    });
    const text = log.toText();
    expect(text).toMatch(/## Audio track, as granted/);
    expect(text).toMatch(/autoGainControl\s+false/);
    expect(text).toMatch(/## Audio track, what the device can do/);
    expect(text).toMatch(/\[true,false\]/);
  });

  it('says so plainly when the browser reported nothing', () => {
    const log = new DiagnosticsLog();
    log.setContext(CONTEXT);
    expect(log.toText()).toMatch(/the browser reported none/);
  });
});

/*
   The regression that matters most for a support report: a device delivering
   an input too weak to lock onto produces no valid samples at all. Filtering
   the signal figures by validity blanked them out in exactly that case.
*/
it('still reports the signal when nothing ever locked', () => {
  const log = new DiagnosticsLog();
  log.setContext(CONTEXT);
  log.sample(sample({ valid: false, levelDb: -54, floorDb: -58, headroomDb: 4 }));
  log.sample(sample({ valid: false, levelDb: -50, floorDb: -57, headroomDb: 7 }));
  const text = log.toText();
  expect(text).toMatch(/level dBFS\s+min -54\.00/);
  expect(text).toMatch(/noise floor dBFS\s+min -58\.00/);
  // The readings themselves are still withheld, because there were none.
  expect(text).toMatch(/rate\s+no valid samples/);
});
