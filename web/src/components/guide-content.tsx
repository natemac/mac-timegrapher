/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { ReactNode } from 'react';

/*
   One source for every explanation in the app.

   Each panel can be tapped for a short "what am I looking at" note, and the
   guide lists them all. Both read from here, so the answer a operator gets by
   tapping Amplitude is word for word the one in the guide — two copies would
   drift, and the shorter one would end up being the wrong one.
*/

export type Topic = 'input' | 'measurement' | 'settling' | 'signal' | 'trace' | 'waveform';

export interface GuideEntry {
  title: string;
  /** One line: what this is, before any detail. */
  lede: string;
  body: ReactNode;
}

export const GUIDE: Record<Topic, GuideEntry> = {
  input: {
    title: 'Audio input',
    lede: 'Which microphone the app is listening to, and how fast it is sampling.',
    body: (
      <>
        <p>
          Pick the device the watch is resting on. A USB timegrapher or contact
          microphone will pick up far more than a built-in mic, which mostly
          hears the room.
        </p>
        <p>
          The number on the right is the sample rate the device actually gave
          us. If the app warns that the browser resampled the input, readings
          are still usable but slightly less exact.
        </p>
      </>
    ),
  },

  measurement: {
    title: 'The four readings',
    lede: 'What the watch is doing, and whether it needs attention.',
    body: (
      <>
        <p>
          <strong>Rate</strong> — seconds gained or lost per day. Positive is
          fast. This is the one the regulator changes. Most mechanical watches
          are considered good within about ±10 s/day; chronometer grade is
          roughly −4 to +6.
        </p>
        <p>
          <strong>Amplitude</strong> — how far the balance wheel swings, in
          degrees. This is about the health of the movement, not its accuracy.
          Roughly 270–310° fully wound and lying flat is healthy. Much below
          250° usually means old oil, dirt, or a tired mainspring. It falls
          naturally in vertical positions and as the watch unwinds.
        </p>
        <p>
          <strong>Beat error</strong> — whether tick and tock are evenly spaced,
          in milliseconds. Think of a limp: the watch runs, but unevenly. Under
          0.5 ms is good, under 0.3 ms very good. Correcting it means moving the
          hairspring collet, not the regulator.
        </p>
        <p>
          <strong>Beat rate</strong> — the movement's design speed, not a fault.
          An NH35 is 21,600 bph; many chronographs are 28,800. If it shows
          something unexpected, the app is probably hearing something other than
          the escapement.
        </p>
        <p className="dim">
          The small ± under each number is how much it has wandered recently. A
          reading with a wide spread is not yet worth writing down.
        </p>
      </>
    ),
  },

  settling: {
    title: 'Settling',
    lede: 'Whether the reading has stopped moving enough to trust.',
    body: (
      <>
        <p>
          The dot shows how far the current rate sits from where it has been
          sitting. While you are still finding the watch, it swings. As the
          reading steadies, the dot draws in, comes to rest inside the band and
          turns green.
        </p>
        <p>
          Wait for <strong>Settled</strong> before recording a number. If it
          will not settle, the usual causes are a loose grip on the sensor, a
          noisy room, or a watch that genuinely is not running steadily.
        </p>
      </>
    ),
  },

  signal: {
    title: 'Signal',
    lede: 'How clearly the ticks stand out from the room.',
    body: (
      <>
        <p>
          <strong>Good</strong> or <strong>Excellent</strong> means the sensor
          has a clear signal and you can trust what follows.
        </p>
        <p>
          <strong>Weak</strong> or <strong>Fair</strong> — press the watch more
          firmly against the sensor, or move somewhere quieter.
        </p>
        <p>
          <strong>Too loud</strong> means the input is clipping. Turn the input
          level down in your system sound settings. Slightly quiet and clean
          beats loud and distorted, because amplitude is measured from the shape
          of each tick.
        </p>
      </>
    ),
  },

  trace: {
    title: 'Trace',
    lede: 'The classic paper strip. Slope is rate; the gap between lines is beat error.',
    body: (
      <>
        <p>
          Every beat leaves a mark, newest at the top, exactly as paper scrolled
          past a stylus. There are two lines — tick and tock.
        </p>
        <ul>
          <li><strong>Straight down</strong> — keeping time.</li>
          <li><strong>Leaning right</strong> — gaining. <strong>Left</strong> — losing.</li>
          <li><strong>Steeper</strong> — further off rate.</li>
          <li><strong>Gap between the lines</strong> — the beat error.</li>
          <li><strong>Fuzzy or scattered marks</strong> — a dirty movement, or a poor grip on the sensor.</li>
        </ul>
        <p>
          Turn the regulator and watch the slope change. You will see it long
          before the numbers catch up, which is what the trace is for.
        </p>
        <p className="dim">
          Lines running off one edge reappear on the other. If they wrap faster
          than you can read, choose a wider magnification in settings.
        </p>
      </>
    ),
  },

  waveform: {
    title: 'Waveform',
    lede: 'The raw sound, for checking the sensor is hearing the watch.',
    body: (
      <>
        <p>
          You want <strong>evenly spaced spikes in pairs</strong> against a quiet
          floor — that is the escapement.
        </p>
        <p>
          A continuous fuzzy band with no repeating pattern means the sensor is
          hearing the room instead. Check the watch is in firm contact before
          suspecting anything else.
        </p>
      </>
    ),
  },
};

export const GUIDE_ORDER: Topic[] = ['input', 'measurement', 'settling', 'signal', 'trace', 'waveform'];
