# To do

Rewritten 2026-08-30. Split by who can actually do each thing: some of these
need a watch, a bench and a decision, and no amount of code will settle them.

---

# Yours — needs a bench, or a call only you can make

## 1. Verify amplitude against a known-good instrument

**Still the only thing on this list that could invalidate the tool**, and it
matters more now that amplitude prints on a customer-facing certificate.

Rate and beat error come from *when* ticks happen, and those are confirmed —
against synthetic signals with exact known timing, against the native reference
build, and against a real NH35. Amplitude comes from the *shape* of the
escapement impulse, and it has never been compared with anything.

250° on a running NH35 is believable. Believable is not verified. Put the same
watch on a Weishi or equivalent, same position, and compare.

- Agrees within a few degrees → the port is sound, close this.
- Off by a consistent proportion → suspect the lift angle (2).
- Erratic → the impulse detection needs looking at.

## 2. Confirm two remaining lift angles

The table is now the bench's own figures. Two are still working values and the
app marks them **unverified** where they are shown:

- **PT5404** — 50°
- **ST2130** — 50°

Everything else is taken as confirmed. Worth noting five presets changed when
the table went in: Miyota 8215 and 8205 from 51 to 49, and PT5000, PT5404 and
ST2130 from 52 to 50. Any amplitude recorded for those calibres before
2026-08-30 reads about four percent high.

## 2b. Decide whether quartz needs to work at all

The quartz calibres are listed, and the app correctly refuses to report
amplitude or beat error for them — a stepper motor has no balance wheel, so
those are not unknown, they do not exist.

**Rate is the open question.** The DSP looks for an escapement between 8,100 and
72,000 beats an hour. A seconds hand stepping once a second is 3,600, which is
under the floor, so for most quartz the app will read nothing at all. A calibre
that steps upwards of about 2.25 times a second falls inside the range.

Three ways forward, and this is a call rather than a task:

- **Leave it.** The presets name the calibre on an inspection and the document
  is honest about what was not measured.
- **Measure one** — put a VK63 or VH31 on the sensor and see whether rate
  appears. That settles it in five minutes.
- **Build quartz rate properly.** A stepper interval is a much easier signal
  than an escapement, but it is a separate measurement path in the C core, not
  a setting.

## 2c. Sound-card clock calibration — the one thing upstream has that we do not

Found 2026-08-30 by reading `core/tg_algo.c` against what the web app exposes.

`process_cal` and `compute_cal` are **already compiled into our WebAssembly**
and nothing calls them. Upstream points the analysis at an accurate 1 Hz
reference, regresses measured phase against elapsed time, and gets the audio
clock's drift in seconds per day. It then corrects every reading:

    sample_rate = nominal_rate * (1 + cal / (10 * 3600 * 24))

**Why this matters more than it sounds.** A sound card that reports 44,100 Hz is
not running at exactly 44,100 Hz. Crystals are typically 10 to 100 parts per
million out. Every part per million is 0.0864 s/day of error in rate:

| clock error | rate error |
|---|---|
| 10 ppm | 0.86 s/day |
| 50 ppm | 4.3 s/day |
| 100 ppm | 8.6 s/day |

**It is invisible to everything we currently measure.** It is a constant offset,
so it is perfectly repeatable — "Steadiness of this bench" would read ±0.42 with
the whole scale shifted by five seconds a day and never hint at it.

**And it means rate has never been verified in absolute terms either.** The
synthetic-signal tests generate samples at an assumed rate and measure them at
the same assumed rate, which is circular; they prove the algorithm is
self-consistent, not that the clock is right. The NH35 readings were never
compared against a reference. So rate joins amplitude as unverified — for a
different reason, and a more easily fixed one.

Two ways to measure it:

- **Upstream's way.** A known-accurate 1 Hz source — a quartz watch ticking
  seconds — held to the sensor for a couple of minutes. Needs the calibration
  path exposed through `wasm/bindings.c` and the worker.
- **A browser-native way, probably better here.** Compare
  `AudioContext.currentTime` against `performance.now()` over a few minutes.
  The audio clock advances with the sound card; `performance.now()` advances
  with the system clock, which is NTP-synced and orders of magnitude better than
  any sound-card crystal. That needs no reference watch and no C at all, and it
  can run quietly during an ordinary session.

Applying the result is one line either way — `tg_config.sample_rate` is already
the only place the rate enters the arithmetic.

**Not started.** It wants a decision first: whether to expose upstream's path or
measure against the system clock.

## 3. Run a full six-position inspection on a real watch

The whole Start-driven flow — three-second grace, automatic record, stop between
positions — is covered by unit tests and has never met a movement. Specifically
worth watching:

- Does **automatic record** fire, and on a reading you would have accepted?
- Is **three seconds** enough to get clear, or does the first reading still
  carry handling noise?
- Does stopping and restarting the microphone each position cause any hitch?
- Does the run reach **Settled** at all six positions, or stall on some?

## 4. Record a reference fixture — optional, and here is why it exists

You asked what this is for. Straight answer: it is insurance against the DSP
being changed later and quietly breaking.

Right now the only automated check on the measurement core is synthetic signals
with known timing. Those prove rate and beat error, and **cannot test amplitude
at all** — amplitude comes from the shape of a real escapement impulse, and a
generated square wave does not have one. So if a future change to the core made
amplitude wrong, nothing in the test suite would notice.

A fixture is one real 30-second recording plus the numbers it should produce.
Any later change gets run against it.

**It is only worth doing if the DSP is going to change.** If the core is
finished, this is optional and can be dropped. It becomes worth doing the moment
someone touches `core/` — including for quartz support (2b), which would.

