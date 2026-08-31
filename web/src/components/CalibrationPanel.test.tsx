/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalibrationPanel } from './CalibrationPanel';
import type { Calibration } from '../timegrapher/tg-engine';
import type { ClockResult, ClockDebug } from '../audio/clock-calibration';

const DEBUG: ClockDebug = {
  points: 0, steps: 0, elapsedSeconds: 0, wallSeconds: 0, audioSeconds: 0,
  fittedRatio: null, totalsRatio: null,
  fittedDriftSecondsPerDay: null, totalsDriftSecondsPerDay: null,
  rejectedGap: 0, rejectedRatio: 0, rejectedBackwards: 0,
  minStepRatio: null, maxStepRatio: null,
  frames: 0, framesSeconds: null, framesDriftSecondsPerDay: null,
};

const CHECK = (over: Partial<Calibration> = {}): Calibration => ({
  collected: 0, needed: 900, signal: 4, state: 0, driftSecondsPerDay: 0, ...over,
});

const CLOCK: ClockResult = {
  ratio: 1.0000625,
  driftSecondsPerDay: 5.4,
  errorSecondsPerDay: 0.08,
  seconds: 92,
  points: 180,
};

function panel(over: Partial<Parameters<typeof CalibrationPanel>[0]> = {}) {
  return (
    <CalibrationPanel
      granted
      onRequestMic={() => {}}
      busy={false}
      devices={[{ deviceId: 'a', label: 'USB PnP Sound Device', groupId: 'g' }]}
      selectedId="a"
      onSelectDevice={() => {}}
      sampleRate={44100}
      capturing={false}
      onStartCapture={() => {}}
      onStopCapture={() => {}}
      draft="+0.00"
      onDraftChange={() => {}}
      onDraftCommit={() => {}}
      clock={null}
      clockSeconds={0}
      clockDisturbed={false}
      clockDebug={DEBUG}
      onApplyClock={() => {}}
      onClearClock={() => {}}
      hasCorrection={false}
      check={null}
      onStartCheck={() => {}}
      onStopCheck={() => {}}
      onUseCheck={() => {}}
      onInfo={() => {}}
      {...over}
    />
  );
}

