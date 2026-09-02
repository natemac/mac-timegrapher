/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
// Imported from vitest/config, not vite: Vite's own UserConfig type has no
// `test` property, so `tsc` would reject this file during `npm run build`.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/*
   The version stamp: the build's own date and time, YYMMDD-HHMM.

   Central time, deliberately and regardless of where the build runs, so two
   builds an hour apart always sort in the order they were made — a stamp that
   followed the builder's zone would jump backwards the first time it was built
   from another machine. Twenty-four hour, zero-padded, hourCycle h23 because
   hour12:false renders midnight as 24 in some engines.
*/
function buildVersion(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${at('year')}${at('month')}${at('day')}-${at('hour')}${at('minute')}`;
}

export default defineConfig({
  // The production deploy serves the app from a subdirectory, not the root,
  // so that stays the default. A fork serving it elsewhere overrides it at
  // build time: VITE_BASE=/ npm run build
  base: process.env.VITE_BASE ?? '/tools/timegrapher/',
  plugins: [react()],
  // Frozen into the bundle at build time, so what is on screen identifies the
  // build being served rather than the moment the page was opened.
  define: { __BUILD_VERSION__: JSON.stringify(buildVersion()) },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/setup-tests.ts'],
  },
});
