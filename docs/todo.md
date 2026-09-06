# To do

Rewritten 2026-09-05, updated 2026-09-06 for the v36 interface. Closed items are
gone rather than archived — the reasoning worth keeping lives beside the code it
explains.

---

# Yours

## 1. Bench-test the new interface

Build `260906-1640` replaced the whole view layer and nothing in it has been run
against real audio. The browser preview blocks microphone access, so everything
below was verified as logic, geometry or markup and not as a measurement. This
is the first pass on hardware.

Take an iPhone and an Android handset, both with the USB pickup.

- **A live reading, end to end.** Rate, amplitude, beat error and beat rate
  filling in; the ± spreads appearing after the three-second warm-up; the
  reading staying on screen when you press Pause rather than being wiped.
- **The stability bar.** It should crawl right as the reading tightens and enter
  the green oval exactly when LOCKED lights — never before. If the cursor is
  sitting in the green under a lit MOVING, that is a bug and worth a screenshot.
  Its tooltip names what it is waiting on.
- **Device Check, the whole list.** One press, works down fifteen rows lighting
  one at a time, about twelve seconds — half a minute with the movement box
  ticked and the watch on the sensor. Watch for: the input row naming the pickup
  rather than the built-in mic, the three processing rows, audio timing passing
  after its ten seconds, and frequency range passing (it fails a Bluetooth
  headset by design — worth trying one to see it fail).
- **The inspection run.** Six positions, three-second countdown, auto-capture
  firing on a settled reading, the report opening itself after the sixth.
- **The report, both sizes.** Export PDF at 8.5 x 11 and at 3.5 x 2. The card was
  measured to fit with about two lines spare for notes; a longer note spills to a
  second card on purpose. Turn on Settings → Show Brand Logo and check the mark
  prints on both. **iOS Safari print behaviour is the least certain part of
  this** — it has never been exercised.
- **Chrome on Android specifically.** The amplitude figure should carry
  "May be inaccurate in this browser — try Firefox" beneath it. Firefox on the
  same handset should not.
- **Quartz calibration** still runs to 900 beats and offers its correction.

## 2. Verify amplitude against a known-good instrument

Still the only thing on this list that could invalidate the tool, and it still
matters because amplitude prints on a customer-facing document. But it is a
narrower question than it was.

What 2026-09-05 settled, on one NH35 through one USB pickup within a few
minutes:

| source | amplitude |
| --- | --- |
| Native C core, on clean audio recorded off the phone | 282-291° |
| The WebAssembly build, on the same audio | 285° |
| iPhone, Safari, USB pickup | 267-291° |
| iPhone, its own microphone | 270° |
| Mac Safari / Mac Chrome | 279° / 274° |
| Firefox on Android | 267-280° |

So the port is internally consistent, the browser agrees with the native core
on identical samples, and four platforms and two kinds of sensor agree with
each other. Erratic is ruled out. A wrong lift angle is not — a consistent
proportional error would move every row together and look exactly like this.

**What remains is one comparison against an instrument that is not ours.** Put
the same watch on a Weishi or equivalent, same position, and compare. Agreement
within a few degrees closes this for good.

Calibrate the audio clock first (Settings → Quartz calibration). It corrects
rate, not amplitude, but a bench that has not been calibrated is not a bench you
can compare anything against.

## 3. Community logs, if they come

Two of the three gaps here have now been filled by the Android work, both with
the same movement:

- A phone microphone rather than a USB pickup — the iPhone reads 270° on its
  own microphone at 30 dB over the room, against 267-291° through the pickup.
- A second sensor path entirely, through a different operating system.

**Still missing, and still the one that would move things most: a watch close to
in beat, under about 0.3 ms.** That is the case the ±1.5 ms bound is loose for,
and no log has ever shown one. Also useful: a slow beat (18,000), a fast one
(28,800), and a movement that is genuinely unwell.

Settings → Session diagnostics exports what is needed. If a log says
`autoGainControl: applied`, or comes from a Chromium browser on Android, its
amplitude figures are invalid and must not go into any calibration — see the
note under "Cannot be fixed here".

---

# Mine

## Known gaps

- **The watch is still settling when a position records.** In the 2026-08-30
  logs, rate fell and amplitude dropped across the eighteen seconds before
  recording, and neither had flattened. That is the movement recovering from
  being handled, not a fault — but the recorded figure is taken during the
  recovery. The three-second grace gets a hand off the watch; it does not wait
  for the watch. Worth deciding whether a position should wait for the trend to
  flatten rather than only for the spread to close.

- **`App.tsx` is 1,170 lines.** Down from 1,375 — the device check, the settings
  store and the report all came out — but capture, the engine, the session and
  the exporters are still in one file. The capture lifecycle — owner, in-flight
  guard, release, retained reading — is intricate enough to be worth its own
  hook.

- **Two open questions on the printed report.** The 8.5 x 11 sheet is correct but
  sparse: content fills roughly the top fifth and the rest is white. And the
  Chromium-Android amplitude caveat is on screen but not on the document, which
  is parity with the old app rather than a decision — a wrong amplitude on a
  certificate handed to a customer outlives one on a screen. Both want deciding
  deliberately rather than drifting.

