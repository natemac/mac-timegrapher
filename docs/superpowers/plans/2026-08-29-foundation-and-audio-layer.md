# Foundation and Audio Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the public GPLv2 `mac-timegrapher` repository and a browser audio capture layer that proves the C-Media USB timegrapher delivers usable watch tick impulses, producing the WAV fixture corpus the WebAssembly DSP port will be validated against.

**Architecture:** A Vite + React + TypeScript app under `web/`, sitting alongside upstream's retained C source in `src/`. Audio flows `getUserMedia` → `AudioContext` (at the device's true rate) → `AudioWorkletProcessor` → Float32 blocks on the main thread, fanning out to a level meter, a waveform canvas, and a WAV recorder. Signal-processing logic is written as pure functions over `Float32Array` so it is unit-testable without hardware; only lifecycle glue touches browser APIs.

**Tech Stack:** TypeScript, React, Vite, Vitest + jsdom, Web Audio API (`AudioWorklet`), HTML Canvas. No WebAssembly, no Emscripten in this milestone.

**Spec:** `docs/superpowers/specs/2026-08-29-mac-timegrapher-foundation-design.md`

## Global Constraints

These apply to every task. Values are copied verbatim from the spec.

- **License:** GPL **version 2 only**. Never add a GPLv3-only dependency. Never relicense.
- **Every new source file** (`.ts`, `.tsx`, `.js`, `.css`) carries a GPLv2 header naming MAC Bespoke Watch Co. and the year 2026.
- **Every modified upstream C file** keeps its original header and gains a line: `Modified 2026-08-29 by MAC Bespoke Watch Co.`
- **Audio constraints must be:** `echoCancellation: false`, `autoGainControl: false`, `noiseSuppression: false`. Never rely on browser defaults.
- **AudioContext must be constructed at the device's reported sample rate**, and the actual `AudioContext.sampleRate` must be displayed in the UI.
- **Recordings are 32-bit IEEE float WAV** (`WAVE_FORMAT_IEEE_FLOAT`, format code 3), never 16-bit.
- **Vite `base` is `/tools/timegrapher/`.**
- **Build output (`web/dist/`) is never committed to the private `natemac/site` repository.**
- **The deployed app must carry a visible "Open source (GPLv2) — view source" link** to the GitHub repository. This discharges GPLv2 §3 for browser-delivered code.
- **Terminology:** the product is a *timegrapher*, never a *regulator*.
- **Branch:** all work lands on `foundation-and-audio-layer`. `main` stays at upstream tip until merge.
- **Node:** v22.19.0, npm 10.9.3 (already installed).

---

## File Structure

| File | Responsibility |
|---|---|
| `NOTICE` | Attribution to Mamino and Grigera; fork record |
| `README.md` | Rewritten for the web app; "Relationship to TG" section |
| `docs/licensing.md` | GPLv2 §2(a) modification log |
| `docs/hardware-compatibility.md` | Per-browser and per-device verification results |
| `web/package.json`, `web/vite.config.ts`, `web/tsconfig*.json` | Build and test config |
| `web/public/capture-worklet.js` | `AudioWorkletProcessor`; buffers 2048 frames, posts copies |
| `web/src/audio/level-meter.ts` | Pure: peak, RMS, dBFS, clip detection |
| `web/src/audio/wav-recorder.ts` | Pure: 32-bit float WAV encode/decode + accumulator |
| `web/src/audio/device-manager.ts` | Permission, enumeration, selection persistence and fallback |
| `web/src/audio/audio-engine.ts` | Constraint construction, applied-constraint verification, capture lifecycle |
| `web/src/components/*.tsx` | PermissionGate, DeviceSelector, LevelMeter, WaveformCanvas, RecorderPanel, SourceFooter |
| `web/src/styles/tokens.css` | Colour and type tokens matching the main site |
| `web/src/App.tsx` | Wiring and error-state presentation |

Tasks 3–5 are pure functions with no browser dependency. Task 6 isolates the untestable browser glue behind two pure helpers so the critical constraint logic is still covered by tests.

---

### Task 1: Licensing and repository foundation

**Files:**
- Create: `NOTICE`, `docs/licensing.md`, `docs/hardware-compatibility.md`
- Modify: `README.md` (full rewrite), `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: the compliance artefacts every later task's headers refer to

- [ ] **Step 1: Verify the upstream LICENSE is untouched**

```bash
cd "/Users/nathanmcgraw/Documents/Mac Bespoke Watch Co/mac-timegrapher"
git diff upstream/master -- LICENSE
```

Expected: no output. The GPLv2 text must stay byte-identical to upstream.

- [ ] **Step 2: Create `NOTICE`**

```
MAC Bespoke Web Timegrapher
Copyright (C) 2026 MAC Bespoke Watch Co.

This program is a derivative work of "tg", a desktop timegrapher for
mechanical watches.

    tg
    Copyright (C) 2015-2016 Marcello Mamino <vacaboja@gmail.com>
    https://github.com/vacaboja/tg

Subsequent maintenance of tg was carried out by Alejandro Grigera:

    https://github.com/agrigera/tg

This work was forked from agrigera/tg at commit cdbeee8 on 2026-08-29.

tg is licensed under the GNU General Public License, version 2 only.
This derivative work is likewise licensed under the GNU General Public
License, version 2 only. See the LICENSE file for the full text.

The signal-processing core of this program is derived from tg's src/algo.c
and src/computer.c. A record of modifications is kept in docs/licensing.md,
and the complete revision history of both the original and this derivative
work is preserved in this repository's git history.
```

- [ ] **Step 3: Create `docs/licensing.md`**

```markdown
# Licensing and modification record

## License

GNU General Public License, **version 2 only**. Upstream `tg` headers read
"under the terms of the GNU General Public License version 2 as published by
the Free Software Foundation" with no "or later" clause, so this work cannot
be relicensed to GPLv3 and cannot link GPLv3-only code.

## Why this file exists

GPLv2 §2(a) requires modified files to carry prominent notices stating that
they were changed, and the date of change. This file is the human-readable
index of those changes. The authoritative record is the git history: this
repository is seeded from upstream's full 236-commit history (2015-08-22 to
2026-03-22), with our commits on top.

## Distribution and source availability

Serving compiled WebAssembly to a visitor's browser is distribution under
GPLv2 §3. The deployed application therefore carries a visible
"Open source (GPLv2) — view source" link to this repository on every page.

## Boundary with proprietary code

The entire web timegrapher is GPLv2 and public. MAC Bespoke's business logic
(build numbers, customer records, inventory, pricing, QC thresholds) lives in
a separate private PHP application and communicates only over authenticated
HTTP. That is a process and network boundary between two separately-usable
programs, not a module split inside one bundle.

## Modification log

| Date | Change | Files |
|---|---|---|
| 2026-08-29 | Forked from agrigera/tg at cdbeee8 | — |
| 2026-08-29 | Added web application foundation and browser audio capture layer. No upstream C source modified. | `web/**`, `NOTICE`, `README.md`, `docs/**` |
```

- [ ] **Step 4: Rewrite `README.md`**

```markdown
# MAC Bespoke Web Timegrapher

A browser-based timegrapher for mechanical watches. It listens to a movement
through any audio input — a USB timegrapher, a contact microphone, or a
built-in mic — and measures rate, amplitude, beat error and beat frequency.

No install, no drivers, no native application. All signal processing runs
locally in the browser; audio never leaves the machine.

**Live: https://macwatches.com/tools/timegrapher**

## Status

Under development. Current milestone: browser audio capture and hardware
verification. Measurement is not yet implemented — see
[docs/build-plan.md](docs/build-plan.md) for the roadmap.

## Relationship to tg

