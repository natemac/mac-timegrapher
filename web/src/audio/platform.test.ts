/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { hasInputGainControl } from './platform';

/* Verbatim from the three diagnostic exports taken minutes apart on one
   movement through one USB pickup — the readings that prompted this. */
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15';
const MACBOOK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0';

describe('whether the input level can be turned down', () => {
  it('can on a laptop, which is where the gain is applied and left high', () => {
    expect(hasInputGainControl(MACBOOK, 0)).toBe(true);
    expect(hasInputGainControl('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140', 0)).toBe(true);
    expect(hasInputGainControl('Mozilla/5.0 (X11; Linux x86_64) Firefox/153.0', 0)).toBe(true);
  });

  it('cannot on a phone or tablet, where no such control exists', () => {
    expect(hasInputGainControl(IPHONE, 5)).toBe(false);
    expect(hasInputGainControl('Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) Safari/604.1', 5)).toBe(false);
    expect(hasInputGainControl('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile', 5)).toBe(false);
  });

  /*
     The one that cannot be done by user agent alone. Since iPadOS 13 an iPad
     in Safari calls itself Macintosh — the string above is copied from a real
     iPad Air export and is byte-identical in shape to a Mac's. Touch points
     are the only thing that separates them, because no Mac reports any.
  */
  it('tells an iPad from a Mac, which claim the same user agent', () => {
    expect(hasInputGainControl(IPAD, 5)).toBe(false);
    expect(hasInputGainControl(IPAD, 0)).toBe(true);
  });

  it('assumes a control rather than none when it cannot tell', () => {
    // Advice that turns out to be unavailable is a smaller failure than
    // staying silent while the input clips.
    expect(hasInputGainControl('', 0)).toBe(true);
  });
});
