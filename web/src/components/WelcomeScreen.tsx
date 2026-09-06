/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   The opening screen: what the instrument is, and the two jobs it does.

   No microphone is asked for here. Permission is requested from the toolbar on
   the measuring screen, where the request is attached to something the operator
   is visibly trying to do — which is both a better prompt and the only way both
   modes can be opened and looked at before anything is granted.
*/
interface Props {
  onLiveTiming: () => void;
  onInspection: () => void;
}

/* A minute track, drawn once. Sixty marks, every fifth one longer, which is how
   a dial reads at a glance without anybody counting. */
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const angle = (i * Math.PI) / 30;
  const major = i % 5 === 0;
  const inner = major ? 60 : 64;
  return {
    key: i,
    x1: 80 + Math.sin(angle) * inner,
    y1: 80 - Math.cos(angle) * inner,
    x2: 80 + Math.sin(angle) * 68,
    y2: 80 - Math.cos(angle) * 68,
    opacity: major ? 0.65 : 0.25,
  };
});

export function WelcomeScreen({ onLiveTiming, onInspection }: Props) {
  return (
    <section className="welcome" id="welcome">
      <div className="instrument" aria-hidden="true">
        <svg viewBox="0 0 160 160">
          <circle className="dial" cx="80" cy="80" r="76" opacity=".12" />
          <g id="ticks">
            {TICKS.map((t) => (
              <line
                key={t.key}
                className="tick"
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                opacity={t.opacity}
              />
            ))}
          </g>
          <path className="dial" opacity=".09" d="M29 80h102M80 29v102" />
          <path
            className="trace"
            d="M29 80h15l4-3 4 6 5-3h8l5-24 7 48 6-34 5 10h9l4-3 4 6 4-3h22"
          />
          <circle cx="80" cy="13" r="2" fill="currentColor" />
        </svg>
      </div>

      <h1 className="welcome-title">TIMEGRAPHER</h1>

      <div className="mode-actions">
        <button className="mode-card" id="begin" onClick={onLiveTiming}>
          <span className="mode-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 12h4l2-7 4 14 4-14 2 7h4" />
            </svg>
          </span>
          <span>
            <strong>Live Timing</strong>
            <small>Real-time readings &amp; graphs</small>
          </span>
          <span className="chevron" aria-hidden="true">›</span>
        </button>

        <button className="mode-card" id="inspect" onClick={onInspection}>
          <span className="mode-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="5" y="4" width="14" height="17" rx="3" />
              <path d="M9 4V2h6v2M8 10l2 2 5-5M9 16h6" />
            </svg>
          </span>
          <span>
            <strong>Inspection</strong>
            <small>A guided movement inspection</small>
          </span>
          <span className="chevron" aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}
