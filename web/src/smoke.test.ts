/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs in a DOM environment', () => {
    expect(typeof document).toBe('object');
    expect(typeof localStorage).toBe('object');
  });
});
