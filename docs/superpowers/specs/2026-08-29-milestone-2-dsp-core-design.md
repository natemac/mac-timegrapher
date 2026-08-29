# Milestone 2 — Extracting the DSP core

**Date:** 2026-08-29
**Status:** Draft — written ahead of fixture capture, needs approval before implementation
**Predecessor:** Milestone 1 (foundation and audio layer), shipped

---

## 1. Purpose

Separate `tg`'s timing engine from its native dependencies so it can be compiled
to WebAssembly in Milestone 3, and build the harness that proves the separation
did not change any numbers.

---

## 2. What the source actually looks like

The build plan assumed `algo.c` would need untangling from GTK and PortAudio.
It does not. Measured, not assumed:

| File | Lines | GTK / PortAudio / Cairo references |
|---|---:|---:|
| `src/algo.c` | 961 | **0** |
| `src/computer.c` | 416 | 0 GTK, but 12 pthread call sites |
| `src/tg.h` | 313 | includes `<gtk/gtk.h>` and `<pthread.h>` |

`algo.c` is already pure DSP over FFTW. Its only include is `tg.h`, and the only
structures it touches are `filter`, `detected_event`, `processing_buffers` and
`calibration_data`. The 26 apparent `g_` matches are a local variable named
`g_buffers`, not glib.

**This makes the extraction substantially smaller than planned.** The work is
not disentangling `algo.c`; it is splitting the header it depends on and
stripping the threading from `computer.c`.

### Where the real coupling is

`tg.h` mixes four concerns in one file: the DSP structures, the computer's
snapshot/threading model, the GTK UI structures (`output_panel`, `main_window`),
and configuration. `algo.c` pulls in GTK and pthread purely by transitive
inclusion — it uses neither.

`computer.c` holds the aggregation layer: snapshot management, rate and beat
error accumulation over time, and calibration state. That logic is wanted. The
`pthread_mutex`/`pthread_cond`/`pthread_create` scaffolding around it is not —
in the browser, the AudioWorklet already provides the concurrency boundary.

---

## 3. Proposed structure

```
core/
├── tg_core.h        DSP structures and the public API. No GTK, no pthread.
├── tg_algo.c        from src/algo.c, essentially unchanged
├── tg_compute.c     from src/computer.c, threading removed
└── tg_wav.c         minimal WAV reader for the test harness
tools/
└── tg-process.c     command-line: WAV in, measurements out
```

`src/` stays exactly as it is. The native GTK application keeps building, and
remains the reference the extracted core is compared against.

### The public API

Kept close to the build plan's proposal, with the differences noted:

```c
typedef struct {
    int    sample_rate;
    int    bph;           /* 0 = detect automatically */
    double lift_angle;
} tg_config;

typedef struct {
    double rate;          /* seconds per day */
    double amplitude;     /* degrees */
    double beat_error;    /* milliseconds */
    int    detected_bph;
    double signal_quality;
    int    valid;
} tg_result;

tg_handle tg_init(tg_config config);
void      tg_push_samples(tg_handle h, const float *samples, int count);
tg_result tg_get_result(tg_handle h);
void      tg_reset(tg_handle h);
void      tg_destroy(tg_handle h);
```

Two deliberate departures from the build plan's sketch:

- **A handle, not global state.** The plan's `tg_init(config)` / `tg_get_result(void)`
  implies one global instance. That is workable in a browser tab but makes the
  command-line harness unable to process two files in one run, and makes testing
  awkward. The cost is one extra parameter everywhere.
- **`tg_destroy`.** The plan omits it. `processing_buffers` owns seven FFTW plans
  and eleven heap allocations; without an explicit teardown the WASM heap grows
  every time a device is reselected.

---

## 4. The FFT question, decided early rather than late

The build plan treats FFTW-versus-replacement as a Milestone 3 optimisation.
It is not — it is structural, and it should be settled now.

`processing_buffers` embeds FFTW types **directly in the struct**:

