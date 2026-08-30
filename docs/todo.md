# To do

Written 2026-08-30. Ordered by what unblocks the most.

---

## 1. Verify amplitude against a known-good instrument

**This is the only thing on the list that could invalidate the tool.**

Rate and beat error come from *when* ticks happen, and those are confirmed —
against synthetic signals with exact known timing, against the native reference
build, and against a real NH35. Amplitude comes from the *shape* of the
escapement impulse, and it has never been compared with anything.

The number is plausible (250° on a running NH35 is believable) but plausible is
not verified. Put the same watch on a Weishi or equivalent, in the same
position, and compare.

- If amplitude agrees within a few degrees, the port is sound and this can be
  closed.
- If it is consistently off by a fixed proportion, suspect the lift angle
  (see 2).
- If it is erratic, the impulse detection needs looking at.

## 2. Confirm the preset lift angles

`web/src/timegrapher/movements.ts` uses commonly-published lift angles: 53° for
the NH family, 51° Miyota, 52° PT5000/ST2130, 50° ETA/Sellita.

Amplitude is calculated straight from this number — a degree out is about two
percent of amplitude, enough to move a reading across a healthy/unhealthy line.
Worth checking against manufacturer service data before amplitude from a preset
goes into a permanent build record.

## 3. Record a reference fixture

`fixtures/` is still empty, so there is no regression corpus. Any future change
to the DSP is currently checked only against synthetic signals, which cannot
test amplitude at all.

Procedure is in `docs/bench-checklist.md`. One 30-second NH35 recording with its
`.json` metadata is enough to start; more positions and a faulty movement would
make it much stronger.

## 4. Decide what the certificate should say

The certificate deliberately records measurements without grading the watch —
pass/fail thresholds are business rules that differ by calibre and customer, and
they belong in the private application rather than a public GPL tool.

Worth deciding before it goes to a customer:

- **Does it need a pass/fail or a grade?** If so, those thresholds should come
  from the private side, not be hardcoded here.
- **Wording of the method statement.** It currently says the certificate records
  measurements and asserts no conformance to a standard. That is honest, and
  worth keeping unless you intend to certify against something specific.
- **Amplitude's caveat.** The certificate names the lift angle it used, because
  amplitude is derived from that rather than measured. Until item 1 is done,
  amplitude on a customer-facing document is unverified.
- **Whether to note the regulation state** — as-found versus as-left. A
  before-and-after pair would be more useful than a single reading, and the
  session store could hold both.
- **Whether a certification run should record how it was taken.** The Certify
  wizard restarts the average at every position and waits for the reading to
  settle before recording, which is a stronger claim about the numbers than the
  certificate currently makes. It may be worth saying so on the document.

## 5. Decide on the settled thresholds

`web/src/timegrapher/stability.ts` uses ±1.0 s/day, ±8° and ±0.3 ms, calibrated
from hand-held bench readings. A rigid sensor mount should do considerably
better, and the thresholds could tighten.

Watch whether the indicator reaches **Settled** in ordinary use. If it settles
instantly every time, they are too loose; if it rarely settles, too tight.

---

## Smaller items

- **Native GTK build unverified.** `src/` still holds upstream's application and
  `Makefile.am` was updated when `algo.c` moved, but it has never been compiled
  since — GTK+3, PortAudio, pkg-config and automake are not installed. Only
  matters when a direct A/B against native tg is wanted.
- **WAV file input for the native build.** Native tg cannot read files, which is
  why upstream's C was kept. Adding a file-input mode to `tools/` would allow an
  exact comparison on identical samples rather than two live measurements.
- **Trace magnification default.** Currently 20 ms. 10 ms looked better in use;
  worth settling after some bench time.
- **The stall threshold is a guess.** `STALL_SECONDS` in
  `web/src/timegrapher/wizard.ts` is 75 seconds — after that the Certify wizard
  stops promising the reading will settle and lets it be captured anyway. Never
  measured against how long a hand-held sensor actually takes on a difficult
  movement.
- **Auto-capture has only been exercised synthetically.** The two-report
  confirmation and the stall path are unit-tested, but no watch has yet gone
  through a full six-position run unattended.
- **Trace floor is 96px.** Certify mode leaves the trace about 106px on a
  375x812 screen. Readable, but if it proves too short in use the height has to
  come from somewhere else — the setup panel collapsing to a summary line while
  capturing is the obvious candidate.
- **`web/.oxlintrc.json` is untracked** — swallowed by upstream's bare `.*`
  gitignore pattern. `npm run lint` therefore behaves differently for a fresh
  clone. One negation line fixes it.
- **The stopped waveform keeps its last frame** until the next capture starts.
  Cosmetic.
- **No landscape layout.** The app is portrait-locked in the manifest; a
  landscape bench setup would want a two-column arrangement.

---

## Deliberately not done

- **Recording removed from the UI.** It existed to produce DSP fixtures; the
  code is still in `web/src/audio/wav-recorder.ts` if fixtures are wanted again.
- **No QC pass/fail.** Thresholds are business rules and belong in the private
  application, not in a public GPL repo. The session sheet reports the numbers
  and leaves the judgement to the operator.
- **No build-record integration.** Milestone 7. Wants an authenticated endpoint
  on the PHP side first; the session already exports tab-separated text that
  pastes into a spreadsheet in the meantime.
- **No mocked tests for `startCapture` or the React components.** Mocking the
  Web Audio graph would test the mock. They are verified at the bench.
