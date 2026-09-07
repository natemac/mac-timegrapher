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

You pick one on the opening screen.

**Live Timing** is a continuously updating reading, for watching the effect of
moving the regulator while you adjust it.

**Inspection** walks a watch through six positions — dial up, dial down, crown
up, crown down, 12 o'clock down, 12 o'clock up — records each one, and produces
a printable timing inspection document.

### Running an inspection

The panel names a position. Put the watch that way on the sensor and press
**Start**. It counts three seconds down while you take your hand off the watch,
then restarts the average so nothing it heard during that grace can reach the
reading. It records once the reading settles, stops on its own, and names the
next position.

With **Auto capture** on, that is the whole job: turn the watch, press Start,
wait. Turn it off and you press **Capture** yourself. The button is there either
way — automatic does not replace it, it presses it for you.

Nothing measured before you pressed Start can reach a reading — that is the
point of running it this way rather than leaving the microphone open. Handling a
watch makes a burst of noise the analysis cannot tell from the movement
misbehaving, and it would otherwise sit in the window for the next thirty
seconds.

The six markers show which positions are on the record. They are drawn from the
record itself, so leaving the screen and coming back resumes the run where it
was rather than showing an empty panel over readings that are still stored. Once
all six are in, the transport becomes **Clear**, which starts the next watch.

### The document

**Export PDF** opens the browser's print dialog, where "Save as PDF" produces a
document with selectable text and real page geometry. Two sizes:

- **8.5 × 11** — the record. Reference, calibre, beat rate, lift angle, when and
  by whom, the six readings, the averages, somewhere to sign, and a method
  statement naming the input device and sample rate the readings were taken on.
- **3.5 × 2** — a business card to go out with the watch. What it is, what it
  read, who took it. Everything else stays on the sheet; the card has 3.26 ×
  1.76in and the six readings want most of it.

The summary is **averages and nothing else**. No positional spread, no lowest
amplitude, no greatest beat error — every one of those is a range over six
samples, which makes it the most outlier-sensitive figure it is possible to
compute: one knock of the bench during one position moves all three and none of
the averages. The six readings are printed in full, so anyone who wants the
extremes can read them off.

It does not grade the watch. Pass and fail thresholds differ by calibre and by
customer; they are a shop's own business rules, and a public tool asserting one
would be making a claim it cannot support. The numbers and the method are
stated; the judgement stays with the watchmaker who signs it.

---

## Getting a reading you can trust

### The movement setting matters

**Lift angle decides amplitude.** It is escapement geometry, not something that
can be heard, and amplitude is calculated directly from it — a degree out is
about two percent of amplitude.

Three ways to set it. Pick a **calibre** from the list and both numbers come
with it. **Manual** takes a beat rate and a lift angle you type. **Auto** detects
the beat rate from the signal — but you still enter the lift angle, because
nothing in the sound carries it.

### The stability bar

Between MOVING and LOCKED, a marker travels as the reading tightens. It is
computed from the same four things the settled verdict is: the rate spread, the
beat-error spread, the amplitude spread, and how long the reading has run — and
it shows the **worst** of them, because that is what is holding the verdict up.
Its tooltip names which.

It never sits on the green it has not earned. At the verdict it stops travelling
and fills the region: locked is a state, not a position.

### Calibrate the audio clock — once per device

**Settings → Quartz Calibration.** A sound card that reports 44,100 Hz is not
running at 44,100 Hz. Crystals are ten to a hundred parts per million out, and
every part per million is **0.0864 s/day** of error in rate — so a hundred is 8.6
s/day, the difference between a watch that needs regulating and one that does
not.

It hides from everything else, because a constant scale error is perfectly
repeatable: the reading settles, the spread stays tight, and the whole scale is
shifted.

It is done against a **quartz watch** on the sensor — an analogue movement with
a ticking seconds hand, which native tg does the same way. The app tracks its
once-a-second tick over 900 beats and offers the figure; you apply it with **Use
this correction**. That result is only as good as the reference — characterise
the watch against network time over a week and it becomes a good one. The
**Correction** box also takes a figure typed by hand; tg's `cal` is the same
quantity in the same units, so its number copies straight across.