This is a derivative work of [tg](https://github.com/vacaboja/tg) by Marcello
Mamino, via [agrigera/tg](https://github.com/agrigera/tg). tg is a native GTK
desktop application; this project preserves its proven timing-analysis
algorithm while replacing the native audio and interface layers with
browser-native equivalents.

Upstream's C source is retained under `src/` and remains buildable. It is not
part of the web build, but it provides the reference implementation that the
ported algorithm is validated against.

See [NOTICE](NOTICE) for attribution and [docs/licensing.md](docs/licensing.md)
for the modification record.

## License

GNU General Public License, version 2 only. See [LICENSE](LICENSE).

## Development

    cd web
    npm install
    npm run dev      # http://localhost:5173
    npm test

Building the original native application still requires GTK+3, GLib, PortAudio,
FFTW3f, autoconf, automake and libtool; see `docs/` for those instructions.
```

- [ ] **Step 5: Append web entries to `.gitignore`**

Upstream's `.gitignore` already ignores `build`, `*.log` and dotfiles. Append:

```
# web application
/web/node_modules
/web/dist
/web/coverage
```

- [ ] **Step 6: Create `docs/hardware-compatibility.md` with the empty results table**

```markdown
# Hardware and browser compatibility

Results are recorded as they are verified on real hardware. An empty cell means
untested, not unsupported.

## Test device

- **Device:** USB PnP Sound Device
- **Manufacturer:** C-Media Electronics Inc.
- **USB Vendor ID:** `0x0d8c`
- **USB Product ID:** `0x013c`

## Results

| Browser | OS | Appears in list | Opens stream | Actual rate | AGC/NS disabled | Ticks visible | WAV clean |
|---|---|---|---|---|---|---|---|
| Chrome | macOS | | | | | | |
| Safari | macOS | | | | | | |
| Chrome | Windows | | | | | | |
| Edge | Windows | | | | | | |
| Chrome | Android | | | | | | |
| Safari | iPadOS | | | | | | |

## Notes

Record any browser that refuses to honour `autoGainControl: false` or
`noiseSuppression: false`. Amplitude measurement is unreliable on such a
browser, and the app warns the operator at runtime.
```

- [ ] **Step 7: Commit**

```bash
git add NOTICE README.md .gitignore docs/licensing.md docs/hardware-compatibility.md
git commit -m "docs: add GPLv2 attribution, modification record and web README

Establishes compliance artefacts for the fork: NOTICE crediting Marcello
Mamino and Alejandro Grigera, a GPLv2 section 2(a) modification log, and a
README rewritten for the web application. LICENSE is unchanged from upstream.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Web application skeleton

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/vite-env.d.ts`
- Test: `web/src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` (Vitest, jsdom) and `npm run build` emitting to `web/dist/` with base `/tools/timegrapher/`

- [ ] **Step 1: Scaffold the app**

```bash
cd "/Users/nathanmcgraw/Documents/Mac Bespoke Watch Co/mac-timegrapher"
npm create vite@latest web -- --template react-ts
cd web
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Record the versions actually installed**

```bash
node -p "const p=require('./package.json');JSON.stringify({...p.dependencies,...p.devDependencies},null,2)"
```

Paste the output into the commit message in Step 8. Do not hand-edit version ranges; use what npm resolved.

- [ ] **Step 3: Write `web/vite.config.ts`**

```ts
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
  },
});
```

- [ ] **Step 4: Add the test script to `web/package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write the failing smoke test**

Create `web/src/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs in a DOM environment', () => {
    expect(typeof document).toBe('object');
    expect(typeof localStorage).toBe('object');
  });
});
```

- [ ] **Step 6: Run the test**

Run: `cd web && npm test`
Expected: PASS, 1 test. If it fails with "document is not defined", `environment: 'jsdom'` is not being picked up — check that `vite.config.ts` is the file Vitest is reading.

- [ ] **Step 7: Verify the build emits the correct base path**

```bash
cd web && npm run build && grep -o '/tools/timegrapher/[^"]*' dist/index.html | head
```

Expected: asset paths beginning `/tools/timegrapher/`. If they begin `/`, the `base` setting is wrong.

- [ ] **Step 8: Commit**

```bash
cd "/Users/nathanmcgraw/Documents/Mac Bespoke Watch Co/mac-timegrapher"
git add web/
git commit -m "build: scaffold Vite + React + TypeScript app with Vitest

Base path is /tools/timegrapher/ to match the deployment target. Tests run
under jsdom so audio modules can be exercised without a browser.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Level meter

**Files:**
- Create: `web/src/audio/level-meter.ts`
- Test: `web/src/audio/level-meter.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface LevelReading { peak: number; rms: number; peakDb: number; rmsDb: number; clipped: boolean }`
  - `function toDb(linear: number): number`
  - `function measureLevel(block: Float32Array): LevelReading`

- [ ] **Step 1: Write the failing test**

Create `web/src/audio/level-meter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { measureLevel, toDb } from './level-meter';

function sine(amplitude: number, frames: number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = amplitude * Math.sin((2 * Math.PI * i) / frames);
  return out;
}

describe('toDb', () => {
  it('maps full scale to 0 dBFS', () => expect(toDb(1)).toBeCloseTo(0, 6));
  it('maps half scale to about -6 dBFS', () => expect(toDb(0.5)).toBeCloseTo(-6.0206, 3));
  it('maps silence to negative infinity', () => expect(toDb(0)).toBe(-Infinity));
});

describe('measureLevel', () => {
  it('reports silence as zero and -Infinity dB', () => {
    const r = measureLevel(new Float32Array(1024));
    expect(r.peak).toBe(0);
    expect(r.rms).toBe(0);
    expect(r.peakDb).toBe(-Infinity);
    expect(r.clipped).toBe(false);
  });

  it('reports the peak of a 0.5 amplitude sine', () => {
    expect(measureLevel(sine(0.5, 1024)).peak).toBeCloseTo(0.5, 3);
  });

  it('reports RMS of a sine as amplitude over root two', () => {
    // A sine's RMS is A/sqrt(2). This is the check that catches a mean-of-
    // absolute-values implementation masquerading as RMS.
    expect(measureLevel(sine(0.5, 1024)).rms).toBeCloseTo(0.5 / Math.SQRT2, 3);
  });

  it('flags clipping at full scale', () => {
    const block = new Float32Array([0.1, 1.0, -0.2]);
    expect(measureLevel(block).clipped).toBe(true);
  });

  it('flags samples beyond full scale', () => {
    expect(measureLevel(new Float32Array([0.1, -1.4])).clipped).toBe(true);
  });

  it('does not flag clipping just below full scale', () => {
    expect(measureLevel(new Float32Array([0.999, -0.999])).clipped).toBe(false);
  });

  it('returns zeroes rather than NaN for an empty block', () => {
    const r = measureLevel(new Float32Array(0));
    expect(r.rms).toBe(0);
    expect(Number.isNaN(r.rms)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/audio/level-meter.test.ts`
Expected: FAIL — cannot resolve `./level-meter`.

- [ ] **Step 3: Implement**

Create `web/src/audio/level-meter.ts`:

