/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';
import { useScrollLock } from '../hooks/useScrollLock';

/*
   Open sheets form a stack: an InfoSheet can sit above the SettingsSheet that
   opened it. Both listen on Window, and stopPropagation() cannot separate two
   listeners on the same target — only stopImmediatePropagation could, and even
   that would depend on registration order rather than which sheet is on top.
   So the top of this stack decides who consumes an Escape.
*/
const openSheets: symbol[] = [];

/*
   The shell every sheet sits in.

   Three things it owns that the sheets kept getting wrong on their own:

   - It renders into document.body rather than inside `.app`. A sheet nested in
     a scrolling ancestor hands every unclaimed gesture to that ancestor, which
     is how dragging a sheet came to scroll the page behind it.
   - It locks the document while open, which is the part iOS honours —
     overscroll-behavior alone still let a pull at the top trigger the
     browser's refresh and throw the session away.
   - It closes on a downward drag, because that is the gesture people try
     first, and it used to reload the app instead.

   Mark the scrolling region with `data-sheet-scroll` so a drag there only
   starts a dismiss when it is already at the top; everything else counts as a
   handle.
*/
interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  /** A narrow card that sits above another sheet rather than replacing it. */
  variant?: 'sheet' | 'popup';
}

export function Sheet({ open, onClose, label, children, variant = 'sheet' }: Props) {
  const { nodeRef, offset, dragging } = useSwipeDismiss(onClose, open);
  const sheetId = useRef(Symbol('sheet'));

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const id = sheetId.current;
    openSheets.push(id);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openSheets.at(-1) === id) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const index = openSheets.lastIndexOf(id);
      if (index !== -1) openSheets.splice(index, 1);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={variant === 'popup' ? 'sheet__scrim sheet__scrim--popup' : 'sheet__scrim'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={nodeRef}
        className={variant === 'popup' ? 'sheet sheet--popup' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          // Only while the finger is down. Letting go should spring back or
          // close, not follow the finger a beat late.
          transition: dragging ? 'none' : undefined,
        }}
      >
        {/* The grab bar. Says the sheet can be pulled away, and gives a target
            where a drag is never mistaken for a scroll. */}
        <div className="sheet__grab" data-sheet-handle aria-hidden="true">
          <span />
        </div>

        {children}
      </div>
    </div>,
    document.body,
  );
}
