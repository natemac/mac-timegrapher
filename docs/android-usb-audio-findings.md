# Android USB microphone routing: what the hardware said

Companion to `android-usb-audio-review.md`, which set the questions. This
records the answers, measured on a Pixel 3 XL and a Pixel 9 Pro with a USB
pickup, September 5 2026.

**Conclusion.** On **Chrome** for Android a USB timegrapher pickup gives
trustworthy rate and beat error, and an amplitude that cannot be relied on: the
audio route that reaches the device applies gain control that cannot be
switched off or seen.

**This is one browser, not the platform.** Firefox for Android, on the same
handset and the same USB adapter, gives a clean signal 24-27 dB over the room
with no clipping and a rate that settles to ±0.7 s/day. The fault belongs to
Chrome's Android audio backend. Everything below was measured on Chrome unless
it says otherwise, and the section at the end records how that was narrowed.

## The four findings

**1. Selecting an input does nothing on the direct route.** With all processing
off, Android never enters communication mode, so `deviceId` binds to nothing.
Chrome accepts the constraint and reports the requested id back from
`getSettings()`, so nothing in the Web Audio API reveals it.

*How it was found.* Four enumerated inputs — Default, Speakerphone, Headset
earpiece, USB audio — measured back to back under identical constraints,
returning noise floors within about a decibel of each other. Then Default and
USB captured concurrently: RMS and peak identical to 0.1 dB, and a triggered
tap giving a peak difference of −1.7 dB where a contact pickup on its own body
should be tens of decibels louder.

This is why the LED lit while the waveform followed the room, why unplugging
changed the dropdown but not the audio, and why Firefox failed the same way.

**2. Echo cancellation is the routing switch.** Requesting it puts Chrome on
Android's communication route, where the selection binds. The mechanism came
from the review's reading of Chromium's `MakeAudioInputStream`, which avoids
communication mode when the effects mask is `NO_EFFECTS`; the bench confirmed
it.

**3. Our own graph then lost the route after 34 seconds.** The capture worklet
ended at `ctx.destination`, which opens a hardware output stream. Android
routes a communication device as an input/output pair, so it re-evaluates the
pair and returns the input to the built-in microphone. The capture keeps
running; only the meaning of the numbers changes.

*How it was found.* Three runs differing only in where the graph ends:

| sink | result |
| --- | --- |
| analyser only | 50 s at full scale, no revert |
| `ctx.destination` | collapses about 70 dB at 34 s, every time |
| `MediaStreamAudioDestinationNode` | 55 s at full scale, no revert |

Screen timeout (5 minutes), page visibility (`visible` throughout) and a timer
on the input were each checked and cleared first.

**4. The communication route applies its own gain control.** Undisableable,
and reported as absent.

*How it was found.* Two independent lines of evidence.

The behaviour: peak level reads −11.8 dBFS at 0.4 s after a capture opens and
0.0 dBFS at 0.8 s, then holds full scale, while `getSettings()` reports
`autoGainControl: false` throughout.

The control: a thick pad placed between movement and sensor, with the same
watch and pickup throughout.

| | no padding | with padding | change |
| --- | --- | --- | --- |
| Native recorder, peak | −7.4 dBFS | −13.9 dBFS | −6.5 dB |
| Chrome communication route | 0.0 dBFS | 0.0 dBFS | none |
| iPhone, direct route | 28 dB over room | 23 dB over room | −5 dB |

Attenuate the input and the phone compensates. A native Android recorder on the
same handset and the same pickup does not, which places the gain control in
Chrome's communication path rather than in the device or the USB stack.

## Why gain destroys amplitude and not rate

Amplitude is read from where a tick's impulse peak falls in time, so it does
not depend on how loud the recording is. The native reference proves that
directly: a 6.5 dB level change between the padded and unpadded recordings
moved amplitude by two degrees.

