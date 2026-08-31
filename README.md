# MAC Bespoke Web Timegrapher

A browser-based timegrapher for mechanical watches. It listens to a movement
through any audio input — a USB timegrapher pickup, a contact microphone, or a
built-in mic — and measures **rate**, **amplitude**, **beat error** and **beat
rate**.

No install, no drivers, no native application. All signal processing runs
locally; audio never leaves the device.

**Live: https://macwatches.com/tools/timegrapher**

---

## What it does

### Two modes

You choose one on the opening screen, and again from the settings sheet.

**Measure** is a single live reading, for watching the effect of moving the
regulator while you adjust it. **Capture** saves whatever is on screen as an
image you can share or file.

**Inspection** walks a watch through six positions — dial up, dial down, crown
down, crown up, 12 up, 6 up — records each one, and produces a printable timing
inspection document.

### Running an inspection

The panel names a position. Put the watch that way on the sensor and press
**Start**. It counts three seconds down while you take your hand off the watch,
then restarts the average so nothing it heard during that grace can reach the
reading. It records once the reading settles, stops on its own, and names the
next position.

With **Auto** on, that is the whole job: turn the watch, press Start, wait. Turn
it off and a **Record** button appears so you decide the moment yourself.

Nothing measured before you pressed Start can reach a reading — that is the
point of running it this way rather than leaving the microphone open. Handling a
watch makes a burst of noise the analysis cannot tell from the movement
misbehaving, and it would otherwise sit in the window for the next thirty
seconds.

Between positions the readings panel shows the set so far: the average of every
position measured, the range each reading has covered, and the **positional
spread** — the difference between the best and worst position, which is the
number that separates a watch that simply needs the regulator from one with a
poising or pivot problem.

### Before and after regulation

Mark a reading **Pre** or **Post** regulation in the inspection details. Two
readings of the same **build number** pair automatically, however far apart they
were taken — measure a watch, send it out, come back a fortnight later, and the
document carries both with a before-and-after comparison.

Pairing is a convenience, not a promise: readings live in this browser's local
storage, so a cleared cache or a different device loses them. The exported
document is the durable record.

### The document

**Export Inspection** opens the browser's print dialog, where "Save as PDF"
produces a document with selectable text and real page geometry. It records
what was measured and how — the input device, the sample rate, the calibre and
the lift angle amplitude was derived from.

It does not grade the watch. Pass and fail thresholds differ by calibre and by
customer; they are a shop's own business rules, and a public tool asserting one
would be making a claim it cannot support. The numbers and the method are
stated; the judgement stays with the watchmaker who signs it.

---

## Getting a reading you can trust

### The movement preset matters

**Lift angle decides amplitude.** It is escapement geometry, not something that
can be heard, and amplitude is calculated directly from it — a degree out is
about two percent of amplitude. Pick the calibre from the list; beat rate is
detected either way.

Quartz calibres are listed so an inspection can name them, but the analysis does
not apply. A stepper motor has no balance wheel, so amplitude and beat error are
withheld rather than shown as numbers you could act on.

### Calibrate the audio clock — once per device

**Settings → Audio clock.** A sound card that reports 44,100 Hz is not running
at 44,100 Hz. Crystals are ten to a hundred parts per million out, and every
part per million is **0.0864 s/day** of error in rate — so a hundred is 8.6
s/day, the difference between a watch that needs regulating and one that does
not.

It hides from everything else, because a constant scale error is perfectly
repeatable: the reading settles, the spread stays tight, and the whole scale is
shifted.

Start a capture and leave it running for a minute or more without stopping —
nothing needs to be on the sensor — then press **Apply**. The app compares its
own audio clock against the system clock, which is disciplined and far steadier
than any sound card. It has to be one uninterrupted run; a new capture starts
the measurement over.

### Steadiness of this bench

Also in settings: the tightest spread each reading has held this session,
against the threshold it has to beat to read **Settled**.