```ts
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

export interface LevelReading {
  /** Highest absolute sample in the block, linear. May exceed 1 when clipping. */
  peak: number;
  /** Root mean square of the block, linear. */
  rms: number;
  /** Peak in dBFS. -Infinity for silence. */
  peakDb: number;
  /** RMS in dBFS. -Infinity for silence. */
  rmsDb: number;
  /** True when any sample reached or exceeded full scale. */
  clipped: boolean;
}

export function toDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

export function measureLevel(block: Float32Array): LevelReading {
  let peak = 0;
  let sumSquares = 0;

  for (let i = 0; i < block.length; i++) {
    const sample = block[i];
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
    sumSquares += sample * sample;
  }

  const rms = block.length > 0 ? Math.sqrt(sumSquares / block.length) : 0;

  return { peak, rms, peakDb: toDb(peak), rmsDb: toDb(rms), clipped: peak >= 1 };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/audio/level-meter.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/audio/level-meter.ts web/src/audio/level-meter.test.ts
git commit -m "feat(audio): add level meter with peak, RMS and clip detection

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: WAV recorder

**Files:**
- Create: `web/src/audio/wav-recorder.ts`
- Test: `web/src/audio/wav-recorder.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface WavData { samples: Float32Array; sampleRate: number; channelCount: number }`
  - `function encodeWavFloat32(data: WavData): ArrayBuffer`
  - `function decodeWavFloat32(buffer: ArrayBuffer): WavData`
  - `class WavRecorder` with `push(block)`, `reset()`, `toWav()`, `frameCount`, `durationSeconds`

- [ ] **Step 1: Write the failing test**

Create `web/src/audio/wav-recorder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeWavFloat32, decodeWavFloat32, WavRecorder } from './wav-recorder';

function ascii(buffer: ArrayBuffer, offset: number, length: number): string {
  return String.fromCharCode(...new Uint8Array(buffer, offset, length));
}

describe('encodeWavFloat32', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 0.999]);

  it('writes a RIFF/WAVE container', () => {
    const buf = encodeWavFloat32({ samples, sampleRate: 48000, channelCount: 1 });
    expect(ascii(buf, 0, 4)).toBe('RIFF');
    expect(ascii(buf, 8, 4)).toBe('WAVE');
  });

  it('declares IEEE float format, not PCM', () => {
    const buf = encodeWavFloat32({ samples, sampleRate: 48000, channelCount: 1 });
    const view = new DataView(buf);
    // fmt chunk body starts at 20; first field is the format code.
    // 3 is WAVE_FORMAT_IEEE_FLOAT. 1 would be integer PCM and is wrong here:
    // these files are DSP reference fixtures and must not be quantised.
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(34, true)).toBe(32); // bits per sample
  });

  it('declares the RIFF size as total length minus eight', () => {
    const buf = encodeWavFloat32({ samples, sampleRate: 48000, channelCount: 1 });
    expect(new DataView(buf).getUint32(4, true)).toBe(buf.byteLength - 8);
  });
});

describe('round trip', () => {
  it('preserves sample values exactly', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.999, -1, 1]);
    const out = decodeWavFloat32(encodeWavFloat32({ samples, sampleRate: 44100, channelCount: 1 }));
    expect(Array.from(out.samples)).toEqual(Array.from(samples));
  });

  it('preserves the sample rate', () => {
    const out = decodeWavFloat32(
      encodeWavFloat32({ samples: new Float32Array([0.1]), sampleRate: 44100, channelCount: 1 }),
    );
    expect(out.sampleRate).toBe(44100);
  });

  it('preserves a non-default sample rate', () => {
    const out = decodeWavFloat32(
      encodeWavFloat32({ samples: new Float32Array([0.1]), sampleRate: 96000, channelCount: 1 }),
    );
    expect(out.sampleRate).toBe(96000);
  });

  it('preserves the channel count', () => {
    const out = decodeWavFloat32(
      encodeWavFloat32({ samples: new Float32Array([0.1, 0.2]), sampleRate: 48000, channelCount: 2 }),
    );
    expect(out.channelCount).toBe(2);
  });

  it('handles an empty recording', () => {
    const out = decodeWavFloat32(
      encodeWavFloat32({ samples: new Float32Array(0), sampleRate: 48000, channelCount: 1 }),
    );
    expect(out.samples.length).toBe(0);
  });
});

describe('decodeWavFloat32', () => {
  it('rejects a non-RIFF buffer', () => {
    expect(() => decodeWavFloat32(new ArrayBuffer(64))).toThrow(/RIFF/);
  });
});

