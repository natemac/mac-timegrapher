# Bench checklist — capturing a reference fixture

What to do with a watch, a contact sensor and ten minutes. The output is a WAV
committed to `fixtures/`, which is what every future change to the signal
processing gets judged against.

## Before you start

- Wind the movement fully and let it settle **at least 10 minutes**. A watch
  measured straight after winding reads high and drifts.
- Work somewhere quiet. The sensor picks up the room as well as the watch.
- Make sure the movement is in **firm contact** with the sensor. Loose contact
  is the single most common cause of a signal that looks like noise.

## Capture

1. Open https://macwatches.com/tools/timegrapher/ in **Chrome on macOS**.
2. Allow microphone access.
3. Select the **USB PnP Sound Device** from the input list. If it isn't listed,
   the browser can't see it — that is the finding, stop and record it.
4. Press **Start**. Note the sample rate shown next to the button.
5. Watch the waveform for a few seconds before recording anything. See below.
6. Press **Record**, wait **30 seconds**, press **Stop recording**.
7. **Download WAV.**

Then repeat the whole thing in **Safari on macOS**.

## What you are looking for

This is the gate the whole project rests on.

**Good:** a quiet, flat floor with isolated vertical spikes arranged in
**pairs** — tick and tock. On an NH35 (21,600 bph) that is 6 pairs per second,
so roughly 6 pairs across the one second of waveform on screen. The pairs are
evenly spaced and obvious. You should not have to squint.

**Bad:** a continuous band of hash filling the middle of the display with no
repeating structure. That means the sensor is hearing the room, not the
escapement. No amount of signal processing later recovers it.

If you see hash:

1. Check the watch is pressed firmly against the sensor.
2. Check you selected the USB device and not the built-in microphone.
3. Try the other browser.
4. Only then conclude the hardware is unsuitable.

## Two warnings the app may show

- **Sample-rate mismatch** (red) — the browser refused the device's rate and
  resampled. **Discard that recording.** It is a derivative, not a reference.
- **"Does not report whether autoGainControl…"** (grey, on Safari) — expected,
  not a fault. Safari genuinely omits the field. Record it in the compatibility
  table and carry on.

## Save the fixture

Name it `<movement>-<position>-<sequence>.wav`, e.g. `nh35-dial-up-01.wav`, and
put it in `fixtures/` with a sibling `.json`:

```json
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
```

Fill in the real observed values, including any warnings the app displayed.
Leave `reference` as `null` — Milestone 2 fills in expected BPH, rate,
amplitude and beat error once there is something to measure with.

Verify before committing:

```sh
afinfo fixtures/nh35-dial-up-01.wav
```

Expect 32-bit float, 1 channel, ~30 seconds, and **the same sample rate the app
displayed**. A mismatch means something resampled — discard it.

## Then fill in the table

Record results for both browsers in `docs/hardware-compatibility.md`. An empty
cell means untested, not unsupported. Note any browser that overrode the audio
constraints.

## Nice to have, once the basics pass

More fixtures make the regression corpus stronger. In rough order of value:

- The same movement **dial down**, **crown up**, **crown down** — positional
  variation is what multi-position QC will eventually be checked against.
- A movement with a **known fault** — high beat error, low amplitude. Fixtures
  that only cover healthy movements can't catch a regression in fault detection.
- A **different beat rate** — a 28,800 bph movement alongside the 21,600 NH35,
  so BPH detection has more than one case.

One good NH35 fixture unblocks Milestone 2. The rest can follow.