It is a live check on sensor contact, and it tells you the uncertainty on any
figure you write down — a bench holding rate to ±0.4 s/day means a recorded
+11.9 is really +11.9 ± 0.4. Steady is not the same as correct: it measures
repeatability, not accuracy.

### Session diagnostics

**Settings → Session diagnostics** exports a text log of the last run: every
reading twice a second, its spread, the signal level and the settling state,
plus a timeline of what the app did and the setup it ran under — including
whether the browser admitted to applying automatic gain control, which would
invalidate every amplitude reading.

It stays on the device until you export it. It carries the audio device name and
the browser version; it carries no build number, technician, notes or audio.

---

## Known limits

Stated plainly, because a tool that produces a customer-facing document should
be honest about what it has and has not proved.

- **Amplitude has never been compared against a reference instrument.** Rate and
  beat error come from *when* ticks happen and are confirmed against synthetic
  signals, the native reference build and a real movement. Amplitude comes from
  the *shape* of the escapement impulse. It is plausible; plausible is not
  verified.
- **Rate is only right in absolute terms once the audio clock is calibrated.**
  Synthetic tests generate and measure at the same assumed rate, which is
  circular and cannot catch a clock error.
- **Two lift angles are unconfirmed** — PT5404 and ST2130. The app marks them.
- **iOS Safari does not report whether gain control was applied**, so the
  constraint is requested and never acknowledged. The diagnostics log says so.

See [docs/todo.md](docs/todo.md) for the current list.

---

## Relationship to tg

This is a derivative work of [tg](https://github.com/vacaboja/tg) by Marcello
Mamino, via [agrigera/tg](https://github.com/agrigera/tg). tg is a native GTK
desktop application; this project preserves its timing-analysis algorithm while
replacing the native audio and interface layers with browser-native
equivalents.

`core/` holds the extracted DSP — upstream's algorithm with the GTK, PortAudio
and pthread dependencies removed — built standalone with `make -f Makefile.core`
and to WebAssembly with `wasm/build-wasm.sh`. Upstream's full C source is
retained under `src/` and remains buildable; it is not part of the web build,
but it is the reference implementation the port is validated against.

Upstream measures sound-card clock drift against a 1 Hz reference; this port
measures it against the system clock instead, which needs no reference watch.
Upstream's snapshot save/load and its per-half-beat tic and toc waveform
displays have no equivalent here yet.

See [NOTICE](NOTICE) for attribution and [docs/licensing.md](docs/licensing.md)
for the modification record.

---

## Development

```sh
cd web
npm install
npm run dev      # http://localhost:5173/tools/timegrapher/
npm test
npm run build
```

```sh
make -f Makefile.core         # native tg-process (needs brew fftw)
make -f Makefile.core check   # synthetic-signal tests
./wasm/build-wasm.sh          # rebuild the WebAssembly core
node tests/compare-wasm-native.mjs FILE.wav
```

`base` is `/tools/timegrapher/`, overridable with `VITE_BASE` for forks.

Building the original native application requires GTK+3, GLib, PortAudio,
FFTW3f, autoconf, automake and libtool; see `docs/` for those instructions.

Architecture, conventions and the constraints that are not negotiable —
particularly the audio settings that decide whether a measurement means
anything — are in [CLAUDE.md](CLAUDE.md).

---

## License

GNU General Public License, **version 2 only**. See [LICENSE](LICENSE).

Upstream's headers say "version 2 as published by the Free Software Foundation"
with no "or later" clause, so this cannot be relicensed to GPLv3 and cannot link
GPLv3-only code.

### Trademarks

The GPL covers the code, not the branding. The MAC Bespoke Watch Co. name and
logo (`web/public/mac-logo-*.png`, `web/public/icon-*.png`,
`web/public/apple-touch-icon.png`) are trademarks of MAC Bespoke Watch Co. and
are **not** licensed under the GPL.

You are free to fork, modify and redistribute this software under the GPL. If
you do, replace those files with your own mark — the app has a setting that
turns the mark off, and it is off by default. This is the same arrangement
Mozilla uses for Firefox: the code is free, the name and logo identify who
stands behind a particular build.
