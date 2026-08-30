/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
export type Graph = 'trace' | 'waveform';

const OPTIONS: { id: Graph; label: string }[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'waveform', label: 'Waveform' },
];

/*
   The two views are one thing seen two ways, not two separate commands, and a
   sliding control says that: the indicator travels between them rather than
   one button lighting up and another going dark. It also costs a fraction of
   the height two full-width buttons did, which the trace gets instead.

   Built from real buttons rather than a styled div, so it is reachable by
   keyboard and announces its state.
*/
export function GraphSwitch({ value, onChange }: { value: Graph; onChange: (g: Graph) => void }) {
  return (
    <div className="switch" data-active={value} role="group" aria-label="Graph">
      {/* The travelling indicator. Purely decorative — the buttons carry the
          state for anything that is not looking at it. */}
      <span className="switch__thumb" aria-hidden="true" />
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          className="switch__option"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