The WAV recorder still exists in `web/src/audio/wav-recorder.ts` — taken out of
the UI, not deleted. Say the word and it comes back.

## 5. Decide what the inspection document says

It records measurements and deliberately does not grade the watch: pass/fail
thresholds are business rules that differ by calibre and customer, and belong in
the private application rather than a public GPL tool.

Done since this was written: it is headed **Timing Inspection**, and it prints
**As found** and **As left** side by side with a before-and-after comparison
when both passes exist.

Still open:

- **Does it need a grade or pass/fail?** If so, those thresholds come from the
  private side, not hardcoded here.
- **Does it say how it was taken?** A run restarts the average at every position
  and waits for it to settle — a stronger claim about the numbers than the
  method statement currently makes.
- **Is a signature line still wanted** now that there is a technician field?

## 6. Settled thresholds — done, from your bench data

Recalibrated 2026-08-30 against a USB pickup on a running NH35 at 29 dB above
the room:

| | bench holds | bound was | bound now |
|---|---|---|---|
| Rate | ±0.2 to ±0.5 s/day | ±1.0 | ±1.0 |
| Amplitude | ±9 to ±12° | ±8 | ±15 |
| Beat error | ±0.82 to ±0.89 ms | ±0.3 | ±1.5 |

Beat error was the blocker — three times tighter than the bench can hold — so
nothing ever settled and automatic inspection never recorded. Rate is now the
criterion; the other two are sanity bounds. The three real readings are
replayed as tests.

Re-measured 2026-08-30 from an iPhone inspection log, after low-confidence
samples stopped being averaged in (see below). At full analysis confidence the
same bench holds:

| | at full confidence |
|---|---|
| Rate | ±0.42 s/day |
| Amplitude | ±3.0° |
| Beat error | ±0.045 ms |

**The bounds are now much looser than this bench needs**, and could come down a
long way — but not on one run, and not on this watch. Beat error especially:
this movement is 1.6 ms out of beat, which is where the figure is stable. A
watch that is *well* in beat sits at the resolution floor and jumps about, which
is why the bound is 1.5 rather than 0.1. Collect a few more logs, including a
watch that is close to in beat, before tightening anything.

**The binding constraint is now the twenty-second floor**, not the spreads.
`settling()` will not say Settled before `secondsCaptured >= 20` however steady
the reading is. That is what a run costs per position now. Worth deciding
whether twenty seconds is right — it is defensible for a recorded figure, but
it is the number to change if an inspection feels slow.

`STALL_SECONDS` in `wizard.ts` is 75. It should now be reached far less often;
if it never is, it can come down.

---

# Mine — code, waiting on nothing

## Known gaps

- **The watch is still settling when a position records.** In the 2026-08-30
  log, rate fell from 13.0 to 11.7 and amplitude from 218 to 210 over the
  eighteen seconds before it recorded, and neither had flattened. That is the
  movement recovering from being handled, not a fault — but the recorded figure
  is taken during the recovery. The three-second grace gets a hand off the
  watch; it does not wait for the watch. Worth deciding whether a position
  should wait for the trend to flatten rather than only for the spread to
  close.
- **AGC cannot be confirmed off on iOS.** Safari reports
  `autoGainControl: unreported`, so the constraint is requested and never
  acknowledged. Amplitude is the reading gain control would corrupt, and it is
  the one that cannot be checked. Another reason item 1 matters.
- **The record → stop → next-position handoff has no test.** The state machine
  and the panel are both covered; the orchestration between them lives in
  `App.tsx` effects and is verified only by reading it. Extracting it into a
  hook would make it testable. Next thing I pick up.
- **`App.tsx` is over 800 lines** and holds capture, the engine, the wizard, the
  session and the exporter. It has grown past the point where the effects are
  easy to reason about together — the extraction above is the first slice of
  fixing that.
- **No landscape layout.** Portrait-locked in the manifest. A landscape bench
  setup would want two columns.
- **The certificate has no test.** It is a plain-props component like the
  others, and it is the one thing a customer sees.

## Reference build

- **Native GTK build unverified since `algo.c` moved.** `Makefile.am` was
  updated but never compiled — GTK+3, PortAudio, pkg-config and automake are not
  installed here. Only matters when a direct A/B against native tg is wanted.
- **Upstream's snapshot save/load** (`src/serializer.c`) has no equivalent. It
  writes a display to a file and reopens it. The inspection record and the
  saved-reading image cover the practical need differently; worth knowing it
  exists rather than porting it.
- **Upstream's "light algorithm" mode is not worth porting.** `process()` takes
  a `light` flag that skips work for slow machines; we pass 0, which is the
  fuller and more accurate path. Nothing to gain.
- **WAV file input for the native build.** Native tg cannot read files, which is
  why upstream's C was kept. A file-input mode in `tools/` would allow an exact
  comparison on identical samples rather than two live measurements.

---

# Deliberately not done

- **No QC pass/fail.** Thresholds are business rules and belong in the private
  application, not a public GPL repo. The session reports the numbers and leaves
  the judgement to the watchmaker who signs it.
- **No build-record integration.** Milestone 7, and it wants an authenticated
  endpoint on the PHP side first. The session already exports tab-separated text
  that pastes into a spreadsheet.
- **Recording is not in the UI.** It existed to produce fixtures; the code stays
  for when item 4 happens.
- **No mocked tests for `startCapture` or the audio-wired components.** Mocking
  the Web Audio graph would test the mock. Components that take plain props —
  `SourceFooter`, `SessionSheet`, `MeasurementPanel`, `InspectionWizard`,
  settings persistence — are tested, because there is nothing to mock.

---

*235 tests across 17 files as of 2026-08-30.*