### Device Check

**Settings → Device Check** is one pass down one list, in dependency order, one
row lit at a time — about twelve seconds, or half a minute with the optional
movement checks. It runs on the app's own capture path rather than a parallel
rig, because a diagnostic that measures a parallel path measures the parallel
path.

**Device:** browser support, microphone access, which input the browser actually
opened, the audio stream, the sample rate, the three processing settings, and
audio timing. **Signal:** input level, headroom, and frequency range — a
microphone reached over Bluetooth is a voice channel cut off below where a tick
lives, which looks perfectly healthy on a level meter and can never produce a
reading. **Movement** is optional and off by default; tick it with the watch on
the sensor for tick energy, beat lock and analysis lock.

Nothing passes by default. A check that was not made reads **Skipped** or
**Unknown**, never OK — an undisclosed gain-control setting reported as absent
is exactly how an invalidated amplitude comes to look like a good one.

### Three views of the same signal

The graph switches between them. **Waveform** leads because it shows something
the moment audio arrives; the trace draws nothing until there are beats to fold.

**Waveform** is the raw microphone, for confirming the sensor is hearing the
watch and not the room.

**Beat** is one beat, averaged over the last few seconds and drawn around the
tick and again around the tock. This is the escapement itself — the unlocking,
the impulse and the drop arrive as separate bursts a few milliseconds apart, and
their shape catches a chipped pallet stone, a poor lock or rebanking, none of
which move any of the numbers. The green line marks the impulse; read it against
the degrees scale along the top and you have the amplitude, as a position rather
than a figure. Tick and tock share both scales, so anything that differs between
the two curves differs in the watch.

**Trace** is the paper strip: every beat as a mark, newest at the top. Slope is
rate, the gap between the two lines is beat error, and you can read a regulator
adjustment off it seconds before the numbers settle.

### Session diagnostics

**Settings → Session Diagnostics** exports a text log of the last run: every
reading twice a second, its spread, the signal level and the settling state,
plus a timeline of what the app did and the setup it ran under — including
whether the browser admitted to applying automatic gain control, which would
invalidate every amplitude reading.

It stays on the device until you export it. It carries the audio device name and
the browser version; it carries no reference, technician, notes or audio.

---

## Known limits

Stated plainly, because a tool that produces a customer-facing document should
be honest about what it has and has not proved.

- **Amplitude has never been compared against a reference instrument.** Rate and
  beat error come from *when* ticks happen and are confirmed against synthetic
  signals, the native reference build and a real movement. Amplitude comes from
  the *shape* of the escapement impulse. It agrees across four platforms and two
  sensors, which rules out erratic but not a wrong lift angle — a proportional
  error would move every one of them together and look exactly like agreement.
- **Amplitude is not trustworthy on Chromium browsers on Android.** The only
  audio route that reaches a USB pickup on Android is the communication route,
  and on Chrome it applies gain control below the browser that no constraint can
  see or switch off. Rate and beat error read timing and survive. The figure is
  shown with a warning under it rather than withheld, because a caveated reading
  can be checked against another device and a blank cannot. Firefox on Android
  is unaffected.
- **Rate is only right in absolute terms once the audio clock is calibrated.**
  Synthetic tests generate and measure at the same assumed rate, which is
  circular and cannot catch a clock error.
- **Two lift angles are unconfirmed** — PT5404 and ST2130. The app marks them.
- **iOS Safari does not report whether gain control was applied**, so the
  constraint is requested and never acknowledged. The device check says
  *Unknown* rather than *Off*.

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
does the same, driven by a quartz watch on the pickup, and adds a device check
that verifies the whole audio path before a reading. Upstream's snapshot
save/load has no equivalent here yet.

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

To try it on a phone, `npm run dev:lan` serves it over HTTPS on the local
network. It has to be HTTPS: `getUserMedia` is gated on a secure context, so
over plain HTTP the app loads, looks entirely normal, and refuses the
microphone. See [docs/deployment.md](docs/deployment.md) for the certificate and
for the Tailscale route, which needs no warning clicked through.

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
