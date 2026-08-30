/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { Sheet } from './Sheet';
import { GUIDE, type Topic } from './guide-content';

/*
   One explanation, over whatever asked for it.

   Expanding the text in place pushed the settings about underneath the finger
   that opened it, and left the page longer every time a question was asked.
   A card over the top answers the question and goes away again, leaving the
   list exactly where it was.
*/
export function InfoSheet({ topic, onClose }: { topic: Topic | null; onClose: () => void }) {
  const entry = topic ? GUIDE[topic] : null;

  return (
    <Sheet open={entry !== null} onClose={onClose} label={entry?.title ?? 'Information'} variant="popup">
      <div className="sheet__head">
        <span style={{ fontWeight: 600, fontSize: 15 }}>{entry?.title}</span>
        <button
          className="secondary"
          onClick={onClose}
          aria-label="Close"
          style={{ padding: '7px 13px', fontSize: 15, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div className="sheet__body prose" data-sheet-scroll>
        {entry && (
          <>
            <p className="sheet__lede">{entry.lede}</p>
            {entry.body}
          </>
        )}
      </div>
    </Sheet>
  );
}
