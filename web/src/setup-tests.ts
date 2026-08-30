/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import '@testing-library/jest-dom/vitest';

/*
   Node 26 ships an experimental global `localStorage` that is undefined unless
   the process is started with --localstorage-file. Its presence stops jsdom
   from installing its own, so under Node 26 a jsdom environment has no web
   storage at all — `typeof localStorage` is "undefined" even though `document`
   is fine.

   Browsers are unaffected; this is a test-environment gap, and the code under
   test already treats storage as something that can fail (device-manager wraps
   every access in try/catch, because private browsing and exhausted quotas are
   real). So the fix belongs here rather than in the app.

   Implemented as a class so `Storage.prototype` exists: one test spies on
   `Storage.prototype.setItem` to prove a throwing storage cannot break capture,
   and a plain object literal would give it nothing to attach to.
*/
if (typeof globalThis.localStorage === 'undefined') {
  class MemoryStorage {
    private map = new Map<string, string>();

    get length(): number {
      return this.map.size;
    }
    key(i: number): string | null {
      return Array.from(this.map.keys())[i] ?? null;
    }
    getItem(k: string): string | null {
      return this.map.has(k) ? (this.map.get(k) as string) : null;
    }
    setItem(k: string, v: string): void {
      this.map.set(String(k), String(v));
    }
    removeItem(k: string): void {
      this.map.delete(k);
    }
    clear(): void {
      this.map.clear();
    }
  }

  const g = globalThis as unknown as Record<string, unknown>;
  g.Storage ??= MemoryStorage;
  g.localStorage = new MemoryStorage();
  g.sessionStorage = new MemoryStorage();
}