describe('WavRecorder', () => {
  it('starts empty', () => {
    const r = new WavRecorder(48000, 1);
    expect(r.frameCount).toBe(0);
    expect(r.durationSeconds).toBe(0);
  });

  it('accumulates blocks in order', () => {
    const r = new WavRecorder(48000, 1);
    r.push(new Float32Array([0.1, 0.2]));
    r.push(new Float32Array([0.3]));
    expect(Array.from(decodeWavFloat32(r.toWav()).samples)).toEqual([
      expect.closeTo(0.1, 6), expect.closeTo(0.2, 6), expect.closeTo(0.3, 6),
    ]);
  });

  it('copies incoming blocks so later mutation cannot corrupt the recording', () => {
    // The AudioWorklet reuses its render-quantum buffer. Storing the reference
    // rather than a copy silently overwrites already-recorded audio.
    const r = new WavRecorder(48000, 1);
    const reused = new Float32Array([0.1, 0.2]);
    r.push(reused);
    reused[0] = 0.9;
    expect(decodeWavFloat32(r.toWav()).samples[0]).toBeCloseTo(0.1, 6);
  });

  it('reports duration from frame count and sample rate', () => {
    const r = new WavRecorder(48000, 1);
    r.push(new Float32Array(24000));
    expect(r.durationSeconds).toBeCloseTo(0.5, 6);
  });

  it('reports duration correctly for stereo', () => {
    const r = new WavRecorder(48000, 2);
    r.push(new Float32Array(48000)); // 24000 frames of 2 channels
    expect(r.durationSeconds).toBeCloseTo(0.5, 6);
  });

  it('clears on reset', () => {
    const r = new WavRecorder(48000, 1);
    r.push(new Float32Array([0.1]));
    r.reset();
    expect(r.frameCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/audio/wav-recorder.test.ts`
Expected: FAIL — cannot resolve `./wav-recorder`.

- [ ] **Step 3: Implement**

Create `web/src/audio/wav-recorder.ts`:

```ts
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/** WAVE_FORMAT_IEEE_FLOAT. Format 1 would be integer PCM. */
const FORMAT_IEEE_FLOAT = 3;
const BYTES_PER_SAMPLE = 4;

export interface WavData {
  samples: Float32Array;
  sampleRate: number;
  channelCount: number;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

/**
 * Encode as 32-bit IEEE float WAV. Uses the 18-byte fmt chunk plus a fact
 * chunk, which is what the WAVE spec requires for non-PCM formats.
 */
export function encodeWavFloat32({ samples, sampleRate, channelCount }: WavData): ArrayBuffer {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  // 12 header + (8 + 18) fmt + (8 + 4) fact + (8 + data)
  const buffer = new ArrayBuffer(12 + 26 + 12 + 8 + dataBytes);
  const view = new DataView(buffer);
  let o = 0;

  writeAscii(view, o, 'RIFF'); o += 4;
  view.setUint32(o, buffer.byteLength - 8, true); o += 4;
  writeAscii(view, o, 'WAVE'); o += 4;

  writeAscii(view, o, 'fmt '); o += 4;
  view.setUint32(o, 18, true); o += 4;
  view.setUint16(o, FORMAT_IEEE_FLOAT, true); o += 2;
  view.setUint16(o, channelCount, true); o += 2;
  view.setUint32(o, sampleRate, true); o += 4;
  view.setUint32(o, sampleRate * channelCount * BYTES_PER_SAMPLE, true); o += 4;
  view.setUint16(o, channelCount * BYTES_PER_SAMPLE, true); o += 2;
  view.setUint16(o, 32, true); o += 2;
  view.setUint16(o, 0, true); o += 2; // cbSize

  writeAscii(view, o, 'fact'); o += 4;
  view.setUint32(o, 4, true); o += 4;
  view.setUint32(o, channelCount > 0 ? samples.length / channelCount : 0, true); o += 4;

  writeAscii(view, o, 'data'); o += 4;
  view.setUint32(o, dataBytes, true); o += 4;
  for (let i = 0; i < samples.length; i++) {
    view.setFloat32(o, samples[i], true);
    o += 4;
  }

  return buffer;
}

/** Parse a 32-bit float WAV. Walks chunks rather than assuming fixed offsets. */
export function decodeWavFloat32(buffer: ArrayBuffer): WavData {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }

  let format = 0;
  let bitsPerSample = 0;
  let sampleRate = 0;
  let channelCount = 0;
  let samples: Float32Array | null = null;

  let o = 12;
  while (o + 8 <= buffer.byteLength) {
    const id = readAscii(view, o, 4);
    const size = view.getUint32(o + 4, true);
    const body = o + 8;

    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      const count = Math.floor(size / BYTES_PER_SAMPLE);
      samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = view.getFloat32(body + i * BYTES_PER_SAMPLE, true);
    }

    o = body + size + (size % 2); // RIFF chunks are word-aligned
  }

  if (format !== FORMAT_IEEE_FLOAT || bitsPerSample !== 32) {
    throw new Error(`Expected 32-bit IEEE float, got format ${format} at ${bitsPerSample}-bit`);
  }
  if (samples === null) throw new Error('No data chunk');

  return { samples, sampleRate, channelCount };
}

/** Accumulates captured blocks and encodes them on demand. */
export class WavRecorder {
  private blocks: Float32Array[] = [];
  private frames = 0;

  constructor(
    readonly sampleRate: number,
    readonly channelCount: number,
  ) {}

  /** Copies the block. The worklet reuses its buffer between render quanta. */
  push(block: Float32Array): void {
    this.blocks.push(new Float32Array(block));
    this.frames += block.length;
  }

  get frameCount(): number {
    return this.frames;
  }

  get durationSeconds(): number {
    const divisor = this.sampleRate * this.channelCount;
    return divisor > 0 ? this.frames / divisor : 0;
  }

  reset(): void {
    this.blocks = [];
    this.frames = 0;
  }

  toWav(): ArrayBuffer {
    const all = new Float32Array(this.frames);
    let offset = 0;
    for (const block of this.blocks) {
      all.set(block, offset);
      offset += block.length;
    }
    return encodeWavFloat32({ samples: all, sampleRate: this.sampleRate, channelCount: this.channelCount });
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/audio/wav-recorder.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Verify a real decoder accepts the output**

The round-trip test only proves the encoder agrees with our own decoder. Confirm an independent tool agrees:

The script must live inside `web/` so that its relative import resolves — ESM
resolves `./src/...` against the importing file's own directory, not the shell's
working directory.

```bash
cd web && cat > wavcheck.mjs <<'EOF'
import { encodeWavFloat32 } from './src/audio/wav-recorder.ts';
import { writeFileSync } from 'node:fs';
const n = 48000, s = new Float32Array(n);
for (let i = 0; i < n; i++) s[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / 48000);
writeFileSync('/tmp/wavcheck.wav', Buffer.from(encodeWavFloat32({ samples: s, sampleRate: 48000, channelCount: 1 })));
EOF
npx vite-node wavcheck.mjs || npx tsx wavcheck.mjs
afinfo /tmp/wavcheck.wav
rm wavcheck.mjs
```

Expected: `afinfo` (built into macOS) reports 48000 Hz, 1 channel, 32-bit float, 1.000 sec. If `afinfo` errors, the header is malformed regardless of what the round-trip test says.

If neither `vite-node` nor `tsx` can run the script, skip this step and say so
in the report. The round-trip tests remain the primary evidence; this step is
an independent cross-check, not the gate.

- [ ] **Step 6: Commit**

```bash
git add web/src/audio/wav-recorder.ts web/src/audio/wav-recorder.test.ts
git commit -m "feat(audio): add 32-bit float WAV encoder, decoder and recorder

Fixtures are recorded as IEEE float rather than 16-bit PCM because they
become the reference corpus for the DSP port; quantisation artefacts would
be baked into the reference data permanently.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Device manager

**Files:**
- Create: `web/src/audio/device-manager.ts`
- Test: `web/src/audio/device-manager.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface AudioInput { deviceId: string; label: string; groupId: string }`
  - `function requestPermission(): Promise<void>`
  - `function listAudioInputs(): Promise<AudioInput[]>`
  - `function saveSelection(deviceId: string): void`
  - `function loadSelection(): string | null`
  - `function resolveSelection(saved: string | null, available: AudioInput[]): AudioInput | null`

- [ ] **Step 1: Write the failing test**

Create `web/src/audio/device-manager.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveSelection, saveSelection, loadSelection, listAudioInputs, requestPermission,
  type AudioInput,
} from './device-manager';

const usb: AudioInput = { deviceId: 'usb-1', label: 'USB PnP Sound Device', groupId: 'g1' };
const builtin: AudioInput = { deviceId: 'default', label: 'MacBook Pro Microphone', groupId: 'g2' };

describe('resolveSelection', () => {
  it('returns null when nothing is available', () => {
    expect(resolveSelection('usb-1', [])).toBeNull();
  });

  it('returns the saved device when it is still present', () => {
    expect(resolveSelection('usb-1', [builtin, usb])).toEqual(usb);
  });

  it('falls back to the system default when the saved device is gone', () => {
    // Device IDs rotate when permissions are cleared, so a stale saved ID is
    // normal, not exceptional. It must not leave the app with no input.
    expect(resolveSelection('usb-1', [builtin])).toEqual(builtin);
  });

  it('falls back to the first device when there is no default', () => {
    expect(resolveSelection('gone', [usb])).toEqual(usb);
  });

  it('handles never having saved anything', () => {
    expect(resolveSelection(null, [builtin, usb])).toEqual(builtin);
  });
});

describe('selection persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round trips', () => {
    saveSelection('usb-1');
    expect(loadSelection()).toBe('usb-1');
  });

  it('returns null when nothing is stored', () => {
    expect(loadSelection()).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveSelection('usb-1')).not.toThrow();
    spy.mockRestore();
  });
});

describe('listAudioInputs', () => {
  it('returns only audio inputs', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: async () => [
          { kind: 'audioinput', deviceId: 'usb-1', label: 'USB PnP Sound Device', groupId: 'g1' },
          { kind: 'audiooutput', deviceId: 'out-1', label: 'Speakers', groupId: 'g1' },
          { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD', groupId: 'g3' },
        ],
      },
    });
    const inputs = await listAudioInputs();
    expect(inputs).toHaveLength(1);
    expect(inputs[0].label).toBe('USB PnP Sound Device');
  });

  it('substitutes a placeholder for the blank labels shown before permission', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'x', label: '', groupId: 'g' }],
      },
    });
    expect((await listAudioInputs())[0].label).toBe('Unnamed input');
  });
});

describe('requestPermission', () => {
  it('releases the probe stream immediately', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
    });
    await requestPermission();
    // Holding this stream open would keep the recording indicator lit and can
    // lock the device on some platforms.
    expect(stop).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/audio/device-manager.test.ts`
Expected: FAIL — cannot resolve `./device-manager`.

- [ ] **Step 3: Implement**

Create `web/src/audio/device-manager.ts`:

```ts
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

const STORAGE_KEY = 'mac-timegrapher.input-device-id';

export interface AudioInput {
  deviceId: string;
  label: string;
  groupId: string;
}

/**
 * Ask for microphone access, then release the stream. enumerateDevices()
 * returns blank labels until a grant exists, so this must run before the
 * device list can be shown with real names.
 */
export async function requestPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) track.stop();
}

export async function listAudioInputs(): Promise<AudioInput[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Unnamed input', groupId: d.groupId }));
}

export function saveSelection(deviceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, deviceId);
  } catch {
    // Private browsing or a full quota. A forgotten preference is not worth
    // failing the capture over.
  }
}

