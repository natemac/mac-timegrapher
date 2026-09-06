# UI overhaul — v36 design integration

Branch: `ui-overhaul`. Baseline: `16c38dc`.

Source of truth for the new interface is `timegrapher-v36.html` and
`readme_ui_update.md`. The measurement engine, DSP, audio path and stored data
model are unchanged. Nothing in this document was invented to fill a gap — where
the design left something out, it is listed below and **left out**, per the
instruction not to re-add omitted items.

The three graphs — Trace, Beat, Waveform — are the one part the design agent was
not given, so they are adapted rather than replaced: the existing validated
canvas renderers are dropped into the design's graph surface.

---

## A. Present in the old app, not in the new design

Listed for a decision. Nothing here was added back on my own judgement; A1 was
restored later, on request. Each entry says what it did, what it costs to lose
it, and what restoring it would take.

### A1. Amplitude warning on Chromium for Android — ~~omitted~~ **restored**

*Restored on request, after the first deploy. Kept here for the reasoning.*

The old app printed a small caveat under the amplitude figure whenever the
browser was Chrome (or another Chromium) on Android:

> May be inaccurate in this browser — try Firefox

This was not cosmetic. Chrome's Android communication route applies gain control
below the browser, `getSettings()` reports `autoGainControl: false` throughout,
and the resulting amplitude reads 156–171° against 276–291° for the same watch
and pickup on a Mac. Rate and beat error read timing rather than level and
survive; amplitude does not.

The v36 design had no place for it, so the first build shipped without it and a
Chrome-on-Android user saw a confident wrong number with nothing to distrust.

It now sits under the amplitude's ± line, in amber, wrapped inside the amplitude
column so it does not widen the grid — 137px in a 154px cell at phone width. The
figure is still shown rather than withheld: a caveated reading can be checked
against another device, a blank cannot be checked against anything, and the
caveat names the way out, since Firefox is on the same handset and measures this
correctly.

It appears only against a real figure — never against a dash, where there would
be nothing to doubt — and only on the route and browser where the fault was
measured. It costs the measuring screen about 29px of height, and only on the
affected platform.

**Not on the printed report.** The old app did not put it there either, so this
is parity rather than a decision. It is arguably worse there: a wrong amplitude
on a certificate handed to a customer outlives one on a screen. Worth deciding
deliberately.

### A2. Upstream attribution in the footer

The old footer read:

> Open source (GPLv2) — view source. Derived from tg by Marcello Mamino. Audio
> never leaves this device.

The new footer keeps the GPLv2 offer and the source link — which is the §3
obligation and is unconditional in both places the design puts it — but drops
"Derived from tg by Marcello Mamino."

Not a licence defect: the copyright notices live in `LICENSE` and in every source
header, and the source link reaches them. It is a courtesy credit to the upstream
author of a project this is a public fork of. One sentence restores it.

**Recommend restoring.**

### A3. Capture — save the reading on screen as an image

