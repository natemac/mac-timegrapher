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

export type Topic =
  | 'modes' | 'input' | 'measurement' | 'settling' | 'signal' | 'trace'
  | 'waveform' | 'beat' | 'inspection'
  // Settings. Explained here rather than beside the controls, so the settings
  // page is a list of controls and not a wall of prose.
  | 'setting-movement' | 'setting-steadiness' | 'setting-branding'
  | 'setting-magnification' | 'setting-history' | 'setting-diagnostics'
  | 'setting-clock';

export interface GuideEntry {
  title: string;
  /** One line: what this is, before any detail. */
  lede: string;
  body: ReactNode;
}

export const GUIDE: Record<Topic, GuideEntry> = {
  'setting-movement': {
    title: 'Movement',
    lede: 'Which calibre is on the sensor. It decides the lift angle, and the lift angle decides amplitude.',
    body: (
      <>
        <p>
          Beat rate the app can work out for itself. Lift angle it cannot — that
          is escapement geometry, not something you can hear — and amplitude is
          calculated directly from it. A degree out is about two percent of
          amplitude, so the wrong calibre gives a confidently wrong number.
        </p>
        <p>
          The setup panel shows this as a dropdown until you pick one, then
          collapses it to a line of text. A bench works through a batch of one
          calibre, so this is where it gets changed afterwards.
        </p>
        <p>
          Quartz calibres are listed so an inspection can name them, but the
          analysis does not apply: a stepper motor has no balance wheel, so
          amplitude and beat error are withheld rather than shown as numbers you
          could act on.
        </p>
      </>
    ),
  },

  'setting-clock': {
    title: 'Audio clock',
    lede: 'Your sound card does not run at exactly the rate it claims, and every reading inherits the difference.',
    body: (
      <>
        <p>
          A device that reports 44,100 Hz is running at something near it.
          Crystals are typically ten to a hundred parts per million out, and
          every part per million is <strong>0.0864 seconds a day</strong> of
          error in rate. A hundred parts per million is 8.6 s/day — the
          difference between a watch that needs regulating and one that does
          not.
        </p>
        <p>
          It hides from everything else here. The error is a constant scale
          factor, so it is perfectly repeatable: the reading settles, the spread
          stays tight, and the whole scale is shifted. Steadiness cannot see it.
        </p>

        <h4>Measuring it</h4>
        <p>
          Start a capture and leave it running for a minute or more without
          stopping. Nothing needs to be on the sensor. The app compares its own
          audio clock against the system clock, which is disciplined and far
          steadier than any sound card, and fits a line through the two.
        </p>
        <p>
          It has to be one uninterrupted run. Stitching several short ones
          together is biased by more than the error being measured, so a new
          capture starts the measurement over.
        </p>
        <p>
          Then press <strong>Apply</strong>. The correction is remembered on
          this device and used for every reading afterwards. It belongs to the
          audio device, so measure it again if you change sensor or machine.
        </p>

        <h4>What it does not fix</h4>
        <p>
          Amplitude comes from the shape of the escapement impulse and the lift
          angle, not from the clock, so this does not touch it. Beat error is a
          ratio within one beat and barely moves either. This corrects rate.
        </p>
      </>
    ),
  },

  'setting-diagnostics': {
    title: 'Session diagnostics',
    lede: 'A written record of what the last run actually did, for working out why a reading behaved the way it did.',
    body: (
      <>
        <p>
          Everything that decides whether a reading is trustworthy happens twice
          a second and is gone by the time you notice something is wrong. This
          keeps it: every reading, its spread, the signal level, and a timeline
          of what the app did — when the average was restarted, when a position
          was recorded, when it gave up waiting for one to settle.
        </p>
        <p>
          It also records the setup the run happened under: the input device,
          the sample rate, whether the browser admitted to applying gain control
          or noise suppression, and the calibre and lift angle in force.
        </p>
        <p>
          It stays on this device. It is written while you measure and goes
          nowhere until you export it — worth knowing before you send one on,
          because it names your audio device and your browser.
        </p>
        <p>
          A plain text file. Roughly twenty minutes of a run is kept; beyond
          that the oldest readings are dropped.
        </p>
      </>
    ),
  },

  'setting-steadiness': {
    title: 'Steadiness of this bench',
    lede: 'Not a setting — a measurement of your setup, for deciding where the Settled threshold belongs.',
    body: (
      <>
        <p>
          The left column is the tightest each reading has held this session. The
          right is the threshold it has to beat to read <strong>Settled</strong>.
        </p>
        <p>
          These thresholds are the one number nobody can pick from first
          principles. They have to sit just above what a setup can actually hold,
          and a hand-held sensor and a rigid mount are different instruments — a
          figure that suits one is either unreachable or meaningless on the
          other.
        </p>
        <p>
          To use it: put a known-good, fully wound watch on the sensor and let it
          run a minute or two in one position, then read the left column.
        </p>
        <ul>
          <li>
            Comfortably under the right every time — the thresholds are looser
            than your setup needs and could come down.
          </li>
          <li>
            Never gets there — too tight, or the sensor is not in firm enough
            contact. Rule out contact first.
          </li>
        </ul>
        <p>
          Rate is the one that matters most; amplitude wanders more by nature.
        </p>
      </>
    ),
  },

  'setting-branding': {
    title: 'Branding',
    lede: 'Whether the MAC mark appears in the app, on the inspection and on a saved reading.',
    body: (
      <>
        <p>
          Off unless you turn it on, because most people running this are not
          MAC — a stranger's logo on your own inspection document is worse than
          no logo at all. Turning it on is remembered on this device, so it is
          done once.
        </p>
        <p>
          The open-source notice in the footer stays either way. That one is a
          licence condition rather than branding, and it is not affected by this.
        </p>
      </>
    ),
  },

  'setting-magnification': {
    title: 'Trace magnification',
    lede: 'How much drift spans the width of the trace.',
    body: (
      <>
        <p>
          A smaller number magnifies more, so a small rate error leans further.
          <strong> Auto</strong> keeps the lean as steep as it can while the line
          still fits on the strip, and is usually what you want.
        </p>
        <p>
          Lines running off one edge and reappearing on the other mean the
          magnification is tighter than the watch's error needs.
        </p>
      </>
    ),
  },

  'setting-history': {
    title: 'Trace history',
    lede: 'How far back the trace remembers.',
    body: (
      <p>
        Longer shows the trend more clearly; shorter reacts faster when you move
        the regulator.
      </p>
    ),
  },

  modes: {
    title: 'Measure or Inspection',
    lede: 'Two jobs. You choose which one you are doing before the watch goes on the sensor.',
    body: (
      <>
        <p>
          <strong>Measure</strong> is one live reading. Use it with a
          screwdriver in your other hand: you watch the rate move as you adjust
          the regulator. Nothing is recorded unless you press Capture, which
          saves the readings on screen as an image.
        </p>
        <p>
          <strong>Inspection</strong> takes the watch through six positions,
          records each one, and produces a printable document. It is the slower
          job and the one that ends in something you can hand over.
        </p>
        <p>
          The choice is made on the opening screen, and again in these settings.
        </p>
      </>
    ),
  },

  inspection: {
    title: 'Running an inspection',
    lede: 'Six positions, one press of Start each, and a document at the end.',
    body: (
      <>
        <p>
          A single reading tells you whether a watch is fast. Six tell you why.
          A movement that is fine dial up and poor crown down has a poising or
          pivot problem; one that is uniformly fast just needs the regulator
          moved. The difference between the best and worst position — the
          positional spread — is what separates those two cases, and it is the
          reason a bench measures more than once.
        </p>

        <h4>The loop</h4>
        <p>
          The panel names a position. Put the watch that way on the sensor and
          press <strong>Start</strong>. It counts three seconds down — that is
          for you to take your hand off, because letting go of a watch is itself
          a noise the analysis cannot tell from the movement misbehaving. Then
          it listens, and the reading is recorded once it settles. Capture stops
          on its own, the panel names the next position, and you press Start
          again.
        </p>
        <p>
          With <strong>Auto</strong> on, that is the whole job: turn the watch,
          press Start, wait. Turn it off and a Record button appears so you
          decide the moment yourself.
        </p>
        <p>
          Nothing recorded before you pressed Start can reach a reading. The
          average is thrown away and restarted every time, which is the point of
          running it this way rather than leaving the microphone open.
        </p>

        <h4>If it will not settle</h4>
        <p>
          After a minute the panel says so and lets you record it anyway. A
          reading that will not settle is usually poor contact with the sensor,
          or a room that is too noisy — but it can also be the watch, which is
          worth knowing rather than hiding.
        </p>

        <h4>Before and after</h4>
        <p>
          A run records into <strong>As found</strong> until every position has
          been measured, then the next run becomes <strong>As left</strong>.
          That gives a document showing what the watch arrived doing and what it
          left doing, which is far more useful than a single column — "+2 s/day"
          means little without the "+27" it started at. You can set which pass
          you are on by hand from the session sheet.
        </p>
        <p>
          You do not have to do all six. Skip moves past a position, and Finish
          early closes the run with whatever has been recorded.
        </p>
      </>
    ),
  },

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

  beat: {
    title: 'Beat',
    lede: 'One beat, averaged and magnified. The shape of the escapement itself.',
    body: (
      <>
        <p>
          Every reading in the app is a number the analysis worked out. This is
          the sound it worked them out from — one beat, averaged over the last
          few seconds, drawn around the tick and again around the tock.
        </p>
        <p>
          A healthy beat is <strong>two or three sharp bursts</strong> close
          together: the escape wheel unlocking, the impulse to the balance, and
          the drop onto the next tooth. The green line marks the impulse.
        </p>
        <ul>
          <li><strong>Read down from the top scale</strong> at the green line — that is amplitude. It is the same measurement the readings show, shown as a position rather than a number.</li>
          <li><strong>Tick and tock should look alike.</strong> One weaker or smeared means the two pallet stones are not doing the same work.</li>
          <li><strong>A smeared, spread-out impulse</strong> — a chipped or dirty pallet stone.</li>
          <li><strong>The impulse buried in the unlocking</strong> — poor lock, or the escapement out of adjustment.</li>
          <li><strong>Extra bursts where nothing should be</strong> — often rebanking, the balance swinging so far it knocks the escapement.</li>
        </ul>
        <p className="dim">
          The bottom scale is milliseconds before the beat. Both curves share it,
          so anything that differs between them differs in the watch.
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

export const GUIDE_ORDER: Topic[] = [
  'modes', 'input', 'measurement', 'settling', 'signal', 'trace', 'beat',
  'waveform', 'inspection',
];
