# Roadmap

A browser-based mechanical watch timegrapher derived from the open-source
[`agrigera/tg`](https://github.com/agrigera/tg) project.

The objective is not to reproduce the entire native tg desktop application. The
objective is to preserve its proven timing-analysis logic while replacing its
native audio and interface layers with browser-native equivalents.

## Goals

The finished application should:

- Run in a modern web browser with no install, no drivers and no native
  application.
- Accept audio from USB timegrapher and contact-microphone devices that present
  as standard USB audio inputs, from USB microphones, and from built-in
  microphones as a fallback.
- Measure and display rate in seconds/day, amplitude in degrees, beat error in
  milliseconds, beat frequency (BPH), a scrolling timegrapher trace, and a
  signal-quality indication.
- Support movement presets and multi-position testing sessions.
- Be installable as a PWA while still working as an ordinary website.

## Architecture

```text
Mechanical Watch
      │
      ▼
USB Timegrapher / Contact Microphone
      │
      ▼
Operating System Audio Input
      │
      ▼
Browser MediaDevices API
navigator.mediaDevices.getUserMedia()
      │
      ▼
Web Audio API
AudioContext / AudioWorklet
      │
      ▼
tg Signal Processing Core
WebAssembly
      │
      ▼
Measurement Engine
      │
      ├── Rate
      ├── Amplitude
      ├── Beat Error
      ├── BPH
      ├── Signal Quality
      └── Trace Data
      │
      ▼
Web UI / PWA
```

The design targets **standard browser audio input**, not WebUSB. The reference
hardware (a C-Media `0x0d8c:0x013c` "USB PnP Sound Device") presents itself as a
standard USB audio-class device, so no proprietary USB protocol work is needed.

## Technology choices

**Front end.** TypeScript, React, Vite, HTML Canvas for the scrolling trace, and
responsive CSS.

**Browser audio.** `navigator.mediaDevices.getUserMedia()`,
`navigator.mediaDevices.enumerateDevices()`, the Web Audio API, `AudioContext`
and `AudioWorklet`. Continuous DSP must never run on the main UI thread.

**Signal processing.** Refactor the original tg C algorithm into a standalone
DSP library, compile it with Emscripten to WebAssembly, and call it from
TypeScript. As much of tg's established processing logic as practical is
preserved: audio filtering, FFT analysis, tick/tock event detection,
beat-period analysis, rate, beat error, amplitude, BPH detection and trace
generation.

For the FFT there are two options. Compiling FFTW to WebAssembly stays closest
to the original tg behaviour and minimises algorithmic differences, at the cost
of build complexity and package size. A web-native FFT replacement builds more
cleanly and may be smaller, but requires more validation. Start with whichever
produces the closest match to native tg; optimise later.

**Sample rate.** The application must not assume a fixed rate. Devices and
browsers may present 44.1 kHz, 48 kHz or other hardware-specific rates. Either
configure the DSP core dynamically or resample explicitly — never resample by
accident.

**Storage.** IndexedDB for sessions and recordings, `localStorage` for simple
settings.

### Mapping from tg

| tg component | Web equivalent |
|---|---|
| `src/algo.c` | Reuse/refactor as DSP core |
| `src/audio.c` | Web Audio API |
| `src/interface.c` | React UI |
| `src/output_panel.c` | React/Canvas components |
| PortAudio | `getUserMedia()` + AudioWorklet |
| GTK | HTML/CSS/TypeScript |
| pthread audio handling | AudioWorklet / worker messaging |
| FFTW3 | Compile to WASM, or a compatible FFT |
| `.ini` config | IndexedDB / `localStorage` |

## Milestones

### Milestone 1 — Browser audio capture

Browser device selector, USB audio device detection, signal meter, raw waveform
and WAV recording. **Success condition:** watch ticks are captured reliably, and
the recordings are usable as reference fixtures.

### Milestone 2 — Offline DSP core

Extracted standalone tg algorithm with no GTK, PortAudio, UI-state or
platform-specific dependencies, plus a WAV-file command-line processor and a
reference test suite. The intended C API is roughly:

```c
typedef struct {
    int sample_rate;
    int bph;
    double lift_angle;
} tg_config;

typedef struct {
    double rate;
    double amplitude;
    double beat_error;
    int detected_bph;
    double signal_quality;
    int valid;
} tg_result;

void tg_init(tg_config config);
void tg_push_samples(const float *samples, int count);
tg_result tg_get_result(void);
void tg_reset(void);
```

The browser layer should know nothing about tg's internal buffers.
**Success condition:** results match native tg within the validation tolerances
below.

### Milestone 3 — WebAssembly port

The DSP core compiled to WASM, with the browser able to process saved WAV files.
**Success condition:** browser results match native tg.

### Milestone 4 — Live timegrapher

Real-time audio processing producing rate, amplitude, beat error, BPH and a
scrolling Canvas trace with zoom, pause, clear, a stable scale, and clear noise
and invalid-reading indication. **Success condition:** stable live measurements.

### Milestone 5 — Movement presets

A movement preset database — BPH, lift angle and recommended stabilisation time
— with automatic population and manual override, for example:

```typescript
{
  id: "nh35",
  manufacturer: "TMI",
  name: "NH35",
  bph: 21600,
  liftAngle: 53,
  type: "automatic"
}
```

Meca-quartz movements are not standard mechanical escapement targets and are not
part of the normal mechanical preset workflow. **Success condition:** a normal
measurement requires minimal manual configuration.

### Milestone 6 — Measurement sessions

Multi-position testing (dial up, dial down, crown up, crown down, 12 up, 6 up),
stabilisation logic, averaging, a pass/review/fail result and session storage.

The application should distinguish *live*, *stabilising*, *stable* and
*recorded* states rather than saving a single instantaneous reading: detect a
valid signal, wait a minimum stabilisation period, collect valid measurements
continuously, measure variance, enable recording only when stability is
acceptable, and save an averaged result.

Pass/fail thresholds are **not** universal across movements. They belong to a
configurable QC profile supplied per deployment — the application ships no
thresholds of its own, and a borderline result should be flagged for review
rather than automatically declared defective. **Success condition:** one full
session can be completed and saved.

### Milestone 7 — External record integration

Optional integration that lets a completed session be saved into an external
record-keeping system over an authenticated HTTP API. This is a process and
network boundary: the timegrapher itself stores no business data. See
[licensing.md](licensing.md). **Success condition:** a finished watch can have a
permanent timing record.

### Milestone 8 — Mobile / PWA

Responsive layout, `manifest.webmanifest`, service worker, app icons, offline
shell caching, install-to-home-screen, and validation on Android and
iPhone/iPad including external audio hardware. The application must still work
as a normal website without installation. **Success condition:** practical bench
use without a desktop computer.

## Signal quality and calibration

The application should expose an understandable signal-quality state — no
signal, weak, fair, good, excellent, unstable — derived from the noise floor,
tick/tock event amplitude, missing or inconsistent events, BPH confidence and
measurement variance. It should avoid displaying authoritative-looking values
when the signal is unreliable.

Trustworthy rate measurement also needs calibration support: a rate calibration
offset, a calibration test tone, calibration saved per audio device, a
calibration date, and a visible calibration status.

## Reference audio library

The algorithm must not be validated with live audio alone. A corpus of
repeatable WAV fixtures is recorded covering common movements (NH35, NH34,
NH70/71/72, NH05, Miyota 8215/9015, PT5000, PT5404, Sea-Gull ST2130 and others)
under multiple conditions: healthy, fast, slow, high beat error, lower
amplitude, and each measurement position. Each fixture is stored with its
reference tg result, for example:

```text
File: nh35-dial-up-01.wav
BPH:        21600
Rate:       +7.2 s/day
Amplitude:  263°
Beat Error: 0.2 ms
```

These files become regression tests for all future code changes. Producing this
corpus is the main deliverable of Milestone 1 alongside the capture layer
itself.

## Testing strategy

**Layer 1 — DSP unit tests.** Filters, FFT behaviour, tick/tock detection,
beat-period detection, and the rate, beat-error, amplitude and BPH
calculations.

**Layer 2 — recorded audio tests.** Each fixture asserts its expected result
within tolerance:

```text
nh35-test-001.wav
BPH: 21600
Rate: +5.1 ± 0.5 s/day
Amplitude: 263 ± 3°
Beat Error: 0.20 ± 0.05 ms
```

**Layer 3 — native comparison.** The same WAV run through original tg and
through this application, results compared.

**Layer 4 — physical bench comparison.** Simultaneous or near-simultaneous
readings against original tg and, where available, a known dedicated hardware
timegrapher.

### Validation tolerances

Provisional measurement targets, to be refined after real hardware testing:

| Measurement | Web vs reference |
|---|---:|
| BPH | Exact known/detected value |
| Rate | ±0.5 s/day |
| Amplitude | ±3° |
| Beat error | ±0.05 ms |

## Browser and platform support

**Priority 1:** Chrome and Edge on Windows, Chrome and Safari on macOS.
**Priority 2:** Chrome on Android, Safari on iPhone/iPad.
**Priority 3:** Firefox desktop, ChromeOS.

Mobile browsers are known to differ around audio device selection, external USB
audio routing, device ID stability, background processing, screen locking and
PWA microphone behaviour. These require physical testing; results are recorded
in [hardware-compatibility.md](hardware-compatibility.md).

## Error and warning states

The application must handle clearly: microphone permission denied, no audio
device, USB device disconnected, a sample rate other than the one requested,
weak signal, invalid BPH, unsupported sample rate, no tick detection, excessive
noise, unstable measurements, WASM initialisation failure, and unsupported
browser features.

## Local-first processing and privacy

All DSP runs locally in the browser. Raw audio is never uploaded by default —
this gives lower latency, better privacy, no server bandwidth, better bench
reliability and possible offline operation.

Alongside that: microphone access only after an explicit user action, a clear
indication whenever capture is active, never a silently-enabled microphone, and
HTTPS in production (browser microphone access requires a secure context in any
case).

## Deployment

The application is a static build. `base` defaults to `/tools/timegrapher/` and
can be overridden at build time with the `VITE_BASE` environment variable, so a
fork can serve it from any path:

```bash
VITE_BASE=/ npm run build
```

## Licensing

`agrigera/tg` is licensed under GNU GPL v2 (version 2 only, with no "or later"
clause). Where tg source is reused in the WebAssembly port, applicable copyright
notices are preserved, the derivative code is licensed under GPLv2,
corresponding source is made available, and modifications are documented. See
[licensing.md](licensing.md) and [NOTICE](../NOTICE).