```c
fftwf_complex *fft, *sc_fft, *tic_fft, *slice_fft;
fftwf_plan     plan_a, plan_b, plan_c, plan_d, plan_e, plan_f, plan_g;
```

Every function in `algo.c` reads those fields. Replacing the FFT library is
therefore not a swap behind an interface; it changes the central data structure
that all 961 lines operate on.

**Recommendation: compile FFTW to WebAssembly, unchanged, for Milestone 3.**

- It keeps `algo.c` byte-identical apart from the header split, which means any
  numerical difference against native `tg` is a bug in our build rather than an
  ambiguity about which implementation is right.
- FFTW is GPLv2-or-later, so it is compatible with this project's GPLv2-only
  licence.
- The cost is build complexity and bundle size. Both are measurable later; a
  wrong answer now is expensive to unwind.

Revisit only if the compiled size proves unacceptable, and then behind a
`tg_fft.h` shim introduced deliberately rather than as a rescue.

---

## 5. Native WAV input — why the C build was kept

Native `tg` cannot read files. `src/audio.c` exposes only a live PortAudio path
and the binary takes no options beyond a hidden `test` argument. Build plan §26's
"run the same WAV through original TG and compare" is impossible as written.

`tools/tg-process.c` closes this. It links the **extracted core**, reads a WAV,
and prints measurements. For the reference side, a small addition to the native
build lets it consume the same file, so both sides see identical samples with no
resampling path in between.

The alternative — playing fixtures through a BlackHole virtual device into
unmodified `tg` — introduces exactly the resampling uncertainty the comparison
is supposed to eliminate.

---

## 6. Testing

Three layers, in increasing order of authority:

1. **Synthetic signals.** A generated impulse train at a known beat rate, with
   known period and beat error, and no acoustics. These prove the plumbing —
   that samples reach the algorithm, that BPH detection latches, that the
   harness works — and they can be written and run *before any real fixture
   exists*. They cannot validate amplitude, which depends on real escapement
   waveform shape.
2. **Recorded fixtures.** Real NH35 audio from `fixtures/`, with expected values.
   This is the regression corpus.
3. **Native comparison.** The same WAV through both the extracted core and the
   native reference, expecting agreement well inside the Milestone 1 tolerances
   (rate ±0.5 s/day, amplitude ±3°, beat error ±0.05 ms).

Layer 1 is unblocked today. Layers 2 and 3 need the bench session.

### Acceptance criteria

1. `core/` builds with no GTK, PortAudio, glib or pthread dependency.
2. `src/` still builds and the native application still runs.
3. `tools/tg-process` reads a WAV and prints rate, amplitude, beat error, BPH.
4. Synthetic signals produce the expected period and beat error.
5. On a real fixture, the extracted core and native `tg` agree within tolerance.
6. No memory leaks across repeated init/destroy cycles.

Criterion 5 is the milestone gate and needs a fixture.

---

## 7. Risks

| Risk | Response |
|---|---|
| Splitting `tg.h` breaks the native build | Native build is criterion 2; check it every commit, not at the end |
| Removing pthread changes `computer.c`'s aggregation semantics | Extract the accumulation logic first as pure functions, then delete the threading — not both at once |
| Synthetic signals pass while real audio fails | Explicitly expected. Layer 1 proves plumbing, never correctness of amplitude |
| FFTW-in-WASM proves too large | Deferred to Milestone 3 with a measurement, not a guess |

---

## 8. Open questions — for approval before implementation

1. **Handle-based API vs. the plan's global state.** Recommended above; it costs
   one parameter and buys testability.
2. **Whether `tg_compute.c` is in scope for this milestone at all.** A narrower
   Milestone 2 could extract only `algo.c` and defer the aggregation layer,
   getting to a working WASM port sooner and adding rate-over-time afterwards.
   That would make Milestone 3 arrive earlier at the cost of a second extraction
   pass later.
3. **How much C to modernise while in there.** Recommendation: none. Every line
   changed is a line that could explain a numerical discrepancy.
