# To do

Rewritten 2026-09-05, updated 2026-09-07 after the first bench session on the
v36 interface. Closed items are gone rather than archived — the reasoning worth
keeping lives beside the code it explains.

---

# Yours

## 1. Finish the bench pass

The first session on 2026-09-06 went through the whole interface on an iPhone
with the USB pickup and on Android, and everything measured. What it found has
been fixed and shipped; what it has not covered yet:

- **Print the report from iOS Safari at both sizes.** The layout is verified by
  measurement — the card fits its 3.26 x 1.76in with 28px to spare — but Safari's
  print dialog honouring a 3.5 x 2in `@page` is not.
- **The Bluetooth case.** Device Check's frequency-range row is designed to fail
  a voice channel; running it against a headset is the only way to see it work.
- **A movement that is genuinely unwell**, and one close to in beat. See item 3.
- **The PWA on the home screen.** Splash and status bar were verified light; the
  service worker's new twenty-asset cap has not been watched across a deploy.

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

- **The 8.5 x 11 sheet has white space below the method statement.** Not wrong,
  just unfinished-looking. Whether that wants filling is a design decision.

- **The watch is still settling when a position records.** In the 2026-08-30
  logs, rate fell and amplitude dropped across the eighteen seconds before
  recording, and neither had flattened. That is the movement recovering from
  being handled, not a fault — but the recorded figure is taken during the
  recovery. The three-second grace gets a hand off the watch; it does not wait
  for the watch. Worth deciding whether a position should wait for the trend to
  flatten rather than only for the spread to close.

- **`App.tsx` is 1,238 lines.** Down from 1,375 — the device check, the
  settings store and the report all came out — but capture, the engine, the
  session and the exporters are still in one file. The capture lifecycle —
  owner, in-flight guard, release, retained reading — is intricate enough to be
  worth its own hook.

- **The Chromium-Android amplitude caveat is on screen but not on the printed
  document.** That is parity with the old app rather than a decision. A wrong
  amplitude on a certificate handed to a customer outlives one on a screen, and
  the sheet already carries a method statement that would be the place to say
  it.

- **Device Check reports a −80 s/day audio-clock drift under an OK badge.** Seen
  on an iPhone at 44,100 Hz, which is that platform's documented behaviour, and
  the analysis on the same run read +1.0 s/day — so the audio path is fine and
  the figure is an artefact. But an alarming number presented as a pass is the
  same fault as putting a spread on a summary: it invites a conclusion the app
  is not making. The row should either explain itself or not print the
  figure.

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

- **About 121 MB of old builds accumulated on the server** before being swept on
  2026-09-06. Asset filenames carry a content hash, so a deploy adds files and
  nothing prunes what it leaves — 235 files against the 6 in use. The upload
  credentials cannot delete, so this is a File Manager job; `deployment.md`
  records how to work out what is safe to remove. Worth checking every few
  dozen deploys.

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

- **No spread, lowest amplitude or greatest beat error on any summary.** Every
  one is a range over six samples, which makes it the most outlier-sensitive
  figure obtainable from a run: one knock of the bench during one position moves
  all three and none of the averages. The six readings are printed in full, so
  the extremes are there for anyone who wants them — they are simply not
  presented as a conclusion.

- **No quartz calibres in the movement list.** They were there so an inspection
  could name one, with amplitude and beat error withheld as meaningless. The v36
  preset table is mechanical only. `isQuartz()` and the withholding logic remain
  and are still correct if they are ever put back.

- **No degree of lock.** The stability marker fills the settled region rather
  than taking a position inside it. The verdict is binary and showing the marker
  creeping about invited reading a confidence the app does not claim.

---

*488 tests across 29 files as of 2026-09-07, build `260906-2257`.*