- **The Firefox capture hang was never reproduced on the reporting hardware.**
  `await ctx.resume()` can hang forever when Firefox holds a context back, and
  that is fixed and verified against a synthetic reproduction. It was never
  caught hanging on the Mac that reported it, so the fix is inferred to be the
  whole cause rather than shown to be. The symptom to watch for is the Start
  button greying and staying grey.

- **Two commits parked on `firefox-audio-wip`.** A device-presence check by id
  or label, written while hunting the above on a premise the probe then
  disproved — Firefox returned the id it was asked for. The empty-enumeration
  guard in it is sound on its own terms; the rest is hardening for a fault never
  observed. Nothing needs doing with it.

- **No landscape layout.** Portrait-locked in the manifest. A landscape bench
  setup would want two columns.

- **The device check has never run against real audio.** Its sequencing, failure
  paths and cancellation are covered by tests with a mocked capture; the
  measurements it takes — timing, level, headroom, spectrum, beat lock — have
  only ever seen silence. See item 1.

## Cannot be fixed here

- **Amplitude is not trustworthy on Chromium browsers on Android.** The only
  audio route that reaches a USB pickup on Android is the communication route,
  and on Chrome it applies gain control below the browser that no constraint can
  see or switch off: the level reaches full scale within a second and padding
  the movement raises it rather than lowering it. Rate and beat error read
  timing and survive. The figure is shown with a warning under it rather than
  withheld, because a caveated reading can be checked against another device and
  a blank cannot. Firefox on Android is unaffected. Measured in full in
  `android-usb-audio-findings.md`. The warning is on the reading; it is not yet
  on the printed report — see "Known gaps".

- **AGC cannot be confirmed off on iOS.** Safari reports
  `autoGainControl: unreported`, so the constraint is requested and never
  acknowledged. Amplitude is the reading gain control would corrupt, and it is
  the one that cannot be checked — another reason item 1 matters. The
  diagnostics log states it plainly.

## Reference build

- **Native GTK build unverified since `algo.c` moved.** `Makefile.am` was
  updated but never compiled — GTK+3, PortAudio, pkg-config and automake are not
  installed here. Only matters when a direct A/B against native tg is wanted.
- **WAV file input for the native build.** Native tg cannot read files, which is
  why upstream's C was kept. A file-input mode in `tools/` would allow an exact
  comparison on identical samples rather than two live measurements.

---

# Undecided

- **Three bench recordings exist and are not in the repo.** Made on a Pixel 3 XL
  through the USB pickup with USB Audio Recorder PRO, kept in
  `~/Downloads/timegrapher-android-recordings/`: 111s, 35s and 33s, one padded
  and one not. They are the first real audio the WebAssembly build has ever been
  checked against, and it matched the native core on them exactly.

  They are 16-bit PCM, and `CLAUDE.md` requires 32-bit float for fixtures on the
  grounds that quantisation is permanent. So they are reference material rather
  than corpus. Three ways to go: add them as-is with their provenance recorded,
  keep them out of git and use them locally, or re-record at 32-bit float on the
  bench and make a proper corpus then.

---

# Deliberately not done

- **No QC pass/fail on the document.** Thresholds are business rules that differ
  by calibre and by customer; they belong in the private application, not a
  public GPL tool. The document reports the numbers and leaves the judgement to
  the watchmaker who signs it.
- **No build-record integration.** Wants an authenticated endpoint on the PHP
  side first. The session already copies as tab-separated text that pastes into
  a spreadsheet.
- **There is no recorder.** One existed to produce DSP fixtures and was never
  wired to the UI, so it was removed along with its panel. What survives is
  `audio/wav.ts`, the 32-bit float encoder that
  `tools/make-synthetic-fixture.mjs` uses to generate a signal with an exactly
  known beat period — the only fixtures anything here has ever needed. Capturing
  real bench audio is a job for a recorder app, which is how the three
  recordings above were made.
- **No choice of microphone route.** Android needs the communication route to
  reach a chosen input at all — both Chrome and Firefox fail without it, on two
  handsets — and every other platform wants the direct one. The answer is the
  same for every device tested, so the setting that briefly existed while it was
  being worked out is gone.

- **No six-way constraint sweep any more.** The tool that opened every
  processing combination existed to root-cause the Android routing failure. That
  is understood and the fix ships in `capture-route.ts`, so the Device Check is
  now one pass on the route the app actually measures through. If a new handset
  or browser ever disagrees, recover the sweep from
  `git show 16c38dc:web/src/audio/device-test.ts`.
- **No mocked tests for `startCapture` or the audio-wired components.** Mocking
  the Web Audio graph would test the mock. Everything that takes plain props is
  tested, and every decision behind the audio — the check's sequencing, the
  stability position, the report layout, the movement resolution — lives in a
  pure module that is. The cost is real and worth naming: what the app does with
  actual sound is confirmed by eye at the bench, not by CI.

- **No fixed-height layout.** The old interface held itself to one `100dvh` view
  and every addition had to earn its height against it. The v36 design does not,
  and the page scrolls where it needs to.

---

*492 tests across 29 files as of 2026-09-06, build `260906-1640`.*
