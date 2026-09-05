/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  isAndroid, isChromiumAndroid, resolveCaptureProfile, amplitudeCaveat,
} from './capture-route';

const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:109.0) Gecko/109.0 Firefox/121.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/152.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36';

describe('which route a device gets', () => {
  /*
     Android binds a chosen input only on its communication route, so a USB
     pickup is unreachable without echo cancellation. It is the platform, not
     one browser: first reported on a Pixel 9 Pro where Chrome and Firefox both
     failed to reach the pickup, then reproduced on a Pixel 3 XL. Everywhere
     else the direct route works and measures amplitude.
  */
  it('picks the compatibility route on Android', () => {
    expect(resolveCaptureProfile(ANDROID)).toBe('ec-only');
  });

  it('picks it for Firefox on Android too, which also could not reach a pickup', () => {
    expect(resolveCaptureProfile(FIREFOX_ANDROID)).toBe('ec-only');
  });

  it('leaves every other platform on the direct route', () => {
    for (const ua of [IPHONE, IPAD, MAC]) {
      expect(resolveCaptureProfile(ua)).toBe('ours');
    }
  });

  /* iPadOS reports itself as a Macintosh, which is exactly the kind of
     ambiguity that breaks user-agent tests — but it never claims Android. */
  it('does not mistake an iPad for Android', () => {
    expect(isAndroid(IPAD)).toBe(false);
    expect(isAndroid(ANDROID)).toBe(true);
  });

});

const SAMSUNG = 'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';
const EDGE_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0';

describe('which Android browsers share the affected audio backend', () => {
  /*
     The gain control that spoils amplitude was measured on Chrome for Android.
     Firefox on Android, same handset and same USB adapter, reports a clean
     signal 24-27 dB over the room with no clipping and a rate that settles —
     so this belongs to one browser's backend, not to the platform.
  */
  it('counts Chrome and the browsers built on it', () => {
    for (const ua of [ANDROID, SAMSUNG, EDGE_ANDROID]) {
      expect(isChromiumAndroid(ua)).toBe(true);
    }
  });

  it('does not count Firefox on Android, which is unaffected', () => {
    expect(isAndroid(FIREFOX_ANDROID)).toBe(true);
    expect(isChromiumAndroid(FIREFOX_ANDROID)).toBe(false);
  });

  it('does not count desktop Chrome, where amplitude is correct', () => {
    expect(isChromiumAndroid(MAC)).toBe(false);
  });
});

describe('warning about an amplitude rather than hiding it', () => {
  /* Shown either way: a reading with a caveat can be checked against another
     device, a blank cannot be checked against anything. */
  it('warns on Chrome for Android, on the route where it was measured', () => {
    expect(amplitudeCaveat('ec-only', ANDROID)).toBe('May be inaccurate in this browser');
  });

  it('says nothing on Firefox for Android', () => {
    expect(amplitudeCaveat('ec-only', FIREFOX_ANDROID)).toBeNull();
  });

  it('says nothing on the direct route, which was never affected', () => {
    expect(amplitudeCaveat('ours', ANDROID)).toBeNull();
    expect(amplitudeCaveat('ours', MAC)).toBeNull();
  });
});
