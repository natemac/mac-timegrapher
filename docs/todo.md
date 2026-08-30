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

**Still worth watching in use:** whether Settled now arrives too easily. If it
fires within a second or two of every Go, rate wants tightening towards ±0.6.
"Steadiness of this bench" in settings prints what each has held.

`STALL_SECONDS` in `wizard.ts` is 75. It should now be reached far less often;
if it never is, it can come down.

---

# Mine — code, waiting on nothing

## Known gaps

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
