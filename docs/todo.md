# To do

Rewritten 2026-09-05. Closed items are gone rather than archived — the reasoning
worth keeping lives beside the code it explains.

---

# Yours

## 1. Verify amplitude against a known-good instrument

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

## 2. Community logs, if they come

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

- **`App.tsx` is 1,375 lines**, up from about a thousand. The inspection
  sequencing came out into `useInspectionRun`; capture, the engine, the session,
  the device test and the exporters are still in one file. The capture
  lifecycle — owner, in-flight guard, release, retained reading — is now
  intricate enough to be worth its own hook.

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

## Cannot be fixed here

- **Amplitude is not trustworthy on Chromium browsers on Android.** The only
  audio route that reaches a USB pickup on Android is the communication route,
  and on Chrome it applies gain control below the browser that no constraint can
  see or switch off: the level reaches full scale within a second and padding
  the movement raises it rather than lowering it. Rate and beat error read
  timing and survive. The figure is shown with a warning under it rather than
  withheld, because a caveated reading can be checked against another device and
  a blank cannot. Firefox on Android is unaffected. Measured in full in
  `android-usb-audio-findings.md`.

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
  being worked out is gone. The Device check tab measures all six constraint
  combinations if a device ever disagrees.
- **No mocked tests for `startCapture` or the audio-wired components.** Mocking
  the Web Audio graph would test the mock. Everything that takes plain props is
  tested, because there is nothing to mock. The cost is real and worth naming:
  stopping a capture now keeps the reading on screen, and that behaviour has no
  automated test — it was confirmed on an iPhone and a Pixel by eye.

---

*480 tests across 31 files as of 2026-09-05.*