export function loadSelection(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Pick the device to use: the saved one, else the system default, else the first. */
export function resolveSelection(saved: string | null, available: AudioInput[]): AudioInput | null {
  if (available.length === 0) return null;
  const match = available.find((d) => d.deviceId === saved);
  if (match) return match;
  return available.find((d) => d.deviceId === 'default') ?? available[0];
}
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run src/audio/device-manager.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/audio/device-manager.ts web/src/audio/device-manager.test.ts
git commit -m "feat(audio): add device enumeration, selection and persistence

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Capture worklet and audio engine

**Files:**
- Create: `web/public/capture-worklet.js`, `web/src/audio/audio-engine.ts`
- Test: `web/src/audio/audio-engine.test.ts`

**Interfaces:**
- Consumes: `AudioInput` from `device-manager.ts`
- Produces:
  - `function buildAudioConstraints(deviceId: string): MediaStreamConstraints`
  - `interface ProcessingWarning { setting: string; actual: boolean }`
  - `function checkAppliedProcessing(settings: MediaTrackSettings): ProcessingWarning[]`
  - `interface CaptureSession { context: AudioContext; stream: MediaStream; sampleRate: number; warnings: ProcessingWarning[]; stop(): Promise<void> }`
  - `function startCapture(deviceId: string, onBlock: (block: Float32Array) => void): Promise<CaptureSession>`

- [ ] **Step 1: Write the failing test**

Only the pure helpers are tested here; `startCapture` needs real hardware and is covered by the bench checklist in Task 9. The helpers are where the milestone's critical correctness lives.

Create `web/src/audio/audio-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAudioConstraints, checkAppliedProcessing } from './audio-engine';

describe('buildAudioConstraints', () => {
  const audio = () => buildAudioConstraints('usb-1').audio as MediaTrackConstraints;

  it('pins the exact device rather than letting the browser choose', () => {
    expect(audio().deviceId).toEqual({ exact: 'usb-1' });
  });

  it('disables automatic gain control', () => {
    // AGC continuously rescales the signal. Amplitude is derived from impulse
    // energy, so AGC does not degrade the measurement, it invalidates it.
    expect(audio().autoGainControl).toBe(false);
  });

  it('disables noise suppression', () => {
    // Noise suppression is tuned for speech and classifies watch ticks as
    // noise to be removed.
    expect(audio().noiseSuppression).toBe(false);
  });

  it('disables echo cancellation', () => {
    expect(audio().echoCancellation).toBe(false);
  });

  it('requests a single channel', () => {
    expect(audio().channelCount).toBe(1);
  });

  it('does not request video', () => {
    expect(buildAudioConstraints('usb-1').video).toBe(false);
  });
});

describe('checkAppliedProcessing', () => {
  it('reports nothing when the browser honoured every constraint', () => {
    expect(
      checkAppliedProcessing({ echoCancellation: false, autoGainControl: false, noiseSuppression: false }),
    ).toEqual([]);
  });

  it('reports a warning when AGC was applied anyway', () => {
    const warnings = checkAppliedProcessing({ autoGainControl: true });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].setting).toBe('autoGainControl');
  });

  it('reports every setting the browser overrode', () => {
    const warnings = checkAppliedProcessing({
      echoCancellation: true, autoGainControl: true, noiseSuppression: true,
    });
    expect(warnings.map((w) => w.setting).sort()).toEqual([
      'autoGainControl', 'echoCancellation', 'noiseSuppression',
    ]);
  });

  it('treats an unreported setting as acceptable', () => {
    // Safari omits keys it does not implement. Absence is not evidence of
    // processing, so it must not raise a false alarm.
    expect(checkAppliedProcessing({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/audio/audio-engine.test.ts`
Expected: FAIL — cannot resolve `./audio-engine`.

- [ ] **Step 3: Write the worklet**

Create `web/public/capture-worklet.js`. This is plain JavaScript in `public/`, loaded by URL at runtime, deliberately not a bundled TypeScript module — `AudioWorklet.addModule` fetches a real script and the dev server would otherwise hand it untranspiled TypeScript.

```js
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

// A render quantum is 128 frames, which at 48 kHz would be 375 messages per
// second. Batching to 2048 frames cuts that to about 23.
const CHUNK_FRAMES = 2048;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(CHUNK_FRAMES);
    this._filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true; // no input connected yet; keep the node alive

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._filled++] = channel[i];
      if (this._filled === CHUNK_FRAMES) {
        // slice() copies: the buffer is reused on the next quantum.
        this.port.postMessage(this._buffer.slice(0));
        this._filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
```

- [ ] **Step 4: Implement the engine**

Create `web/src/audio/audio-engine.ts`:

```ts
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

const PROCESSED_SETTINGS = ['echoCancellation', 'autoGainControl', 'noiseSuppression'] as const;

export interface ProcessingWarning {
  setting: string;
  actual: boolean;
}

export interface CaptureSession {
  context: AudioContext;
  stream: MediaStream;
  /** The rate actually in force, which may differ from the rate requested. */
  sampleRate: number;
  warnings: ProcessingWarning[];
  stop(): Promise<void>;
}

/**
 * Browsers apply speech-oriented processing by default. Every one of these
 * must be off: they are tuned to make voices intelligible, which is close to
 * the opposite of preserving a watch's impulse train.
 */
export function buildAudioConstraints(deviceId: string): MediaStreamConstraints {
  return {
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: false,
      channelCount: 1,
    },
    video: false,
  };
}

/** Report any processing the browser applied despite being asked not to. */
export function checkAppliedProcessing(settings: MediaTrackSettings): ProcessingWarning[] {
  const warnings: ProcessingWarning[] = [];
  for (const setting of PROCESSED_SETTINGS) {
    if (settings[setting] === true) warnings.push({ setting, actual: true });
  }
  return warnings;
}

export async function startCapture(
  deviceId: string,
  onBlock: (block: Float32Array) => void,
): Promise<CaptureSession> {
  const stream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));
  const track = stream.getAudioTracks()[0];
  const settings = track.getSettings();
  const warnings = checkAppliedProcessing(settings);

  // Construct at the device's own rate. Omitting this lets the context default
  // to the system rate and silently resample, which would corrupt fixtures.
  const context = settings.sampleRate
    ? new AudioContext({ sampleRate: settings.sampleRate })
    : new AudioContext();

  await context.resume(); // Safari starts contexts suspended

  const workletUrl = `${import.meta.env.BASE_URL}capture-worklet.js`;
  await context.audioWorklet.addModule(workletUrl);

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'capture-processor');
  node.port.onmessage = (event: MessageEvent<Float32Array>) => onBlock(event.data);

  // A worklet is only pulled when its output reaches the destination, so route
  // through a muted gain node rather than playing the watch out of the speakers.
  const silence = context.createGain();
  silence.gain.value = 0;
  source.connect(node);
  node.connect(silence);
  silence.connect(context.destination);

  return {
    context,
    stream,
    sampleRate: context.sampleRate,
    warnings,
    async stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      silence.disconnect();
      for (const t of stream.getTracks()) t.stop();
      await context.close();
    },
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd web && npx vitest run src/audio/audio-engine.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Run the whole suite**

Run: `cd web && npm test`
Expected: PASS, 47 tests across 5 files (smoke 1 + level-meter 10 + wav-recorder 15 + device-manager 11 + audio-engine 10). The gate is that every test passes; treat a differing count as a prompt to check nothing was dropped, not as a failure in itself.

- [ ] **Step 7: Commit**

```bash
git add web/public/capture-worklet.js web/src/audio/audio-engine.ts web/src/audio/audio-engine.test.ts
git commit -m "feat(audio): add capture worklet and AudioContext lifecycle

Disables echo cancellation, AGC and noise suppression, and verifies the
browser honoured that via getSettings(). Constructs the context at the
device's own sample rate so fixtures are not silently resampled.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Interface

**Files:**
- Create: `web/src/styles/tokens.css`, `web/src/components/PermissionGate.tsx`, `web/src/components/DeviceSelector.tsx`, `web/src/components/LevelMeter.tsx`, `web/src/components/WaveformCanvas.tsx`, `web/src/components/RecorderPanel.tsx`, `web/src/components/SourceFooter.tsx`
- Modify: `web/src/App.tsx`, `web/src/main.tsx`, `web/index.html`
- Test: `web/src/components/SourceFooter.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–6
- Produces: the running application

- [ ] **Step 1: Write the failing test for the source link**

The GPLv2 §3 obligation is the one piece of UI that must never regress, so it gets a test. Create `web/src/components/SourceFooter.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceFooter } from './SourceFooter';

