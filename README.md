# MAC Bespoke Web Timegrapher

A browser-based timegrapher for mechanical watches. It listens to a movement
through any audio input — a USB timegrapher, a contact microphone, or a
built-in mic — and measures rate, amplitude, beat error and beat frequency.

No install, no drivers, no native application. All signal processing runs
locally in the browser; audio never leaves the machine.

**Live: https://macwatches.com/tools/timegrapher**

## Status

Under development. Current milestone: browser audio capture and hardware
verification. Measurement is not yet implemented — see
[docs/build-plan.md](docs/build-plan.md) for the roadmap.

## Relationship to tg

This is a derivative work of [tg](https://github.com/vacaboja/tg) by Marcello
Mamino, via [agrigera/tg](https://github.com/agrigera/tg). tg is a native GTK
desktop application; this project preserves its proven timing-analysis
algorithm while replacing the native audio and interface layers with
browser-native equivalents.

Upstream's C source is retained under `src/` and remains buildable. It is not
part of the web build, but it provides the reference implementation that the
ported algorithm is validated against.

See [NOTICE](NOTICE) for attribution and [docs/licensing.md](docs/licensing.md)
for the modification record.

## License

GNU General Public License, version 2 only. See [LICENSE](LICENSE).

## Development

    cd web
    npm install
    npm run dev      # http://localhost:5173
    npm test

Building the original native application still requires GTK+3, GLib, PortAudio,
FFTW3f, autoconf, automake and libtool; see `docs/` for those instructions.
