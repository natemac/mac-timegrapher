# To do

Rewritten 2026-08-31. Closed items are gone rather than archived — the reasoning
worth keeping lives beside the code it explains.

---

# Yours

## 1. Verify amplitude against a known-good instrument

**The only thing on this list that could invalidate the tool**, and it matters
because amplitude prints on a customer-facing document.

Rate and beat error come from *when* ticks happen, and those are confirmed —
against synthetic signals with exact known timing, against the native reference
build, and against real movements. Amplitude comes from the *shape* of the
escapement impulse, and it has never been compared with anything.

210° on a running NH35 is believable. Believable is not verified. Put the same
watch on a Weishi or equivalent, in the same position, and compare.

- Agrees within a few degrees → the port is sound, close this.
- Off by a consistent proportion → suspect the lift angle.
- Erratic → the impulse detection needs looking at.

**Calibrate the audio clock first** (Settings → Audio clock). It corrects rate,
not amplitude, but a bench that has not been calibrated is not a bench you can
compare anything against.

## 2. Community logs, if they come

One movement on one sensor has settled the *shape* of the problem — that
confidence tiers must not be averaged, that beat error is stable away from zero.
It cannot settle where the bounds belong.

The two that would move things most:

- **A watch close to in beat**, under about 0.3 ms. That is the case the
  ±1.5 ms bound is loose for, and no log has ever shown one. It is the
  difference between ±1.5 and something much tighter.
- **A different sensor** — a phone microphone rather than a USB pickup. Every
  figure so far is one pickup at about 29 dB above the room.

Also useful: a slow beat (18,000), a fast one (28,800), and a movement that is
genuinely unwell. Those exercise paths only synthetic signals have touched.

Settings → Session diagnostics exports what is needed. If a log says
`autoGainControl: applied`, its amplitude figures are invalid and should not go
into any calibration.

---

# Mine

## Known gaps

- **Upstream's tic and toc waveform displays have no equivalent** — the last
  substantial thing tg has that this does not. `expose_waveform` in
  `src/output_panel.c` draws the averaged beat waveform windowed around the tic
  and again around the toc, a millisecond either side, with a marker at the
  impulse amplitude is derived from. That is the classic escapement view: a
  watchmaker reads the impulse and locking shapes off it and sees a damaged
  pallet, poor lock or rebanking that no single number reports. The Waveform
  panel here is raw rolling audio — useful for confirming the sensor hears
  something, useless for diagnosing an escapement.

  The data is computed and simply not exposed: `processing_buffers` holds
  `waveform`, `tic`, `toc`, `tic_pulse`, `toc_pulse` and `waveform_max`, and
  `tg_result` carries none of them. It wants an array out through
  `wasm/bindings.c` and the worker, then two small canvases.

- **The watch is still settling when a position records.** In the 2026-08-30
  logs, rate fell and amplitude dropped across the eighteen seconds before
  recording, and neither had flattened. That is the movement recovering from
  being handled, not a fault — but the recorded figure is taken during the
  recovery. The three-second grace gets a hand off the watch; it does not wait
  for the watch. Worth deciding whether a position should wait for the trend to
  flatten rather than only for the spread to close.

- **`App.tsx` is near a thousand lines.** The inspection sequencing came out
  into `useInspectionRun`; capture, the engine, the session and the exporters
  are still in one file.

- **No landscape layout.** Portrait-locked in the manifest. A landscape bench
  setup would want two columns.

## Cannot be fixed here

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

# Deliberately not done

- **No QC pass/fail on the document.** Thresholds are business rules that differ
  by calibre and by customer; they belong in the private application, not a
  public GPL tool. The document reports the numbers and leaves the judgement to
  the watchmaker who signs it.
- **No build-record integration.** Wants an authenticated endpoint on the PHP
  side first. The session already copies as tab-separated text that pastes into
  a spreadsheet.
- **Recording is not in the UI.** It existed to produce DSP fixtures; the code
  stays in `web/src/audio/wav-recorder.ts` if fixtures are ever wanted.
- **No reference fixture corpus.** `fixtures/` is empty by choice — it is
  insurance against the DSP being changed, and the DSP is not being changed. It
  becomes worth doing the moment anyone touches `core/`.
- **No mocked tests for `startCapture` or the audio-wired components.** Mocking
  the Web Audio graph would test the mock. Everything that takes plain props is
  tested, because there is nothing to mock.

---

*339 tests across 23 files as of 2026-08-31.*