describe('the calibration tab', () => {
  /*
     The whole reason this became its own tab. Two methods measuring the same
     quantity shared one block: one counted to 60 and the other to 900 with
     nothing saying which was which, so pressing the quartz button and seeing a
     60-second count read as one thing contradicting itself.
  */
  it('presents the two methods as separate instruments', () => {
    render(panel());
    expect(screen.getByRole('heading', { name: /Against the system clock/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Against a quartz watch/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start quartz check' })).toBeInTheDocument();
  });

  /* Each says what it needs before what it does — the system-clock one wants
     nothing on the sensor at all, which is the opposite of the other and not
     guessable. */
  it('says what each one needs, including that one needs no watch', () => {
    const { container } = render(panel());
    expect(container.textContent).toMatch(/Nothing on the sensor/);
    expect(container.textContent).toMatch(/analogue quartz watch with a ticking seconds hand/);
  });

  /* Reachable before the measuring screen has ever asked, so it asks itself
     rather than leaving two buttons that look ready and do nothing. */
  it('asks for the microphone when it has not been granted', () => {
    const onRequestMic = vi.fn();
    render(panel({ granted: false, onRequestMic }));
    expect(screen.queryByRole('button', { name: 'Start quartz check' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allow microphone' }));
    expect(onRequestMic).toHaveBeenCalled();
  });

  /* A correction belongs to one audio device. Calibrating with the wrong one
     selected measures hardware you are not using. */
  it('shows which input it will listen to', () => {
    render(panel());
    expect(screen.getByLabelText('Audio input')).toHaveValue('a');
    expect(screen.getByText('44,100 Hz')).toBeInTheDocument();
  });
});

describe('the system clock method', () => {
  it('shows progress while it listens', () => {
    const { container } = render(panel({ capturing: true, clockSeconds: 24 }));
    expect(container.textContent).toMatch(/Listening — 24s of 60s/);
  });

  it('offers the figure once there is one', () => {
    const onApplyClock = vi.fn();
    render(panel({ clock: CLOCK, onApplyClock }));
    expect(screen.getByText(/\+5\.40 ± 0\.08 s\/day/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));
    expect(onApplyClock).toHaveBeenCalledWith(5.4);
  });

  /*
     An iPhone reported -98.58 s/day, which is 1,141 ppm and impossible. The
     figure is withheld, and this says the run was disturbed rather than
     asking for more time that has already elapsed.
  */
  it('reports a disturbed run rather than asking for more time', () => {
    const { container } = render(panel({ clockDisturbed: true, capturing: true, clockSeconds: 63 }));
    expect(container.textContent).toMatch(/too large for a crystal/);
    expect(container.textContent).not.toMatch(/63s of 60s/);
  });
});

describe('the quartz method', () => {
  it('says when it cannot hear the tick yet', () => {
    const { container } = render(panel({ check: CHECK({ signal: 0 }) }));
    expect(container.textContent).toMatch(/Listening for a once-a-second tick/);
  });

  it('shows progress and the time left once locked on', () => {
    const { container } = render(panel({ check: CHECK({ collected: 300 }) }));
    // 600 ticks left at one a second is ten minutes.
    expect(container.textContent).toMatch(/300 of 900 ticks, about 10 min left/);
  });

  /* state 1 is the core accepting its own fit — the least-squares uncertainty
     came in under 0.1 s/day. Anything else must not be shown as a number. */
  it('reports a figure only once the core has accepted the fit', () => {
    const { container } = render(
      panel({ check: CHECK({ collected: 900, state: 1, driftSecondsPerDay: 4.994 }) }),
    );
    expect(container.textContent).toMatch(/\+4\.99 s\/day/);
  });

  it('shows no figure at all when the fit was rejected', () => {
    render(panel({ check: CHECK({ collected: 900, state: -1 }) }));
    /* Scoped to this method's own section: the panel elsewhere carries the
       correction field and a note, both of which say "s/day" legitimately. */
    const section = screen
      .getByRole('heading', { name: /Against a quartz watch/ })
      .closest('section');
    expect(section?.textContent).toMatch(/too scattered to trust/);
    expect(section?.textContent).not.toMatch(/s\/day/);
  });

  /*
     Nothing is applied on its own. The quartz figure carries the reference
     watch's own error — a Casio spec'd at +/-20 s/month brings +/-0.66 s/day
     with it — so accepting it is the operator's call.
  */
  it('applies the figure only when it is pressed', () => {
    const onUseCheck = vi.fn();
    render(panel({ check: CHECK({ collected: 900, state: 1, driftSecondsPerDay: -8.0086 }), onUseCheck }));
    expect(onUseCheck).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));
    expect(onUseCheck).toHaveBeenCalledWith(-8.0086);
  });

  it('can be abandoned part-way', () => {
    const onStopCheck = vi.fn();
    render(panel({ check: CHECK({ collected: 42 }), onStopCheck }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStopCheck).toHaveBeenCalled();
  });
});

describe('the numbers behind a run', () => {
  /*
     A rejected fit is otherwise a dead end — the figure is withheld and all
     that is left is that something went wrong. Two clean runs on an iPhone
     both produced an impossible answer, and there was no way to tell an
     interrupted run from a systematically wrong one, because both look the
     same from outside.
  */
  it('is available even when the fit produced nothing usable', () => {
    render(panel({
      clockDisturbed: true,
      clockDebug: {
        ...DEBUG,
        points: 126, wallSeconds: 63.4, audioSeconds: 63.33,
        fittedRatio: 0.998859, totalsRatio: 0.998861,
        fittedDriftSecondsPerDay: -98.58, totalsDriftSecondsPerDay: -98.4,
        rejectedGap: 2, rejectedRatio: 11,
        minStepRatio: 0.96, maxStepRatio: 1.02,
      },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Show the numbers' }));
    const t = screen.getByRole('table').textContent ?? '';
    expect(t).toMatch(/points used/);
    expect(t).toMatch(/126/);
    expect(t).toMatch(/-98\.58 s\/day/);
    // The counts that say which kind of failure it was.
    expect(t).toMatch(/rejected — gap/);
    expect(t).toMatch(/rejected — ratio/);
  });

  /* Two ways of reducing the same points. They should agree; a disagreement
     means the points are not evenly spread across the run. */
  it('shows the fitted slope and the plain ratio of totals side by side', () => {
    render(panel({
      clockDebug: { ...DEBUG, points: 100, wallSeconds: 60, audioSeconds: 60,
        fittedRatio: 1.000054, totalsRatio: 1.000054,
        fittedDriftSecondsPerDay: 4.67, totalsDriftSecondsPerDay: 4.67 },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Show the numbers' }));
    const t = screen.getByRole('table').textContent ?? '';
    expect(t).toMatch(/fitted slope/);
    expect(t).toMatch(/ratio of totals/);
    expect(t).toMatch(/54 ppm/);
  });

  it('stays out of the way until asked for', () => {
    render(panel());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
