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
*/
export function amplitudeCaveat(profile: CaptureProfile, userAgent: string): string | null {
  if (profile !== 'ec-only') return null;
  return isChromiumAndroid(userAgent) ? 'May be inaccurate in this browser' : null;
}
