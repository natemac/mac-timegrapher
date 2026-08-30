/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useCallback, useEffect, useRef, useState } from 'react';

/*
   Drag a sheet down to close it.

   The gesture people already try. Pulling down at the top of a sheet used to
   reach the page underneath and trigger the browser's pull-to-refresh, which
   threw away the session; now it does the thing it looks like it should do.

   Listeners are attached by hand rather than through React because the move
   handler calls preventDefault, and React attaches touchmove passively — a
   passive handler cannot stop the browser scrolling underneath the drag.
*/

/** How far down the sheet has to travel before letting go closes it. */
const DISMISS_DISTANCE = 96;

/** A flick counts even if short: pixels per millisecond. */
const DISMISS_VELOCITY = 0.45;

/** Upward drag is allowed but heavily damped, so the sheet feels anchored. */
const UPWARD_RESISTANCE = 0.18;

export function useSwipeDismiss(onDismiss: () => void, enabled = true) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const startY = useRef(0);
  const startTime = useRef(0);
  const current = useRef(0);
  const active = useRef(false);

  /*
     A drag may only start where it cannot be mistaken for a scroll: on
     furniture the sheet marks as a handle, or in a scrolling region already at
     its top. Anywhere else the touch belongs to the content.
  */
  const canStart = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    if (target.closest('[data-sheet-handle]')) return true;

    const scroller = target.closest('[data-sheet-scroll]');
    if (scroller instanceof HTMLElement) return scroller.scrollTop <= 0;

    // Outside both: the scrim, or a gap. Treat as a handle.
    return true;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !enabled) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !canStart(e.target)) return;
      active.current = true;
      startY.current = e.touches[0].clientY;
      startTime.current = Date.now();
      current.current = 0;
      setDragging(true);
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      const dy = e.touches[0].clientY - startY.current;

      // An upward drag inside a scroller is the operator starting to scroll
      // after all. Hand it back rather than fighting them for it.
      if (dy < 0 && current.current === 0) {
        active.current = false;
        setDragging(false);
        setOffset(0);
        return;
      }

      current.current = dy > 0 ? dy : dy * UPWARD_RESISTANCE;
      setOffset(current.current);
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      setDragging(false);

      const travelled = current.current;
      const velocity = travelled / Math.max(1, Date.now() - startTime.current);
      if (travelled > DISMISS_DISTANCE || (travelled > 24 && velocity > DISMISS_VELOCITY)) {
        onDismiss();
      }
      setOffset(0);
      current.current = 0;
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd, { passive: true });
    node.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
  }, [canStart, enabled, onDismiss]);

  return { nodeRef, offset, dragging };
}