Live Timing had a Capture button that drew the current reading to a canvas and
handed it to the share sheet or a download. The design has no such control, and
its own guide copy still refers to it ("In the full app, Capture saves the
current screen as an image") — so this may be a wording leftover rather than a
deliberate cut.

`export/snapshot.ts` is left in the tree, unreferenced by the UI except for
`deliverSnapshot`, which the diagnostics and device-check exports still use. Dead
exports tree-shake out of the bundle, so this costs nothing to leave in place.

### A4. The timing certificate

`Certificate.tsx` was a full printable document: method statement (device, sample
rate, lift angle), per-position tables, a pre/post regulation comparison drawn
from saved history, notes, and signature lines. It printed through the page's own
print stylesheet.

The design replaces it with the inspection summary dialog's Export PDF, which
prints a build name, the six-position table, a regulation line, measured-by and
notes, at one of two page sizes. The pre/post comparison and the method statement
have no place in that layout — a 3.5″ × 2″ card cannot carry them.

`Certificate.tsx` and its test are removed in this change. Restore from
`git show 16c38dc:web/src/components/Certificate.tsx`.

### A5. Saved inspection history

The old app kept every inspection as a record, with a session sheet listing them,
a pre/post phase pairing, and a "start the next watch" action that carried the
technician over. The design states plainly that captures live in memory for the
page session and that reloading clears them, and asks the receiving app to decide
whether to integrate a storage model.

The storage modules (`timegrapher/inspections.ts` and its tests) are kept intact
and still used for the current run, so the readings survive a reload. What is not
surfaced anywhere in the new UI is the **list of past inspections** and the
before-and-after comparison built on it.

### A6. Inspection controls with no counterpart

The design's six position indicators are explicitly non-interactive, and it lists
no control for any of these. All are dropped:

| Old control | What it did |
| --- | --- |
| Jump to position | Tap a dot to re-measure one position without rerunning the set |
| Redo | Re-measure the position just captured |
| Skip | Move past a position without recording it |
| Finish early | Stop with fewer than six positions and keep what was recorded |
| Run complete screen | A summary stage with "Run again" and recorded/skipped counts |
| Stall handling | After 75 s unsettled, enable Record anyway with an explanation |

The state machine behind them (`timegrapher/wizard.ts`) is unchanged and still
exports `retry`, `skipped`, `finish`, `jumpTo`. Only the buttons are gone.

The stall case is the one worth a second look: with it removed, a position that
never settles has no route forward at all except pressing Stop, because Capture
is gated on `locked`.

### A7. Per-panel help

Every panel carried a **?** that opened that panel's note, with the guide as the
single source for the words. The design has one Guide tab and no per-panel
buttons. `guide-content.tsx` remains the single source, now read only by the
Guide tab.

### A8. Steadiness of this bench

A settings readout showing the tightest spread this bench has ever held against
the settled thresholds — the figure those thresholds are supposed to be
calibrated against. No counterpart in the design. `StabilityTracker.best()` still
computes it; nothing displays it.

### A9. Quartz movements

The old movement list included seven quartz calibres (VK61, VK63, VK64, VK67,
VK68, VK73, VH31), listed so a quartz watch could be named on an inspection, with
amplitude and beat error withheld as meaningless rather than shown as numbers.
The design's preset table is mechanical only.

`isQuartz()` and the withholding logic are kept and still correct; the calibres
are simply no longer selectable. **This one changes what the app can measure**,
not just how it looks.

### A10. Smaller items

- **Automatic wake lock while measuring.** Was implicit and always on during a
  capture; is now an off-by-default preference the operator has to find. A phone
  left to settle for thirty seconds will dim and lock unless they do.
- **Requested vs granted sample rate.** The old device panel showed both when
  they disagreed — the tell for the 44.1 kHz resample that starved the iOS clock.
  The design's Sample rate row shows one figure.
- **Hot-input advice.** "Input is hot — turn the microphone down in your system
  sound settings", shown only on platforms that actually have that control. The
  design's signal strip has a quality label and a dB figure only.
- **Positional spread.** The average spread across recorded positions, shown
  while a run was in progress.
- **Headroom line.** "Ticks stand N dB above the room."

### A11. The one-screen rule

`CLAUDE.md` records a hard rule from the old interface: *"The app never scrolls.
One `100dvh` view; only sheets scroll. Anything added has to earn its height or
go in a sheet."*

The new design does not hold to it, and this is a property of the design rather
than of the port. Measured side by side at 375 × 812 with both pages open on the
measuring screen, every section matches to the pixel — masthead 64, heading 44,
toolbar 44, readout 358, graph 301, footer 69 — and the reference page is
**975 px tall against an 812 px viewport**. The port comes out at 942, the
difference being that the design always renders its status line and the port
renders it only when it has something to say.

So the measuring screen scrolls by about a screen-eighth on a phone. Left as
designed. If the rule is meant to survive, the height has to come from
somewhere — the readout's 358 px is the obvious candidate — and that is a design
decision, not a porting one.

---

## B. Present in the design, new to the app

- Appearance preference: Light / Dark / System. The app was dark-only.
- Show Brand Logo is now a preference in Settings (it already existed as
  `showLogo`; it is now grouped under General with the other two).
- Keep Screen Awake as an explicit preference.
- Manual movement entry — beat rate and lift angle typed directly — alongside
  Auto and the presets.
- A welcome screen with two mode cards, replacing the permission gate. The
  microphone is now requested from the measurement screen's toolbar, so both
  modes can be opened before permission exists.
- The GPLv2 source offer is in a global footer, visible on every screen rather
  than on the welcome screen and in the guide. Strictly more coverage than the
  licence requires.
- Inspection summary dialog with build name, measured by, notes, pre/post
  regulation, and a two-size PDF export.
- **Two positions renamed and the order changed.** The design lists Dial up,
  Dial down, Crown up, Crown down, Crown left, Crown right. The app had crown
  down before crown up — an order chosen so each step was a single rotation of
  the watch — and called the last two "12 up" and "6 up", which named the dial
  index rather than the crown and disagreed with the convention that puts 12 up
  when the crown is *down*. Both now follow the design. The stored ids are
  unchanged, so readings recorded under the old names still resolve.

---

## C. Deliberate deviations from the design file

Three. Each is a fidelity-preserving substitution, not a change of intent.

### C1. Print export uses an iframe, not `window.open`

The design opens a new window, writes a document into it and calls `print()`.
That is blocked by default in several browsers and is unreliable on iOS Safari,
where the inspection report is most likely to be exported from.

The same document — same markup, same `@page` size, same escaping — is loaded
into a hidden same-origin iframe and printed from there. The user-visible flow is
identical: press Export, choose Save as PDF. There is no popup to be blocked.

### C2. Guide copy about the unconnected prototype is rewritten

The design's guide was written against a UI with no engine, and says so in
several places — "measurement-engine integration is still pending in this UI",
"Run Calibration does not generate a result or apply a correction", "Escapement,
beat lock, and analysis lock are awaiting the timing engine", "In this UI it
contains no measured watch readings".

Those sentences become false the moment the engine is connected. They are
rewritten to describe what the shipped app actually does. Everything else in the
guide keeps the design's wording.

### C3. Device Check rows are filled from the existing readiness reducer

The design's row set — Input, Audio stream, Sample rate, Audio timing, Echo
cancellation, Automatic gain control, Noise suppression / Signal, Clipping,
Escapement — is exactly what `timegrapher/readiness.ts` already produces, row for
row and in the same order. Those rows are wired straight through.

Run Check drives the existing `runDeviceTest`, whose progress feeds the bar. The
optional MOVEMENT group (Sound energy, Beat lock, Analysis lock) is derived from
that report's own lock results. A row neither source can answer reads
`Unavailable`, never a default pass — as the design requires.

---

## E. Second pass — corrections to the design agent's guesses

Three areas the design could only estimate, revisited against what the engine
actually measures.

### E1. The stability bar

Was: the cursor driven by the rate spread alone, then clamped short of the green
zone whenever the settled verdict happened to disagree — two opinions kept in
line by hand. The zone itself was a shaded rectangle with a rule down its left
edge, at a threshold of 0.76 the designer picked.

Now: the cursor is computed from the same four things `settling()` decides on —
rate spread, beat-error spread, amplitude spread, and how long the reading has
been running — and shows the **worst** of them, because that is what is holding
the verdict up. A watch whose rate is rock steady but whose amplitude is still
swinging sixteen degrees is not nearly settled, and the old bar said it was.

Two scales meet at the bound. Outside it the cursor travels the first three
quarters logarithmically, so each halving of the spread moves it the same
distance rather than the hopeless readings taking up most of the track. Inside
it the cursor is in the oval, and how far in is how much margin is left.

The green zone is now an oval, positioned from the same constant that scales the
cursor, so **entering it is the locked verdict** rather than a separate
judgement drawn beside it. Verified in the browser: a moving reading tops out
with its cursor centre at 220.1 px against an oval starting at 223.3 px, and a
settled one is always inside.

The bar also names what it is waiting on — rate, beat error, amplitude, or just
more seconds — in its tooltip and to a screen reader. No extra height; the
measuring screen has none to give.

### E2. Graph order

Waveform, Beat, Trace, defaulting to Waveform. The trace is what a timegrapher
*is*, which is why it led — but it draws nothing until there are beats to fold,
so the app's first impression on an uncoupled bench was an empty graph. The
waveform shows something the moment audio arrives.

### E3. Device Check, rewritten

The old panel merged a live readiness reducer with a six-variant constraint
sweep and showed whichever had an answer. It is now one pass down one list, in
dependency order, one row lit at a time, on the app's own capture path.

The list was corrected rather than reproduced. Added: **browser support**
(secure context and AudioWorklet, the two things that make everything else
moot), and **frequency range** — a Bluetooth microphone is a voice channel cut
off below where a tick lives, which looks perfectly healthy on a level meter and
can never produce a reading. That one cost a day of guessing before anybody
thought to ask it.

Corrected: **sample rate** now compares granted against requested, so the
44.1 kHz resample that starves the iOS clock reads as a resample rather than as
a bad crystal. **Audio timing** is a real ten-second measurement now instead of
"Unavailable". **Movement** is genuinely optional — its three steps read Skipped
rather than failed, because a missing watch says nothing about the device.

Retired with it:

- **`audio/device-test.ts`** — the six-variant constraint sweep. It was built to
  root-cause the Android routing failure; that is understood and the fix ships in
  `capture-route.ts`. Recover with
  `git show 16c38dc:web/src/audio/device-test.ts` if a new handset or browser
  ever needs the same investigation.
- **`timegrapher/readiness.ts`** — the live READY / WARNING / NOT READY reducer.
  Nothing in the v36 design displays it, and the explicit check now covers the
  same ground on demand. Its sample-rate constants and `isBuiltInMic` moved into
  `device-check.ts`.
- **The passive clock calibrator on the measuring screen.** It sampled every
  audio block and only readiness ever read it. The check runs its own.

Timings are injectable, so the sequence, the failure paths and cancellation are
covered by tests rather than by half a minute of clicking — the check itself
cannot be exercised in the browser pane, which blocks microphone access.

### E4. The inspection report, both sizes

The two page sizes were already wired — 3.5 x 2in at 7pt with 0.12in margins,
8.5 x 11in at 12pt with 0.6in margins — but the mark was missing from both, and
the card did not fit.

The mark is now inlined as a data URI rather than referenced by URL. The document
prints out of an iframe, and an image still in flight when the print dialog takes
its copy prints as a blank space on a customer's certificate with nothing on
screen to say so. It is fetched once, cached, and awaited before the document is
built. It is sized against the paper rather than the type — 0.55 x 0.275in on the
card, 1.2 x 0.6in on the sheet — with the height derived from the width, so a
print engine that disagrees about intrinsic size cannot stretch the 2:1 artwork.

It follows the existing **Show Brand Logo** preference, which is off by default
for the reason `CLAUDE.md` gives: almost nobody running this is MAC, and a
stranger's logo on your own timing certificate is worse than none. Turned on, it
appears on both sizes.

**The card overflowed.** Measured against its 3.26 x 1.76in of usable space, the
seven table rows at the sheet's cell padding ran it 9px over, so every export
spilled onto a second card. The card's cell padding is now a third of the
sheet's: the mark and title take 34px, the table 98px and the attribution 17px,
leaving about 20px — two lines — for notes.

Longer notes still spill to a second card, deliberately. The alternative is
truncating what somebody wrote about a customer's watch, and the design's own
handover says never to silently clip inspection data. `break-inside: avoid` on
the rows keeps the table itself from splitting.

Measured in the browser at true page size: card 161px of 169 with the mark at
0.55 x 0.275in; sheet 301px of 941 with the mark at 1.2 x 0.6in.

**Open question for the sheet.** It is correct but sparse — content fills roughly
the top fifth of an 8.5 x 11 page and the rest is white. That is what the design
specified and it has not been changed. If it should read as a certificate rather
than as a memo, that is a layout decision worth making deliberately.

---

## D. Plan and status

| # | Step | Status |
| --- | --- | --- |
| 1 | This document | done |
| 2 | Replace `styles/tokens.css` with the design's CSS, cascade order preserved; add canvas theme vars and print rules | done |
| 3 | `timegrapher/stability-position.ts` — the 0–1 cursor position, locked region at 0.76 | done |
| 4 | `timegrapher/device-check.ts` — readiness + device test → the design's row set | done |
| 5 | `timegrapher/manual-movement.ts` — Auto / Manual / preset resolution | done |
| 6 | `export/report.ts` — the printable inspection document, both page sizes | done |
| 7 | Shell: `AppHeader`, `WelcomeScreen`, `AppFooter`, theme + `data-theme` wiring | done |
| 8 | Measurement surface: `InstrumentToolbar`, `ReadoutSurface`, `GraphSurface` | done |
| 9 | Graphs adapted into the design's surface, keeping the existing canvases | done |
| 10 | `InspectionStrip` and `InspectionSummaryDialog` | done |
| 11 | `SettingsDialog` with General / Device Check / Quartz / Guide panels | done |
| 12 | `App.tsx` rewritten against the new shell; engine state carried over | done |
| 13 | Remove superseded components and their tests | done |
| 14 | Tests green, typecheck clean, production build | done |

### Notes as the work went

- The design's DOM ids and class names are reproduced exactly in React, so the
  CSS could be taken across in its original order without merging its overrides.
  `#root` is `display: contents` so the design's `body > header/main/footer`
  layout holds. Verified against the reference page served side by side: every
  section on the measuring screen matches to the pixel.
- `useInspectionRun` already sequenced grace → auto-capture → stop-on-capture,
  which is the design's flow. It is reused unchanged; the only change is that
  `advance` now moves to the next *uncaptured* position rather than the next
  index, which is what the design specifies.
- The stability cursor is clamped below the locked region unless `settling` is
  actually `settled`, so the bar and the MOVING / LOCKED labels can never
  disagree.
- **A bug caught by writing the device-check tests.** The first version merged
  the live rows and the check's rows by preferring any live row that was not
  `pending`. But `assessReadiness` grades the three processing flags as "Off"
  whenever it has been handed no warnings — which is true of a clean device and
  equally true of a device nothing has ever listened to. With nothing running
  and no check run, the panel showed **Echo cancellation OK, Automatic gain
  control OK, Noise suppression OK**: three green passes asserting the exact
  thing that was invisibly false on Chrome for Android. The live rows are now
  consulted only while a capture is actually running, and the test that catches
  it asserts that no row can read `pass` before anything has measured.
- Test count 381 → 434, all passing; `tsc -b` clean; production build 304 KB JS
  / 46 KB CSS.