describe('SourceFooter', () => {
  it('links to the public source repository', () => {
    render(<SourceFooter />);
    const link = screen.getByRole('link', { name: /view source/i });
    expect(link).toHaveAttribute('href', 'https://github.com/natemac/mac-timegrapher');
  });

  it('names the license', () => {
    render(<SourceFooter />);
    expect(screen.getByText(/GPLv2/)).toBeInTheDocument();
  });

  it('credits the upstream project', () => {
    render(<SourceFooter />);
    expect(screen.getByRole('link', { name: /tg/i })).toBeInTheDocument();
  });
});
```

Add `web/src/setup-tests.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

and register it in `vite.config.ts` under `test`: `setupFiles: ['./src/setup-tests.ts'],`

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd web && npx vitest run src/components/SourceFooter.test.tsx`
Expected: FAIL — cannot resolve `./SourceFooter`.

- [ ] **Step 3: Write the tokens**

Create `web/src/styles/tokens.css`, matching the main site so the tool does not look bolted on. Values are copied from `site/public_html/assets/css/mac.css`.

```css
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.
*/
:root {
  --ink: #0a0b0d;
  --panel: #121417;
  --panel-2: #171a1e;
  --panel-3: #1e2227;
  --line: #262b31;
  --text: #e9ebee;
  --text-dim: #9aa2ab;
  --text-faint: #656d76;
  --accent: #ffffff;
  --accent-ink: #0a0b0d;
  --ok: #4ea87a;
  --warn: #c9974a;
  --bad: #c4635b;
  --radius: 10px;
  --radius-sm: 7px;
  --font: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--ink);
  color: var(--text);
  font-family: var(--font);
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}

.mono { font-family: var(--mono); }
.dim { color: var(--text-dim); }
.warn { color: var(--warn); }
.bad { color: var(--bad); }

button {
  font: inherit;
  padding: 10px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-ink);
  cursor: pointer;
}
button:disabled { opacity: 0.4; cursor: not-allowed; }
button.secondary { background: var(--panel-3); color: var(--text); }

