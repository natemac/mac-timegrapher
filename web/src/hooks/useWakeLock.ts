/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect } from 'react';

/*
   Keeps the screen awake while measuring.

   A reading takes twenty to thirty seconds to settle, and the operator's hands
   are on a watch throughout — not tapping the screen. A phone dimming and
   locking mid-measurement is the difference between a tool you can use at a
   bench and one you fight.

   Held only while capturing: keeping a screen lit on a page doing nothing
   would be rude, and on a phone it costs real battery.
*/
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (!('wakeLock' in navigator)) return; // Not supported; nothing to do.

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Denied, or the tab lost focus before the request resolved. The app
        // works fine without it, so this is not worth surfacing.
      }
    };

    // The browser drops the lock whenever the tab is hidden — switching apps to
    // check something and coming back would otherwise leave the screen sleeping
    // again with no indication why.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && sentinel === null) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
