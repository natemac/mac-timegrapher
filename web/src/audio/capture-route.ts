/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { CaptureProfile } from './device-test';

/*
   Which audio route to open.

   Android only binds a chosen input on its communication route, and Chrome
   only takes that route when echo cancellation is requested. Measured on a
   Pixel 3 XL with a USB pickup: with all processing off, four different
   inputs — including the USB device — returned the same microphone, matching
   to within a decibel; with echo cancellation on, the pickup was reached and
   the watch measured.

   That route is not free. It applies gain control of its own, below the
   browser, which getSettings() reports as absent: the level ramps to full
   scale within a second of the capture opening and holds there, and heavy
   acoustic padding raised it rather than lowered it. Amplitude is read from
   where the impulse peak sits in time, so it cannot be trusted there, and the
   panel withholds it. Rate and beat error read timing and survive.

   It applies to Android as a platform, not to one browser. The first report
   of this came from a Pixel 9 Pro where Chrome and Firefox both failed to
   reach a USB pickup, and it was reproduced on a Pixel 3 XL — so the route is
   chosen by the operating system and there is nothing here for anyone to
   decide. Everywhere else the direct route is correct and already works.

   There was a setting offering this as a choice while it was still being
   worked out. It is gone: the answer is known for every Android device tested,
   and the only thing a control could do now is let someone quietly select the
   configuration that cannot measure.
*/

/*
   Read from the user agent because that is what decides the audio backend.
   Chrome on Android reports "Android"; iPadOS claims to be a Macintosh but
   never claims Android, so there is nothing to disambiguate here.
*/
export function isAndroid(userAgent: string): boolean {
  return /android/i.test(userAgent);
}

/** Which constraints to open a capture with on this device. */
export function resolveCaptureProfile(userAgent: string): CaptureProfile {
  return isAndroid(userAgent) ? 'ec-only' : 'ours';
}

/*
   Whether this is a Chromium browser on Android — Chrome itself, Edge, Opera,
   Samsung Internet, anything sharing that audio backend. They all carry a
   Chrome/ token; Firefox on Android carries none, which is the distinction
   that matters here.
*/
export function isChromiumAndroid(userAgent: string): boolean {
  return isAndroid(userAgent) && /Chrome\//.test(userAgent);
}

/*
   Whether the amplitude on screen deserves a warning under it.

   The gain control that makes amplitude untrustworthy was measured on Chrome
   for Android, on the communication route: the level climbs to full scale
   within a second of the capture opening and stays there, and padding the
   movement raised it rather than lowered it. Amplitude read 156-171 degrees
   against 282-291 for the same watch on the same pickup elsewhere.

   Firefox on Android is not affected. On the same handset and the same USB
   adapter it reports a clean signal 24-27 dB over the room with no clipping,
   and a rate that settles — so the fault belongs to one browser's audio
   backend rather than to the platform, and its readings should not carry
   somebody else's warning.

   The figure is shown either way. A reading with a caveat can be checked
   against another device; a blank cannot be checked against anything.

   And the caveat names the way out. Firefox is on the same phone, needs no
   hardware and no account, and measures this correctly — so the useful thing
   to say is not only that the number is suspect but what to do about it.
*/
export function amplitudeCaveat(profile: CaptureProfile, userAgent: string): string | null {
  if (profile !== 'ec-only') return null;
  return isChromiumAndroid(userAgent) ? 'May be inaccurate in this browser — try Firefox' : null;
}
