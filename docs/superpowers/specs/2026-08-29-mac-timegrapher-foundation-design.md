# MAC Bespoke Web Timegrapher — Foundation and Audio Layer

**Date:** 2026-08-29
**Milestone:** 1 of 8 (see `docs/build-plan.md`)
**Status:** Approved design

---

## 1. Purpose

Establish the public GPLv2 repository for a browser-based mechanical watch
timegrapher derived from [`agrigera/tg`](https://github.com/agrigera/tg), and
build the audio input layer that everything downstream depends on.

This milestone answers one question the rest of the project rests on: **can a
browser capture usable watch tick impulses from the C-Media USB timegrapher?**
Plan §7 (Phase 0) left that unverified. No signal processing work should begin
until it is settled.

The recordings produced here are not throwaway. They become the WAV fixture
corpus that validates the WebAssembly DSP port in Milestones 2 and 3.

---

## 2. Scope

### In scope

- Public GPLv2 repository with correct attribution and modification records.
- Vite + TypeScript + React application skeleton.
- Audio device enumeration, permission handling, and device selection.
- Live input level meter (peak, RMS, clip detection).
- Live raw waveform display.
- WAV recording and download at the device's true sample rate.
- Deployment to `https://macwatches.com/tools/timegrapher`.

### Out of scope

Deferred to later milestones, and deliberately not designed here:

- WebAssembly, Emscripten, and the DSP core (Milestones 2–3).
- Rate, amplitude, beat error, BPH (Milestone 4).
- Movement presets (Milestone 5).
- Multi-position QC sessions (Milestone 6).
- MAC Bespoke build-record integration (Milestone 7).
- PWA and offline support (Milestone 8).
- Visual design polish. The interface in this milestone is plain and honest.
  The design pass comes once the measurement engine works.

---

## 3. Terminology

A **timegrapher** is the instrument that measures a movement's rate, amplitude
and beat error. **Regulating** is the act of adjusting the movement afterwards.
This project builds the instrument, so the product, the repository and the URL
all use *timegrapher*.

---

## 4. Licensing and compliance

### 4.1 The upstream license

`agrigera/tg` is **GPL version 2 only**. Source headers read "under the terms of
the GNU General Public License version 2 as published by the Free Software
Foundation" with no "or later" clause. Copyright is Marcello Mamino, 2015–2016;
`agrigera/tg` is itself a downstream fork maintained by Alejandro Grigera.

Two consequences bind this project:

1. The work cannot be relicensed to GPLv3, and cannot link GPLv3-only code.
2. Serving compiled WebAssembly to a visitor's browser **is distribution** under
   GPLv2 §3, even though GPLv2 has no AGPL-style network clause. Corresponding
   source must be offered.

### 4.2 The boundary

The entire timegrapher web application is GPLv2 and public: DSP core, UI,
movement presets, trace rendering, QC logic.

MAC Bespoke's proprietary business logic — build numbers, customer records,
inventory, pricing, QC pass/fail thresholds — stays in the private PHP
application at `macwatches.com` and never enters this repository.

The two communicate only over authenticated HTTP. That is a real process and
network boundary between two separately-usable programs, not a notional module
split inside one bundle. A single JavaScript bundle containing both GPL-derived
WASM and proprietary code would be a combined work, and the whole bundle would
fall under GPLv2. This design avoids that by construction rather than by
careful avoidance.

Because the app is public, **"Save to Build Record" is an optional
authenticated feature**. Anonymous visitors get the complete timegrapher. A
logged-in operator additionally sees a save action that POSTs finished results
to the private PHP API. The build-record schema lives on the PHP side.

### 4.3 Required artefacts

Delivered in the first commits on top of upstream history:

| Artefact | Obligation |
|---|---|
| `LICENSE` | Upstream GPLv2 text, byte-unchanged |
| `NOTICE` | Credits Mamino (2015–2016) and Grigera; states derivative work and fork date |
| `README.md` | Rewritten for the web app, with a "Relationship to TG" section linking upstream |
| `docs/licensing.md` | GPLv2 §2(a) modification log: what changed, when, why |
| Modified C file headers | Original header preserved, plus `Modified YYYY-MM-DD by MAC Bespoke Watch Co.` |
| In-app footer link | "Open source (GPLv2) — view source" → GitHub repository |

The in-app footer link is what discharges §3 for browser-delivered code. It must
be present in every deployed build, including this one, before the app is
reachable at a public URL.

### 4.4 Provable modification history

The repository is seeded from upstream's full 236-commit history
(2015-08-22 → 2026-03-22), with our commits on top. GPLv2 §2(a) requires
modified files to carry prominent notices of change and date. Real git ancestry
makes that provable from `git log` rather than asserted in prose.

`upstream` remains a configured remote so future TG fixes can be merged. Its
push URL is set to `no_push` to prevent accidental pushes to agrigera.

---

## 5. Repository

### 5.1 Location

- **GitHub:** `natemac/mac-timegrapher`, public, GPLv2.
- **Local:** `~/Documents/Mac Bespoke Watch Co/mac-timegrapher/`, a sibling of
  `site/`, not nested inside it.
- **Default branch:** `main`.

The project previously sat at `site/watchRegulator/`, inside the private
`natemac/site` repository. It has been moved out. It was untracked, so no GPL
code or history ever entered the private repository.

### 5.2 Layout

```
mac-timegrapher/
├── LICENSE                 GPLv2, unchanged from upstream
├── NOTICE                  attribution and fork record
├── README.md
├── src/                    upstream C, kept buildable
├── web/                    the browser application  ← this milestone
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── audio/
│       ├── components/
│       └── styles/
├── core/                   extracted DSP        (empty until Milestone 2)
├── wasm/                   Emscripten bindings  (empty until Milestone 3)
├── fixtures/               recorded WAVs and expected results
└── docs/
    ├── build-plan.md
    ├── licensing.md
    ├── hardware-compatibility.md
    └── superpowers/specs/
```

### 5.3 Keeping the native C build

Upstream's `src/` is retained and kept buildable against GTK+3, PortAudio and
FFTW3f, rather than deleted.

The cost is carrying roughly 3,300 lines of GTK and PortAudio code that will
never ship to a browser. Nothing in `src/` is referenced by the web build, so
the shipped bundle is unaffected.

The benefit is that **native TG cannot read WAV files**. `src/audio.c` exposes
only a live PortAudio path, and the binary accepts no command-line options
beyond a hidden `test` argument. Plan §26 "Layer 3 — run the exact same WAV
through Original TG vs MAC Web Timegrapher" is therefore impossible as written.

Keeping the native build lets us later add a small WAV file-input mode to our
own native binary, giving exact A/B comparison against the reference algorithm
on identical samples. The alternative — playing fixtures through a BlackHole
virtual audio device into unmodified TG — introduces a resampling and routing
path that cannot be verified as transparent, which is precisely the property
the comparison is supposed to establish.

---

## 6. Architecture

```
USB timegrapher / contact microphone
            ↓
OS audio input
            ↓
navigator.mediaDevices.getUserMedia()      device-manager.ts
            ↓
AudioContext at device native rate         audio-engine.ts
            ↓
AudioWorkletProcessor                      capture-worklet.ts
            ↓
Float32 PCM blocks over ring buffer
            ↓
     ┌──────┴──────┬─────────────┐
level-meter.ts  waveform      wav-recorder.ts
     ↓             ↓                ↓
  LevelMeter  WaveformCanvas   RecorderPanel
```

### 6.1 Modules

Each module has one responsibility and is testable without a browser device.

| Module | Responsibility | Depends on |
|---|---|---|
| `audio/device-manager.ts` | Request permission, enumerate inputs, persist chosen `deviceId`, detect hot-unplug | MediaDevices API |
| `audio/audio-engine.ts` | `AudioContext` and `MediaStream` lifecycle, start/stop, report actual sample rate | device-manager |
| `audio/capture-worklet.ts` | `AudioWorkletProcessor`; ring-buffers input and posts Float32 blocks to the main thread | — (runs on audio thread) |
| `audio/level-meter.ts` | Peak, RMS and clip detection from a Float32 block | pure function |
| `audio/wav-recorder.ts` | Accumulate blocks, encode 32-bit float WAV, trigger download | pure, given blocks |
| `components/PermissionGate.tsx` | Explains why the mic is needed; nothing captures before user action | device-manager |
| `components/DeviceSelector.tsx` | Input picker, shows active device and sample rate | device-manager |
| `components/LevelMeter.tsx` | Bar meter with clip indicator | level-meter |
| `components/WaveformCanvas.tsx` | Scrolling raw waveform on Canvas | — |
| `components/RecorderPanel.tsx` | Record, stop, duration, download | wav-recorder |

`level-meter.ts` and `wav-recorder.ts` are pure functions over Float32 arrays,
so both are unit-testable with synthetic signals and no hardware.

### 6.2 Three constraints that decide whether this works

These are the failure modes most likely to produce a false "the hardware doesn't
work" conclusion. Each is a deliberate requirement, not an incidental setting.

**Browser voice processing must be disabled.** `getUserMedia` constraints must
set `echoCancellation: false`, `autoGainControl: false`, `noiseSuppression:
false`. Chrome enables all three by default. Automatic gain control alone would
make amplitude measurement meaningless, since amplitude is derived from impulse
energy; noise suppression classifies watch ticks as noise and removes them. A
recording made with defaults would look plausible and be worthless.

**The AudioContext must run at the device's true sample rate.** Constructing an
`AudioContext` without an explicit rate silently resamples to the system default
(typically 48 kHz). Fixtures captured through a hidden resample would poison
every downstream DSP comparison. The engine constructs the context at the
device's reported rate and displays the actual `AudioContext.sampleRate` in the
interface so any mismatch is visible rather than assumed.

**Fixtures record as 32-bit float WAV, not 16-bit.** These recordings are the
regression corpus for the WASM port. Float avoids clipping and quantisation
artefacts that would otherwise be baked into the reference data permanently.

### 6.3 Platform behaviour

- `enumerateDevices()` returns entries with empty `label` fields until
  permission is granted. The device list therefore populates only after the
  permission gate, not before.
- Safari requires `AudioContext.resume()` following a user gesture. Start is
  always an explicit button press.
- `getUserMedia` requires a secure context. `localhost` qualifies for desktop
  development; mobile testing requires the real HTTPS deployment.
- Device IDs rotate when permissions are cleared. Persisted selection falls
  back to the system default rather than failing, and says so.

### 6.4 Error states

Handled explicitly, each with a plain-language message and a recovery action:
permission denied, no input devices found, device disconnected mid-capture,
`AudioWorklet` unsupported, insecure context (page served over HTTP), and
sample rate mismatch between request and grant.

---

## 7. Deployment

Vite builds with `base: '/tools/timegrapher/'` into `web/dist/` **inside this
repository**. Those files are uploaded directly to `public_html/tools/timegrapher/`
on the host via the existing Hostinger API process, followed by a CDN cache clear.

Build output is deliberately **not** committed to the private `natemac/site`
repository. Compiled output of GPL-derived source is itself GPL-covered, so
committing it there would reintroduce exactly the entanglement §5.1 avoids.
Nothing is lost by this: GitHub deploy is disabled for the site anyway, and the
host is already updated file-by-file over the API rather than from git.

Verified as non-conflicting against the live site configuration:

- No `.htaccess` rewrite rule touches `/tools/`.
- HTTPS is already forced site-wide, satisfying the secure-context requirement.
- `DirectoryIndex` already includes `index.html`.
- `Options -Indexes` is set, so the directory must contain `index.html`, which
  Vite emits.
- `X-Frame-Options: SAMEORIGIN` is set globally and does not affect same-origin
  use.

Two small edits to the private site repository:

- Add `https://macwatches.com/tools/timegrapher` to `sitemap.xml`.
- Do **not** add it to `robots.txt`. Unlike the workshop pages, this tool is
  public and should be indexed.

Deploying at this milestone rather than later is deliberate: iPhone and Android
verification requires a real HTTPS origin, and `localhost` only covers desktop.

---

## 8. Testing

### Automated

Vitest, run against pure modules with synthetic signals:

- `wav-recorder`: encode/decode round-trip preserves sample values, declared
  sample rate and channel count; header is valid 32-bit float WAV.
- `level-meter`: known inputs produce known outputs — silence reads −∞ dB, full
  scale reads 0 dB, a 0.5 amplitude sine reads the correct RMS, and samples
  beyond ±1.0 set the clip flag.
- `device-manager`: selection persistence and fallback, against a mocked
  MediaDevices API.

### Manual, on the bench

Automated tests cannot prove the hardware path. Verification is performed
against the C-Media USB PnP Sound Device and a running NH35.

### Acceptance criteria

This milestone is complete when all of the following hold:

1. The repository is public on GitHub under GPLv2, with `LICENSE`, `NOTICE`,
   attribution and a modification log, on top of upstream's history.
2. The deployed app is reachable at `https://macwatches.com/tools/timegrapher`
   and carries a visible source link.
3. The C-Media device appears by name in the input selector.
4. Selecting it opens a stream and reports the actual sample rate.
5. The level meter responds to watch ticks.
6. The waveform shows **recognisable, periodic tick impulses** from a running
   NH35 — not merely non-zero audio.
7. A 10-second recording downloads as a valid 32-bit float WAV with no dropouts.
8. Steps 3–7 pass on Chrome and Safari on macOS.
9. At least one NH35 fixture is committed to `fixtures/` with its recording
   conditions documented.

Criterion 6 is the real Phase 0 gate. Criteria 3–5 can pass on a device that
still produces unusable data.

---

## 9. Risks

| Risk | Impact | Response |
|---|---|---|
| C-Media device is output-only, or its input is inaccessible to browsers | Architecture invalidated; WebUSB or a different interface required | Settled by criterion 4 before any DSP work begins |
| Voice processing cannot be fully disabled on some browser | Amplitude measurement unreliable on that browser | Detect and report applied constraints via `getSettings()`; document per-browser results |
| Browser forces resampling away from the device rate | Fixtures unsuitable as DSP references | Display actual rate; record at whatever rate is genuinely delivered and store it in the fixture metadata |
| Emscripten and CMake are not installed on the development machine | Blocks Milestone 3 | Not needed this milestone; install before Milestone 3 |
| `gh` is not authenticated, and the configured GitHub MCP server returns HTTP 401 | Cannot create the repository | Requires `gh auth login` by the user before the repository can be created |

---

## 10. Handoff to Milestone 2

This milestone delivers to the next one:

- A committed WAV fixture corpus with documented recording conditions,
  at known and recorded sample rates.
- Confirmed browser audio characteristics: achievable sample rates, actual
  applied constraints, and per-browser behaviour.
- A buildable native TG for reference comparison.
- A stable Float32 block interface (`capture-worklet.ts` → main thread) that the
  WASM core will later consume unchanged.

Milestone 2 extracts `src/algo.c`, `src/computer.c` and the relevant parts of
`src/tg.h` into a standalone `core/` library with no GTK, PortAudio or UI
dependencies, plus a command-line WAV processor validated against these
fixtures.
