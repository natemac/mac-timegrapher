/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   Whether the operator has any way to turn the input down.

   This decides whether telling them to is help or noise. A desktop or laptop
   applies its own gain to a USB audio device and hands the user a slider for
   it — and it typically defaults that slider high. A phone or tablet does not:
   the level is whatever the OS decides, there is no control anywhere, and
   advice to adjust it is advice to go looking for something that is not there.

   Measured on one movement through one pickup, a MacBook peaked at -1.1 dBFS
   where an iPhone and iPad on the same hardware peaked at -7.5 and -6.3. Same
   microphone, same adapter; the difference is the host's gain stage.

   There is no capability API for this, so it is decided by platform. The
   arguments default to the real values and exist so it can be tested.
*/
export function hasInputGainControl(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  maxTouchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
): boolean {
  if (/iPhone|iPod/.test(ua)) return false;
  if (/iPad/.test(ua)) return false;
  /* iPadOS has claimed to be a Mac since version 13 — an iPad Air running
     Safari is indistinguishable from a MacBook by user agent alone. The touch
     points are what give it away: no Mac reports any. */
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return false;
  /* Android exposes no per-input gain to the user either. */
  if (/Android/.test(ua)) return false;
  return true;
}
