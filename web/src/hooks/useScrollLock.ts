/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect } from 'react';

/*
   Freeze everything behind a sheet.

   overscroll-behavior alone was not enough on iOS: dragging inside a sheet
   still scrolled the app underneath, and pulling down at the top triggered the
   browser's own pull-to-refresh, which reloads and throws the session away.
   Setting overflow on the document is the part iOS actually honours.

   Counted rather than toggled, so an info popup opened over a sheet does not
   unlock the page underneath when it alone closes.
*/
let depth = 0;

export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    depth += 1;
    document.documentElement.classList.add('is-locked');

    return () => {
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        document.documentElement.classList.remove('is-locked');
      }
    };
  }, [locked]);
}