select {
  font: inherit;
  width: 100%;
  padding: 10px;
  background: var(--panel-3);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 4: Write `SourceFooter.tsx`**

```tsx
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.
*/
const REPO = 'https://github.com/natemac/mac-timegrapher';

export function SourceFooter() {
  return (
    <footer className="dim" style={{ fontSize: 13, lineHeight: 1.7, paddingTop: 8 }}>
      <p>
        Open source (GPLv2) — <a href={REPO}>view source</a>. Derived from{' '}
        <a href="https://github.com/vacaboja/tg">tg</a> by Marcello Mamino.
      </p>
      <p>Audio is processed entirely in your browser and never uploaded.</p>
    </footer>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `cd web && npx vitest run src/components/SourceFooter.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Write `PermissionGate.tsx`**

```tsx
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.
*/
interface Props {
  onGrant: () => void;
  error: string | null;
  busy: boolean;
}

export function PermissionGate({ onGrant, error, busy }: Props) {
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Microphone access</h2>
      <p className="dim">
        This tool listens to your watch through an audio input. Nothing is
        recorded or uploaded until you press record, and recordings stay on
        this device.
      </p>
      <button onClick={onGrant} disabled={busy}>
        {busy ? 'Requesting…' : 'Allow microphone'}
      </button>
      {error && <p className="bad">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 7: Write `DeviceSelector.tsx`**

```tsx
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.
*/
import type { AudioInput } from '../audio/device-manager';
import type { ProcessingWarning } from '../audio/audio-engine';

interface Props {
  devices: AudioInput[];
  selectedId: string | null;
  sampleRate: number | null;
  warnings: ProcessingWarning[];
  capturing: boolean;
  onSelect: (deviceId: string) => void;
  onStart: () => void;
  onStop: () => void;
}

export function DeviceSelector({
  devices, selectedId, sampleRate, warnings, capturing, onSelect, onStart, onStop,
}: Props) {
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Audio input</h2>

      {devices.length === 0 ? (
        <p className="bad">No audio inputs found. Connect a device and reload.</p>
      ) : (
        <select
          value={selectedId ?? ''}
          disabled={capturing}
          onChange={(e) => onSelect(e.target.value)}
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={capturing ? onStop : onStart} disabled={devices.length === 0}>
          {capturing ? 'Stop' : 'Start'}
        </button>
        {sampleRate !== null && (
          <span className="mono dim">{sampleRate.toLocaleString()} Hz</span>
        )}
      </div>

      {warnings.length > 0 && (
        <p className="warn" style={{ marginBottom: 0 }}>
          This browser applied {warnings.map((w) => w.setting).join(', ')} despite
          being asked not to. Tick timing is still usable, but amplitude
          measurement from this input will not be trustworthy.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Write `LevelMeter.tsx`**

```tsx
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.
*/
import type { LevelReading } from '../audio/level-meter';

/** Map dBFS onto a 0–100 bar, with a -60 dB floor. */
function toPercent(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export function LevelMeter({ reading }: { reading: LevelReading | null }) {
  const peak = reading ? toPercent(reading.peakDb) : 0;
  const rms = reading ? toPercent(reading.rmsDb) : 0;
  const clipped = reading?.clipped ?? false;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Signal level</h2>
      <div style={{ position: 'relative', height: 18, background: 'var(--panel-3)', borderRadius: 4 }}>
        <div style={{ width: `${rms}%`, height: '100%', background: 'var(--ok)', borderRadius: 4 }} />
        <div style={{
          position: 'absolute', top: 0, left: `${peak}%`, width: 2, height: '100%',
          background: clipped ? 'var(--bad)' : 'var(--text)',
        }} />
      </div>
      <p className="mono dim" style={{ marginBottom: 0, fontSize: 13 }}>
        {reading
          ? `peak ${reading.peakDb === -Infinity ? '−∞' : reading.peakDb.toFixed(1)} dBFS · rms ${
              reading.rmsDb === -Infinity ? '−∞' : reading.rmsDb.toFixed(1)} dBFS`
          : 'not capturing'}
        {clipped && <span className="bad"> · CLIPPING</span>}
      </p>
    </div>
  );
}
```

- [ ] **Step 9: Write `WaveformCanvas.tsx`**

```tsx
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.
*/
import { useEffect, useRef } from 'react';

const HISTORY_FRAMES = 48_000; // roughly one second at 48 kHz

/**
 * Scrolling raw waveform. Watch ticks appear as isolated vertical spikes
 * against a flat floor; that shape is what Phase 0 is looking for.
 */
export function WaveformCanvas({ latest }: { latest: Float32Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef(new Float32Array(HISTORY_FRAMES));
  const writeIndex = useRef(0);

  useEffect(() => {
    if (!latest) return;
    const buf = history.current;
    for (let i = 0; i < latest.length; i++) {
      buf[writeIndex.current] = latest[i];
      writeIndex.current = (writeIndex.current + 1) % HISTORY_FRAMES;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height } = canvas;
    const mid = height / 2;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#262b31';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
    ctx.stroke();

    // One column per pixel, drawn as the min/max envelope of its frames so
    // single-sample impulses cannot be missed by decimation.
    const framesPerColumn = Math.max(1, Math.floor(HISTORY_FRAMES / width));
    ctx.strokeStyle = '#e9ebee';
    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      let min = 1;
      let max = -1;
      for (let f = 0; f < framesPerColumn; f++) {
        const idx = (writeIndex.current + x * framesPerColumn + f) % HISTORY_FRAMES;
        const v = buf[idx];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.moveTo(x + 0.5, mid - max * mid);
      ctx.lineTo(x + 0.5, mid - min * mid);
    }
    ctx.stroke();
  }, [latest]);

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Waveform</h2>
      <canvas ref={canvasRef} width={900} height={220} style={{ width: '100%', height: 220 }} />
      <p className="dim" style={{ marginBottom: 0, fontSize: 13 }}>
        About one second of audio. A healthy movement shows evenly spaced
        impulse pairs.
      </p>
    </div>
  );
}
```

- [ ] **Step 10: Write `RecorderPanel.tsx`**

```tsx
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.
*/
interface Props {
  recording: boolean;
  duration: number;
  canRecord: boolean;
  onStart: () => void;
  onStop: () => void;
  onDownload: () => void;
  hasRecording: boolean;
}

export function RecorderPanel({
  recording, duration, canRecord, onStart, onStop, onDownload, hasRecording,
}: Props) {
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Recording</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={recording ? onStop : onStart} disabled={!canRecord}>
          {recording ? 'Stop recording' : 'Record'}
        </button>
        <button className="secondary" onClick={onDownload} disabled={recording || !hasRecording}>
          Download WAV
        </button>
        <span className="mono dim">{duration.toFixed(1)} s</span>
      </div>
      <p className="dim" style={{ marginBottom: 0, fontSize: 13 }}>
        Saved as 32-bit float WAV at the input's own sample rate, for use as a
        reference fixture.
      </p>
    </div>
  );
}
```

- [ ] **Step 11: Wire it together in `App.tsx`**

Replace `web/src/App.tsx` entirely:

```tsx
/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.
    Licensed under the GNU General Public License version 2.
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import './styles/tokens.css';
import {
  requestPermission, listAudioInputs, saveSelection, loadSelection, resolveSelection,
  type AudioInput,
} from './audio/device-manager';
import { startCapture, type CaptureSession, type ProcessingWarning } from './audio/audio-engine';
import { measureLevel, type LevelReading } from './audio/level-meter';
import { WavRecorder } from './audio/wav-recorder';
import { PermissionGate } from './components/PermissionGate';
import { DeviceSelector } from './components/DeviceSelector';
import { LevelMeter } from './components/LevelMeter';
import { WaveformCanvas } from './components/WaveformCanvas';
import { RecorderPanel } from './components/RecorderPanel';
import { SourceFooter } from './components/SourceFooter';

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return 'Could not open the audio input.';
  switch (err.name) {
    case 'NotAllowedError':
      return 'Microphone access was denied. Allow it in your browser’s site settings, then reload.';
    case 'NotFoundError':
      return 'No audio input was found. Connect a microphone or USB timegrapher and reload.';
    case 'NotReadableError':
      return 'The device is in use by another application. Close it and try again.';
    case 'OverconstrainedError':
      return 'That device was disconnected. Choose another input.';
    default:
      return err.message;
  }
}

export default function App() {
  const [granted, setGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<AudioInput[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<ProcessingWarning[]>([]);
  const [reading, setReading] = useState<LevelReading | null>(null);
  const [latest, setLatest] = useState<Float32Array | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);

  const session = useRef<CaptureSession | null>(null);
  const recorder = useRef<WavRecorder | null>(null);
  const isRecording = useRef(false);

  const secure = window.isSecureContext;
  const supported = typeof AudioWorkletNode !== 'undefined';

  const refreshDevices = useCallback(async () => {
    const found = await listAudioInputs();
    setDevices(found);
    const chosen = resolveSelection(loadSelection(), found);
    setSelectedId(chosen?.deviceId ?? null);
  }, []);

  const grant = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestPermission();
      setGranted(true);
      await refreshDevices();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!granted) return;
    const onChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [granted, refreshDevices]);

  const handleBlock = useCallback((block: Float32Array) => {
    setReading(measureLevel(block));
    setLatest(block);
    if (isRecording.current && recorder.current) {
      recorder.current.push(block);
      setDuration(recorder.current.durationSeconds);
    }
  }, []);

  const start = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const s = await startCapture(selectedId, handleBlock);
      session.current = s;
      setSampleRate(s.sampleRate);
      setWarnings(s.warnings);
      setCapturing(true);
      saveSelection(selectedId);
    } catch (err) {
      setError(describeError(err));
    }
  };

  const stop = async () => {
    isRecording.current = false;
    setRecording(false);
    await session.current?.stop();
    session.current = null;
    setCapturing(false);
    setReading(null);
    setSampleRate(null);
  };

  const startRecording = () => {
    if (!session.current) return;
    recorder.current = new WavRecorder(session.current.sampleRate, 1);
    setDuration(0);
    setHasRecording(false);
    isRecording.current = true;
    setRecording(true);
  };

  const stopRecording = () => {
    isRecording.current = false;
    setRecording(false);
    setHasRecording((recorder.current?.frameCount ?? 0) > 0);
  };

  const download = () => {
    if (!recorder.current) return;
    const blob = new Blob([recorder.current.toWav()], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `timegrapher-${stamp}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>MAC Bespoke Timegrapher</h1>
      <p className="dim" style={{ marginTop: 0 }}>Audio capture and hardware verification</p>

      {!secure && (
        <div className="panel">
          <p className="bad" style={{ margin: 0 }}>
            This page is not on a secure connection, so the browser will not
            grant microphone access. Open it over HTTPS.
          </p>
        </div>
      )}

      {!supported && (
        <div className="panel">
          <p className="bad" style={{ margin: 0 }}>
            This browser does not support AudioWorklet. Use a current version of
            Chrome, Edge or Safari.
          </p>
        </div>
      )}

      {secure && supported && !granted && (
        <PermissionGate onGrant={grant} error={error} busy={busy} />
      )}

      {granted && (
        <>
          <DeviceSelector
            devices={devices}
            selectedId={selectedId}
            sampleRate={sampleRate}
            warnings={warnings}
            capturing={capturing}
            onSelect={setSelectedId}
            onStart={start}
            onStop={stop}
          />
          {error && <div className="panel"><p className="bad" style={{ margin: 0 }}>{error}</p></div>}
          <LevelMeter reading={reading} />
          <WaveformCanvas latest={latest} />
          <RecorderPanel
            recording={recording}
            duration={duration}
            canRecord={capturing}
            onStart={startRecording}
            onStop={stopRecording}
            onDownload={download}
            hasRecording={hasRecording}
          />
        </>
      )}

      <SourceFooter />
    </main>
  );
}
```

- [ ] **Step 12: Set the page title in `web/index.html`**

Replace the `<title>` with `MAC Bespoke Timegrapher` and add:

```html
<meta name="description" content="A browser-based timegrapher for mechanical watches. Measures rate, amplitude and beat error from any audio input.">
```

- [ ] **Step 13: Run the full suite and the build**

Run: `cd web && npm test && npm run build`
Expected: all tests PASS; build succeeds with no TypeScript errors.

- [ ] **Step 14: Verify in a browser against real hardware**

```bash
cd web && npm run dev
```

Open `http://localhost:5173`. Confirm: the permission prompt appears, the USB PnP Sound Device is listed by name, Start reports a sample rate, the level meter moves when you tap the microphone, and the waveform draws.

- [ ] **Step 15: Commit**

```bash
git add web/src web/index.html
git commit -m "feat(ui): add capture interface with device picker, meter and waveform

Includes the GPLv2 source link required for browser-delivered code, and
surfaces a warning when a browser applies audio processing despite being
asked not to.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Publish and deploy

**Files:**
- Create: `docs/deployment.md`
- Modify: `site/public_html/sitemap.xml` (in the **private** site repository)

**Interfaces:**
- Consumes: the built output of Task 7
- Produces: a live HTTPS URL, which Task 9 requires for mobile testing

- [ ] **Step 1: Confirm the user has authenticated `gh`**

```bash
gh auth status
```

If this fails, stop and ask the user to run `gh auth login`. The repository cannot be created without it.

- [ ] **Step 2: Merge the branch to `main`**

```bash
cd "/Users/nathanmcgraw/Documents/Mac Bespoke Watch Co/mac-timegrapher"
git checkout main
git merge --no-ff foundation-and-audio-layer -m "Merge foundation and audio layer"
```

- [ ] **Step 3: Create the public repository and push**

```bash
gh repo create natemac/mac-timegrapher --public \
  --description "A browser-based timegrapher for mechanical watches. GPLv2, derived from tg." \
  --source . --remote origin --push
```

- [ ] **Step 4: Verify the published repository shows the license and full history**

```bash
gh repo view natemac/mac-timegrapher --json licenseInfo,url
git log --oneline | wc -l
```

Expected: GPLv2 detected; at least 243 commits, proving upstream ancestry survived the push.

- [ ] **Step 5: Build for production**

```bash
cd web && npm run build
grep -c 'github.com/natemac/mac-timegrapher' dist/assets/*.js
```

Expected: at least 1. If 0, the source link was tree-shaken or lost, and the build must not be deployed — it would fail GPLv2 §3.

- [ ] **Step 6: Upload to the host**

Upload the contents of `web/dist/` to `public_html/tools/timegrapher/` using the Hostinger API, preserving the directory structure, then clear the CDN cache. Do not commit `dist/` to the `natemac/site` repository.

- [ ] **Step 7: Verify the deployment**

```bash
curl -sI https://macwatches.com/tools/timegrapher/ | head -3
curl -s https://macwatches.com/tools/timegrapher/ | grep -o '/tools/timegrapher/assets/[^"]*' | head
```

Expected: `HTTP/2 200`, and asset paths under `/tools/timegrapher/assets/`. Then open the URL and confirm the permission prompt appears — if it does not, the secure-context check failed.

- [ ] **Step 8: Add to the site's sitemap**

In the private site repository, add to `public_html/sitemap.xml`:

```xml
<url><loc>https://macwatches.com/tools/timegrapher/</loc></url>
```

Do **not** add it to `robots.txt`. Unlike the workshop pages, this tool is public and should be indexed.

- [ ] **Step 9: Write `docs/deployment.md` recording the exact process used**

Document the build command, the upload target path, the cache-clear step, and the two verification `curl` commands from Step 7, so the next deploy is repeatable.

- [ ] **Step 10: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: record the deployment process

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

### Task 9: Bench verification and fixture capture

**Files:**
- Create: `fixtures/README.md`, `fixtures/nh35-dial-up-01.wav`, `fixtures/nh35-dial-up-01.json`
- Modify: `docs/hardware-compatibility.md`

**Interfaces:**
- Consumes: the deployed application
- Produces: the fixture corpus and confirmed browser characteristics that Milestone 2 consumes

This task is performed by the user at the bench. It is the actual Phase 0 gate.

- [ ] **Step 1: Write `fixtures/README.md`**

```markdown
# Reference recordings

Each recording has a sibling `.json` describing how it was made and, once
Milestone 2 can measure, the reference values it must reproduce.

Recordings are 32-bit float WAV at the capture device's own sample rate. They
are the regression corpus for the WebAssembly DSP port: a change that alters
the numbers these produce is a change that needs justifying.

## Naming

    <movement>-<position>-<sequence>.wav
    e.g. nh35-dial-up-01.wav

## Metadata schema

    {
      "movement": "NH35",
      "position": "dial-up",
      "sampleRate": 48000,
      "durationSeconds": 30,
      "device": "USB PnP Sound Device (C-Media 0x0d8c:0x013c)",
      "browser": "Chrome 141 / macOS 15.6",
      "recordedAt": "2026-08-29",
      "processingWarnings": [],
      "notes": "Fully wound, settled 10 minutes.",
      "reference": null
    }

`reference` stays null until native TG can be run on the same movement;
Milestone 2 fills in the expected BPH, rate, amplitude and beat error.
```

- [ ] **Step 2: Record a 30-second NH35 fixture**

Fully wind the watch, let it settle, mount it dial up on the USB timegrapher, open `https://macwatches.com/tools/timegrapher/` in Chrome on macOS, select the USB PnP Sound Device, start, and record 30 seconds. Download the WAV.

- [ ] **Step 3: Confirm the recording is what it claims to be**

```bash
afinfo fixtures/nh35-dial-up-01.wav
```

Expected: 32-bit float, 1 channel, the sample rate the app displayed, about 30 seconds. **A mismatch between the displayed rate and this rate means the context resampled and the fixture must be discarded.**

- [ ] **Step 4: Confirm ticks are visible, not merely audio**

This is acceptance criterion 6 and the real Phase 0 gate. In the app's waveform, a running movement must show **evenly spaced impulse pairs** — tick and tock — against a quiet floor. Continuous hash with no periodic structure means the device is picking up room noise rather than the movement, and no amount of downstream DSP will recover it.

If the impulses are not visible: check that the watch is in firm contact with the sensor, then check the `processingWarnings` display, then try the other browser before concluding the hardware is unsuitable.

- [ ] **Step 5: Write the metadata file**

Create `fixtures/nh35-dial-up-01.json` using the schema from Step 1, filling in the real observed values including any processing warnings the app displayed.

- [ ] **Step 6: Repeat across browsers and fill in the compatibility table**

Run Steps 2–4 on Chrome/macOS and Safari/macOS at minimum, recording results in `docs/hardware-compatibility.md`. Note any browser that overrode the audio constraints.

- [ ] **Step 7: Commit**

```bash
git add fixtures/ docs/hardware-compatibility.md
git commit -m "test: add first NH35 reference recording and compatibility results

Settles Phase 0: confirms the C-Media USB device delivers recognisable watch
impulses through the browser audio path.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 8: Confirm the milestone's acceptance criteria**

Check each of the nine criteria in spec §8 against reality. Criteria 3–5 can pass on a device that still produces unusable data; criterion 6 is the one that matters. Record the outcome in `docs/hardware-compatibility.md`.

---

## Self-Review

**Spec coverage.** Every section maps to a task: §4 licensing → Task 1 and Task 7 Step 4; §5 repository → Tasks 1, 2 and 8; §6.1 modules → Tasks 3–7; §6.2 the three constraints → Task 6 (constraints, sample rate) and Task 4 (32-bit float); §6.3 platform behaviour → Task 5 (blank labels, ID rotation) and Task 6 (Safari resume); §6.4 error states → Task 7 (`describeError`, secure-context and AudioWorklet guards); §7 deployment → Task 8; §8 testing → Tasks 3–6 automated, Task 9 manual; §10 handoff → Task 9.

**Type consistency.** `LevelReading` (Task 3) is consumed by `LevelMeter` and `App`. `WavData`/`WavRecorder` (Task 4) are consumed by `App`. `AudioInput` (Task 5) is consumed by `DeviceSelector` and `App`. `ProcessingWarning` and `CaptureSession` (Task 6) are consumed by `DeviceSelector` and `App`. Names match across all uses.

**Known gap, deliberate.** `startCapture` has no automated test; it needs real hardware. Its two decision-making helpers are fully covered, and its behaviour is verified by Task 7 Step 14 and Task 9.
