/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import {
  isAndroid, resolveCaptureProfile, amplitudeUnavailableReason,
} from './capture-route';

const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/152.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36';

describe('which route a device gets', () => {
  /*
     Android binds a chosen input only on its communication route, so a USB
     pickup is unreachable without echo cancellation. Everywhere else the
     direct route works and measures amplitude, so it stays the default.
  */
  it('picks the compatibility route on Android', () => {
    expect(resolveCaptureProfile('auto', ANDROID)).toBe('ec-only');
  });

  it('leaves every other platform on the direct route', () => {
    for (const ua of [IPHONE, IPAD, MAC]) {
      expect(resolveCaptureProfile('auto', ua)).toBe('ours');
    }
  });

  /* iPadOS reports itself as a Macintosh, which is exactly the kind of
     ambiguity that breaks user-agent tests — but it never claims Android. */
  it('does not mistake an iPad for Android', () => {
    expect(isAndroid(IPAD)).toBe(false);
    expect(isAndroid(ANDROID)).toBe(true);
  });

  /* The override is the safety valve: a platform behaviour may change, and
     being wrong about it must never leave someone unable to measure. */
  it('honours an explicit override in both directions', () => {
    expect(resolveCaptureProfile('direct', ANDROID)).toBe('ours');
    expect(resolveCaptureProfile('compatibility', MAC)).toBe('ec-only');
  });
});

describe('telling the reader amplitude is missing', () => {
  it('gives a reason on the compatibility route', () => {
    expect(amplitudeUnavailableReason('ec-only')).toBe('Not measurable on this route');
  });

  it('says nothing on the direct route, where amplitude is real', () => {
    expect(amplitudeUnavailableReason('ours')).toBeNull();
  });
});
