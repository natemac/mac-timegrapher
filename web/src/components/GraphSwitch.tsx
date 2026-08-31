/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { SlideSwitch, type SlideOption } from './SlideSwitch';

export type Graph = 'trace' | 'waveform' | 'beat';

const OPTIONS: SlideOption<Graph>[] = [
  { id: 'trace', label: 'Trace' },
  { id: 'beat', label: 'Beat' },
  { id: 'waveform', label: 'Waveform' },
];

/*
   Three views of one thing, ordered by how far each is from the raw sound:
   the trace is every beat over half a minute, the beat is one beat averaged,
   the waveform is the microphone itself. The switch also costs a fraction of
   the height full-width buttons did, which the graph gets instead.
*/
export function GraphSwitch({ value, onChange }: { value: Graph; onChange: (g: Graph) => void }) {
  return <SlideSwitch value={value} options={OPTIONS} onChange={onChange} label="Graph" />;
}
