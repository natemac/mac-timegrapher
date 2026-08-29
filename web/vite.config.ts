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

export default defineConfig({
  // The app is served from a subdirectory of macwatches.com, not the root.
  base: '/tools/timegrapher/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/setup-tests.ts'],
  },
});