What breaks it is gain that varies *within* a beat. Automatic gain control is a
moving target, so the components of a single tick are scaled differently and
the peak position shifts. Rate and beat error read the interval between ticks
and survive.

So "too loud" was never the right framing, and nothing static — padding, a gain
knob, a quieter room — can undo it.

## The numbers, triangulated

Same watch (Seiko NH35, 53° lift), same USB pickup, within a few minutes.

| source | amplitude |
| --- | --- |
| Native C core on clean audio | 282–291° |
| WebAssembly build on the same audio | 285° |
| iPhone browser, direct route | 276–291° |
| Android browser, communication route | 156–171° |

Everything under our control agrees. The Android communication route is wrong
by about 130°.

The WebAssembly figure is worth noting separately: `fixtures/` was empty, so
`tests/compare-wasm-native.mjs` had only ever run against synthetic signals.
These recordings are the first check of the browser's DSP against the native
core on real escapement audio. It matched.

## What shipped

- A capture route setting. `auto` resolves to the communication route on
  Android and the direct route elsewhere; `direct` and `compatibility` override
  it, because platform behaviour changes and being wrong must not leave anyone
  unable to measure.
- The graph ends at a `MediaStreamAudioDestinationNode` on the communication
  route, which pulls the worklet without opening a hardware output. Every other
  platform keeps `ctx.destination`, untouched.
- Amplitude is withheld on that route and says why, in the space the figure
  would have occupied.
- A substituted device stops the stream rather than being measured under the
  requested input's name. Aliases (`default`, `communications`) are excluded on
  both sides.
- One owner for the microphone across permission, capture and the device test.
- Hot plug no longer re-resolves a selection that is still available, and an
  input that disappears mid-capture stops it.

## What was got wrong on the way

Recorded because two of these cost real time, and because the shape of the
error is worth recognising again.

- A theory that disabling gain control starved the input was carried for days.
  A Samsung log killed it: gain control alone moved the level 5.6 dB and
  produced no spectral content at all.
- From finding 1 came the conclusion that `deviceId` was decoration on Android
  and no constraint could fix it. That was true only of the profile it was
  tested under, and generalising it was wrong — echo cancellation fixes the
  routing.
- A Pixel 9 lock under full voice processing was read as the phone's own
  microphone hearing the watch across the desk. More likely it was the USB
  device, reached by the communication route.

Each of these was an inference from one configuration presented as a property
of the platform. The review's insistence on physical source verification is the
correction, and it was right.

## What made it tractable

Wireless adb with Chrome DevTools driving the live page, which turned a
round trip per hypothesis into experiments measured in seconds. Findings 1, 3
and 4 all needed instrumented captures run directly on the device.

## Narrowed afterwards: one browser, not the platform

Everything above was measured on Chrome for Android, and written as though it
described the platform. Firefox for Android then measured the same watch
through the same USB adapter and returned a clean signal with no clipping and a
settled rate, which is the one result none of the Chrome sessions could produce.

So the gain control is Chrome's. The app now shows amplitude everywhere and
warns underneath it only on Chromium browsers for Android — Chrome, Edge,
Opera, Samsung Internet, anything carrying a Chrome/ token. A figure that can
be checked against another device is worth more than a blank that cannot be
checked against anything.

What is still unverified is whether Firefox for Android needs the communication
route at all: its session had echo cancellation forced on by the automatic
rule, so the direct route was never tried there. And its amplitude has not yet
been held against the 282-291 degree reference.

## Still open

- Whether a native capture bridge is worth building. USB Audio Recorder PRO
  demonstrates that an Android app can reach the pickup cleanly, so the ceiling
  here is the browser's, not the platform's.
- The recordings behind this document are 16-bit PCM from a third-party
  recorder. `CLAUDE.md` requires 32-bit float for fixtures, so they are
  reference material rather than corpus.
- Whether the Pixel 9 Pro behaves as the 3 XL did. Everything here is one
  handset plus corroborating logs from the other.
