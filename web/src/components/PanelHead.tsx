/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { ReactNode } from 'react';
import type { Topic } from './guide-content';

/*
   Every panel's header, with the label doubling as its own explanation.

   The label is the button rather than a separate icon beside it: a small "i"
   in a row of small text is easy to miss and easy to mis-tap, and the label is
   already the thing an operator points at when asking "what is this?".
*/
export function PanelHead({
  label, topic, onHelp, right,
}: {
  label: string;
  topic: Topic;
  onHelp: (t: Topic) => void;
  right?: ReactNode;
}) {
  return (
    <div className="panel__head">
      <button className="panel__help" onClick={() => onHelp(topic)}>
        <span className="eyebrow">{label}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.6-2.8 2.6" strokeLinecap="round" />
          <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
        </svg>
        <span className="visually-hidden">— what is this?</span>
      </button>
      {right}
    </div>
  );
}
