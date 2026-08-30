/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { SlideSwitch, type SlideOption } from './SlideSwitch';

/*
   The app does two jobs and they want different screens.

   Measuring is what you do with a screwdriver in your other hand: one live
   reading, watched while the regulator moves. A position picker and a capture
   button are dead weight there, and in a view that must never scroll, dead
   weight costs the trace its height.

   An inspection is the opposite — the readings are a means to a document, and
   the work is getting through six positions without contaminating any of them.
*/
export type Mode = 'measure' | 'inspection';

const OPTIONS: SlideOption<Mode>[] = [
  { id: 'measure', label: 'Measure' },
  { id: 'inspection', label: 'Inspection' },
];

const KEY = 'mac-timegrapher.mode';

export function loadMode(): Mode {
  try {
    const stored = localStorage.getItem(KEY);
    // 'certify' was this mode's name before it was called an inspection.
    // Mapping it keeps an existing preference rather than silently resetting it.
    return stored === 'inspection' || stored === 'certify' ? 'inspection' : 'measure';
  } catch {
    return 'measure';
  }
}

export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private browsing or a full quota; a forgotten preference is not worth
    // failing over.
  }
}

export function ModeSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <SlideSwitch
      value={value}
      options={OPTIONS}
      onChange={onChange}
      label="What you are doing"
      className="switch--mode"
    />
  );
}
