/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useState } from 'react';
import { ModeSwitch, type Mode } from '../components/ModeSwitch';
import { SourceFooter } from '../components/SourceFooter';

/*
   A draft of the opening screen. Not wired into the app — see welcome-draft.html.

   Taken from a mockup that got the important thing right: the panel should say
   what you are about to do, not just offer a switch. Three departures from it,
   each for a reason the app has already committed to.

   Monochrome. The mockup's button was periwinkle, which is the only colour in
   the product and would be the only one in light mode too — where a saturated
   blue on paper reads as a hyperlink, not a primary action. `--accent` already
   flips with the theme and is what every other button here uses.

   One privacy line, not two. The mockup said it in the feature rows and again
   in a card beneath them. It is a promise worth making once, plainly.

   Claims the app can keep. The mockup offered "levels are checked before each
   position", which nothing does — the pre-flight is a tab you run. Copy that
   describes behaviour the app does not have is a bug with a long fuse.
*/

const ICON = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true } as const;

const Clock = () => <svg {...ICON}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></svg>;
const Positions = () => <svg {...ICON}><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="3.4" r="1.3" /><circle cx="12" cy="20.6" r="1.3" /><circle cx="3.4" cy="12" r="1.3" /><circle cx="20.6" cy="12" r="1.3" /><circle cx="5.9" cy="5.9" r="1.3" /><circle cx="18.1" cy="18.1" r="1.3" /></svg>;
const Document = () => <svg {...ICON}><path d="M6 3.5h7l5 5v12H6z" strokeLinejoin="round" /><path d="M13 3.5V9h5" strokeLinejoin="round" /></svg>;
const Wave = () => <svg {...ICON}><path d="M3 12h2.5l2-6 3 13 3-9 2 4H21" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Camera = () => <svg {...ICON}><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13.5" r="3.6" /><path d="M9 7l1.4-2.5h3.2L15 7" strokeLinejoin="round" /></svg>;

interface Job {
  heading: string;
  lede: string;
  points: { icon: () => React.ReactElement; label: string; note: string }[];
  action: string;
}

/* One screen per job, because the two are different work and the panel is the
   only place that can say so before the microphone is asked for. */
const JOBS: Record<Mode, Job> = {
  measure: {
    heading: 'One live reading',
    lede: 'For watching the rate move under the screwdriver. Nothing is recorded unless you capture it.',
    points: [
      { icon: Wave, label: 'Live trace and beat', note: 'The slope moves before the numbers do.' },
      { icon: Clock, label: 'Settles in 20–30 s', note: 'It tells you when to trust the reading.' },
      { icon: Camera, label: 'Capture when you want it', note: 'Saves the readings on screen as an image.' },
    ],
    action: 'Start measuring',
  },
  inspection: {
    heading: 'Six positions, one at a time',
    lede: 'Records each position once it has settled, and ends in a printable timing report.',
    points: [
      { icon: Positions, label: 'The six standard positions', note: 'Dial up and down, crown up, down, left, right.' },
      { icon: Clock, label: 'About 5–10 minutes', note: 'Roughly a minute a position, plus handling.' },
      { icon: Document, label: 'A document at the end', note: 'One page, printable, with your reference on it.' },
    ],
    action: 'Start inspection',
  },
};

export function WelcomeDraft({ version }: { version: string }) {
  const [mode, setMode] = useState<Mode>('inspection');
  const job = JOBS[mode];

  return (
    <div className="app draft">
      <header className="app__masthead">
        <img
          className="app__logo app__logo--neg"
          src={`${import.meta.env.BASE_URL}mac-logo-neg.png`}
          alt="MAC Bespoke Watch Co."
        />
        <img
          className="app__logo app__logo--pos"
          src={`${import.meta.env.BASE_URL}mac-logo-pos.png`}
          alt=""
          aria-hidden="true"
        />
        <span className="app__wordmark">Timegrapher</span>
        <div className="app__controls">
          <button className="icon-button" aria-label="Inspection">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M4 5.5h16M4 12h16M4 18.5h16" strokeLinecap="round" />
            </svg>
          </button>
          <button className="icon-button" aria-label="Guide and settings">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      <p className="gate__tagline">Mechanical watch timing analysis</p>

      <div className="panel draft__panel">
        <div className="gate__mode">
          <ModeSwitch value={mode} onChange={setMode} />
        </div>

        <h2 className="draft__heading">{job.heading}</h2>
        <p className="draft__lede">{job.lede}</p>

        <ul className="draft__points">
          {job.points.map((p) => (
            <li key={p.label}>
              <span className="draft__point-icon">{p.icon()}</span>
              <span className="draft__point-label">{p.label}</span>
              <span className="draft__point-note">{p.note}</span>
            </li>
          ))}
        </ul>

        <button className="draft__go">
          {job.action}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 12h15M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <p className="gate__privacy">
        Nothing is recorded or uploaded. The audio is analysed on this device
        and never leaves it.
      </p>

      <p className="gate__version mono">{version}</p>
      <SourceFooter />
    </div>
  );
}
