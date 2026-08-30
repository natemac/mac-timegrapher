/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { SlideSwitch, type SlideOption } from './SlideSwitch';

export type Graph = 'trace' | 'waveform';

const OPTIONS: SlideOption<Graph>[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'waveform', label: 'Waveform' },
];

/*
   The two views are one thing seen two ways. The switch also costs a fraction
   of the height two full-width buttons did, which the trace gets instead.
*/
export function GraphSwitch({ value, onChange }: { value: Graph; onChange: (g: Graph) => void }) {
  return <SlideSwitch value={value} options={OPTIONS} onChange={onChange} label="Graph" />;
}
