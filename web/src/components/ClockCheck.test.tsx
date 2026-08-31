/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClockCheck } from './SettingsSheet';
import type { Calibration } from '../timegrapher/tg-engine';

const running = (over: Partial<Calibration> = {}): Calibration => ({
  collected: 0, needed: 900, signal: 4, state: 0, driftSecondsPerDay: 0, ...over,
});

const noop = () => {};

describe('the quartz clock check', () => {
  it('offers to start when nothing is running', () => {
    render(<ClockCheck check={null} onStart={noop} onStop={noop} onUse={noop} />);
    expect(screen.getByRole('button')).toHaveTextContent('Check against a quartz watch');
  });

  /*
     The run takes a quarter of an hour. Without this, a run that never heard
     the watch at all looks exactly like one that simply is not finished — the
     operator would sit through fifteen minutes of nothing before finding out.
  */
  it('says when it cannot hear the tick yet', () => {
    const { container } = render(
      <ClockCheck check={running({ signal: 0 })} onStart={noop} onStop={noop} onUse={noop} />,
    );
    expect(container.textContent).toMatch(/listening for a once-a-second tick/i);
  });

  /*
     Named, because the same panel carries a second measurement of the same
     quantity — the system clock one, which counts to 60 seconds off any
     capture. Unlabelled, its progress line read as though it belonged to this
     button, and 60 seconds against 900 ticks looked like one thing
     contradicting itself.
  */
  it('names which of the two calibrations it is', () => {
    const { container } = render(
      <ClockCheck check={running({ signal: 4, collected: 10 })} onStart={noop} onStop={noop} onUse={noop} />,
    );
    expect(container.textContent).toMatch(/Quartz reference/);
  });

  it('shows progress and the time left once it is locked on', () => {
    const { container } = render(
      <ClockCheck check={running({ collected: 300 })} onStart={noop} onStop={noop} onUse={noop} />,
    );
    // 600 ticks left at one a second is ten minutes.
    expect(container.textContent).toMatch(/300 of 900 ticks, about 10 min left/);
  });

  /*
     state 1 is the core accepting its own fit — the least-squares uncertainty
     came in under 0.1 s/day. Anything else must not be presented as a number.
  */
  it('reports the figure only once the core has accepted the fit', () => {
    render(
      <ClockCheck
        check={running({ collected: 900, state: 1, driftSecondsPerDay: 4.994 })}
        onStart={noop} onStop={noop} onUse={noop}
      />,
    );
    expect(screen.getByText(/\+4\.99 s\/day/)).toBeInTheDocument();
  });

  it('says so plainly when the fit was too noisy to accept', () => {
    render(
      <ClockCheck
        check={running({ collected: 900, state: -1 })}
        onStart={noop} onStop={noop} onUse={noop}
      />,
    );
    expect(screen.getByText(/too scattered to trust/)).toBeInTheDocument();
    // No figure is shown for a rejected fit, not even a bad one.
    expect(screen.queryByText(/s\/day/)).not.toBeInTheDocument();
  });

  /*
     Nothing is applied on its own. The measurement carries the reference
     watch's own error — a Casio spec'd at +/-20 s/month brings +/-0.66 s/day
     with it — so accepting it is the operator's call, not the app's.
  */
  it('applies the figure only when it is pressed', () => {
    const onUse = vi.fn();
    render(
      <ClockCheck
        check={running({ collected: 900, state: 1, driftSecondsPerDay: -8.0086 })}
        onStart={noop} onStop={noop} onUse={onUse}
      />,
    );
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use it' }));
    expect(onUse).toHaveBeenCalledWith(-8.0086);
  });

  it('can be abandoned part-way', () => {
    const onStop = vi.fn();
    render(<ClockCheck check={running({ collected: 42 })} onStart={noop} onStop={onStop} onUse={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalled();
  });
});
