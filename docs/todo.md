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

## 2. Confirm the preset lift angles

`web/src/timegrapher/movements.ts` uses commonly-published figures: 53° for the
NH family, 51° Miyota, 52° PT5000/ST2130, 50° ETA/Sellita.

Amplitude is calculated straight from this. A degree out is about two percent of
amplitude — enough to move a reading across a healthy/unhealthy line. Worth
checking against manufacturer service data before a preset-derived amplitude
goes on a permanent build record.

## 3. Run a full six-position inspection on a real watch

The whole Start-driven flow — three-second grace, automatic record, stop between
positions — is covered by unit tests and has never met a movement. Specifically
worth watching:

- Does **automatic record** fire, and on a reading you would have accepted?
- Is **three seconds** enough to get clear, or does the first reading still
  carry handling noise?
- Does stopping and restarting the microphone each position cause any hitch?
- Does the run reach **Settled** at all six positions, or stall on some?

## 4. Record a reference fixture

`fixtures/` is still empty, so there is no regression corpus. Any future DSP
change is checked only against synthetic signals, which cannot test amplitude at
all. Procedure in `docs/bench-checklist.md`. One 30-second NH35 recording with
its `.json` metadata starts it; more positions and a faulty movement make it
much stronger.

The WAV recorder still exists in `web/src/audio/wav-recorder.ts` — it was taken
out of the UI, not deleted. Say the word and it comes back for this.

## 5. Decide what the certificate says

It records measurements and deliberately does not grade the watch: pass/fail
thresholds are business rules that differ by calibre and customer, and belong in
the private application rather than a public GPL tool.

Open questions:

- **Does it need a grade or pass/fail?** If so, those thresholds come from the
  private side, not hardcoded here.
- **As-found versus as-left.** A before-and-after pair is more useful than a
  single reading, and the session store could hold both.
- **Does it say how it was taken?** An inspection run restarts the average at
  every position and waits for it to settle — a stronger claim about the numbers
  than the document currently makes.
- **Naming.** The mode is called Inspection; the document is still headed
  "Timing Certificate". One of those should probably move.

## 6. Settle the thresholds

`stability.ts` uses ±1.0 s/day, ±8° and ±0.3 ms, calibrated from hand-held bench
readings. A rigid mount should beat these comfortably. Watch whether the
indicator reaches **Settled** in ordinary use: instantly every time means too
loose, rarely means too tight.

`STALL_SECONDS` in `wizard.ts` is 75 — after that the wizard stops promising the
reading will settle and lets it be recorded anyway. That number is a guess.

---

# Mine — code, waiting on nothing

## Known gaps

- **The guide never mentions the inspection run.** `guide-content.tsx` explains
  the four readings, the signal meter and both graphs, but nothing tells a
  newcomer what the six-position flow is for or how to work it. The flow changed
  under it and the guide did not follow.
- **The record → stop → next-position handoff has no test.** The state machine
  and the panel are both covered; the orchestration between them lives in
  `App.tsx` effects and is verified only by reading it. Extracting it would make
  it testable.
- **The stopped waveform keeps its last frame** until the next capture starts.
  Cosmetic, but it reads as though capture were still running.
- **No landscape layout.** Portrait-locked in the manifest. A landscape bench
  setup would want two columns.

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
