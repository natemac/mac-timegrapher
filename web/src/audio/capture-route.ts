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

   Everywhere else the direct route is correct and already works, so 'auto'
   means the compatibility route on Android and the direct route elsewhere.
   The override exists because this is a platform behaviour that may change,
   and being wrong about it should not leave anyone unable to measure.
*/
export type CaptureRoute = 'auto' | 'direct' | 'compatibility';

export const CAPTURE_ROUTES: { id: CaptureRoute; label: string; note: string }[] = [
  { id: 'auto', label: 'Automatic', note: 'Compatibility on Android, direct everywhere else.' },
  { id: 'direct', label: 'Direct', note: 'All processing off. Amplitude is measurable.' },
  { id: 'compatibility', label: 'Compatibility', note: 'Echo cancellation on. Needed to reach a USB pickup on Android; amplitude is not measurable.' },
];

/*
   Read from the user agent because that is what decides the audio backend.
   Chrome on Android reports "Android"; iPadOS claims to be a Macintosh but
   never claims Android, so there is nothing to disambiguate here.
*/
export function isAndroid(userAgent: string): boolean {
  return /android/i.test(userAgent);
}

/** The constraints profile a route resolves to on this device. */
export function resolveCaptureProfile(route: CaptureRoute, userAgent: string): CaptureProfile {
  if (route === 'direct') return 'ours';
  if (route === 'compatibility') return 'ec-only';
  return isAndroid(userAgent) ? 'ec-only' : 'ours';
}

/*
   Amplitude is withheld on the compatibility route, and the reason is worth
   stating where it is missed rather than only in settings.
*/
export function amplitudeUnavailableReason(
  profile: CaptureProfile,
  userAgent: string,
): string | null {
  if (profile !== 'ec-only') return null;
  /* Naming the platform is the honest form on the device this ships to, but
     the route can be forced anywhere, and saying "Android" on a Mac would be
     a plain falsehood. */
  return isAndroid(userAgent)
    ? 'Not available on Android at this time'
    : 'Not available on this route at this time';
}
