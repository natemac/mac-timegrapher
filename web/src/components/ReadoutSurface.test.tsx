/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadoutSurface } from './ReadoutSurface';
import type { Measurement } from '../timegrapher/tg-engine';
import type { Spread } from '../timegrapher/stability';

const spread = (plusMinus: number): Spread =>
  ({ min: -plusMinus, max: plusMinus, mean: 0, plusMinus, count: 40 });

const reading = (over: Partial<Measurement> = {}): Measurement => ({
  rate: 1.4,
  amplitude: 279,
  beatError: 0.3,
  detectedBph: 21600,
  signalQuality: 8,
  valid: true,
  ...over,
});

function show(over: Partial<Parameters<typeof ReadoutSurface>[0]> = {}) {
  return render(
    <ReadoutSurface
      measurement={reading()}
      capturing
      secondsCaptured={30}
      settling="settled"
      spreads={{ rate: spread(0.4), amplitude: spread(3), beatError: spread(0.2) }}
      signal={null}
      onReset={vi.fn()}
      {...over}
    />,
  );
}

const CAVEAT = 'May be inaccurate in this browser — try Firefox';

/*
   The amplitude caveat.

   Chrome's Android communication route applies gain control below the browser
   and reports autoGainControl false throughout, so amplitude reads 156-171
   degrees against 276-291 for the same watch and pickup on a Mac. Rate and beat
   error read timing rather than level and survive. Without a caveat the wrong
   figure looks exactly like a right one.
*/
describe('the amplitude caveat', () => {
  it('sits under the amplitude when the platform earns one', () => {
    show({ amplitudeCaveat: CAVEAT });
    expect(screen.getByText(CAVEAT)).toBeInTheDocument();
  });

  /*
     The figure stays. A caveated reading can be checked against another device;
     a blank cannot be checked against anything — and the caveat names the way
     out, since Firefox is on the same phone and measures this correctly.
  */
  it('caveats the reading rather than withholding it', () => {
    show({ amplitudeCaveat: CAVEAT });
    expect(screen.getByText('279')).toBeInTheDocument();
    expect(screen.getByText('± 3')).toBeInTheDocument();
  });

  it('says nothing on a platform that measures amplitude correctly', () => {
    show({ amplitudeCaveat: null });
    expect(screen.queryByText(CAVEAT)).not.toBeInTheDocument();
  });

  it('is absent when the app supplies none', () => {
    show();
    expect(screen.queryByText(CAVEAT)).not.toBeInTheDocument();
  });

  /* Zero is the core saying it could not determine an amplitude. There is
     nothing to distrust about a dash. */
  it('stays away when there is no figure to doubt', () => {
    show({ measurement: reading({ amplitude: 0 }), amplitudeCaveat: CAVEAT });
    expect(screen.queryByText(CAVEAT)).not.toBeInTheDocument();
  });

  it('stays away when no reading has been produced at all', () => {
    show({ measurement: reading({ valid: false }), amplitudeCaveat: CAVEAT });
    expect(screen.queryByText(CAVEAT)).not.toBeInTheDocument();
  });

  /* Rate and beat error are read from timing and are unaffected. Warning about
     them would send somebody chasing a fault that is not there. */
  it('does not spread to the readings that survive the fault', () => {
    show({ amplitudeCaveat: CAVEAT });
    expect(screen.getAllByText(CAVEAT)).toHaveLength(1);
  });
});
