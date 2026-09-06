/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useRef, type ReactNode } from 'react';

/*
   One graph at a time, in the surface the design drew for it.

   The design specified an SVG fed with path strings, because it had no engine
   to draw from. The three renderers here are the existing canvases — the paper
   strip, the averaged beat and the raw waveform — which are the one part of the
   interface the design was not given, and which are checked against the DSP
   rather than against a picture. So the surface is the design's and the drawing
   is ours: same toolbar, same well, same axis strip, same tab semantics.
*/
export type Graph = 'waveform' | 'beat' | 'trace';

/*
   Ordered as the question is actually asked, left to right.

   Waveform first: it shows something the moment audio arrives, so a first-time
   user can tell the sensor is hearing the watch before any reading exists. Beat
   next: the averaged tick, which says whether what is being heard is an
   escapement. Trace last: the paper strip, which is the finest of the three and
   also the one that draws nothing at all until there are beats to fold.

   The trace is what a timegrapher *is*, and it used to open on it — which meant
   the app's first impression, on a bench that was not yet coupled, was an empty
   graph. Reversed here for that reason.
*/
export const GRAPHS: Graph[] = ['waveform', 'beat', 'trace'];

const TAB_LABEL: Record<Graph, string> = {
  trace: 'Trace',
  beat: 'Beat',
  waveform: 'Waveform',
};

export interface GraphAxis {
  start: string;
  end: string;
}

interface Props {
  graph: Graph;
  onChange: (g: Graph) => void;
  /** The magnification and window in force, shown at the end of the toolbar. */
  scale: string;
  axis: GraphAxis;
  /*
     Nothing to draw and nothing arriving. While a capture is running the
     canvases say for themselves what they are waiting for, which is more
     useful than one generic line over the top of them.
  */
  empty: boolean;
  children: ReactNode;
}

export function GraphSurface({ graph, onChange, scale, axis, empty, children }: Props) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (index: number) => {
    onChange(GRAPHS[index]);
    tabs.current[index]?.focus();
  };

  return (
    <div className="graph-surface">
      <div className="graph-toolbar">
        <div className="graph-tabs" role="tablist" aria-label="Measurement graph">
          {GRAPHS.map((g, i) => (
            <button
              key={g}
              ref={(el) => { tabs.current[i] = el; }}
              role="tab"
              id={`graph-tab-${g}`}
              data-graph={g}
              aria-controls="measurementGraph"
              aria-selected={graph === g}
              tabIndex={graph === g ? 0 : -1}
              onClick={() => onChange(g)}
              onKeyDown={(e) => {
                const next = e.key === 'ArrowRight' ? (i + 1) % GRAPHS.length
                  : e.key === 'ArrowLeft' ? (i + GRAPHS.length - 1) % GRAPHS.length
                    : e.key === 'Home' ? 0
                      : e.key === 'End' ? GRAPHS.length - 1
                        : null;
                if (next === null) return;
                e.preventDefault();
                move(next);
              }}
            >
              {TAB_LABEL[g]}
            </button>
          ))}
        </div>
        <span id="graphScale">{scale}</span>
      </div>

      <div
        id="measurementGraph"
        role="tabpanel"
        aria-labelledby={`graph-tab-${graph}`}
        aria-label={`${TAB_LABEL[graph]} graph`}
      >
        {!empty && children}
        {empty && <div id="graphEmpty">Waiting for a reading</div>}
      </div>

      <div className="graph-axis">
        <span id="graphAxisStart">{axis.start}</span>
        <span id="graphAxisCenter">{graph.toUpperCase()}</span>
        <span id="graphAxisEnd">{axis.end}</span>
      </div>
    </div>
  );
}
