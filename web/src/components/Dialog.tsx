/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, type ReactNode } from 'react';

/*
   The native <dialog>, which the design's stylesheet is written against.

   Using the element rather than a div means the browser supplies the modal
   behaviour that used to be hand-rolled here: the backdrop, the focus trap,
   Escape, and inertness of everything underneath. The one thing it does not
   supply is dismissal by clicking outside, because a click on the backdrop is
   reported as a click on the dialog itself — hence the geometry test.
*/
interface Props {
  open: boolean;
  onClose: () => void;
  id: string;
  className?: string;
  labelledBy: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, id, className, labelledBy, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    // jsdom has no dialog implementation; the app must still render there.
    if (!el || typeof el.showModal !== 'function') return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      className={className}
      aria-labelledby={labelledBy}
      /* Escape and the browser's own close both come through here, so the
         parent's idea of what is open cannot drift from the element's. */
      onClose={onClose}
      onClick={(e) => {
        if (e.target !== ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const outside =
          e.clientX < r.left || e.clientX > r.right ||
          e.clientY < r.top || e.clientY > r.bottom;
        if (outside) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
