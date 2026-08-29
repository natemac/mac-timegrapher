# MAC Bespoke Web Timegrapher

A browser-based timegrapher for mechanical watches. Listens to a movement's
escapement through an audio input and measures rate, amplitude, beat error and
beat frequency. Public GPLv2 fork of [`agrigera/tg`](https://github.com/agrigera/tg),
a native GTK desktop application.

- **Repo:** https://github.com/natemac/mac-timegrapher (public)
- **Live:** https://macwatches.com/tools/timegrapher/
- **Roadmap:** `docs/roadmap.md` — currently between Milestone 1 and 2

## Licensing — read before adding anything

The upstream headers say "version 2 as published by the Free Software
Foundation" with **no "or later" clause**. This is **GPLv2-only**.

- Never write "or later". Never add a GPLv3-only dependency.
- **Every new source file gets the GPLv2 header** — `.ts`, `.tsx`, `.js`, `.css`,
  `.html`, and **test files too**. Copy the block verbatim from `web/src/App.tsx`.
- `LICENSE` must stay byte-identical to upstream. Never edit it.
- The in-app "Open source (GPLv2) — view source" link in `SourceFooter.tsx` is a
  legal obligation, not decoration. Serving WASM/JS to a browser is distribution
  under §3. It must render unconditionally, and `docs/deployment.md` blocks the
  deploy if it is missing from the built bundle.
- Business logic — build numbers, customer records, inventory, pricing, QC
  thresholds — belongs in the private PHP app at `macwatches.com`, never here.
  The two talk only over authenticated HTTP. `docs/build-plan.md` was purged from
  history for violating this; don't reintroduce that kind of content.

## Audio constraints that are not negotiable

These decide whether measurements mean anything. All are in
`web/src/audio/audio-engine.ts`.

- **`echoCancellation`, `autoGainControl`, `noiseSuppression` must all be
  `false`.** Browsers enable them by default. AGC continuously rescales the
  signal and amplitude is derived from impulse energy — AGC doesn't degrade the
  measurement, it *invalidates* it. Noise suppression is tuned for speech and
  treats watch ticks as noise to remove.
- **Construct `AudioContext` at the device's reported `sampleRate`.** Omitting it
  defaults to the system rate and silently resamples. A resampled fixture looks
  perfectly valid and poisons every downstream comparison.
- **`checkAppliedProcessing` is three-state** (`applied` / `unreported`). Safari
  omits `autoGainControl` from `getSettings()`, so "off" and "unknown" are not
  the same thing and must not render the same.
- **Recordings are 32-bit IEEE float**, never 16-bit PCM. They are DSP reference
  fixtures; quantisation would be permanent.
- **The worklet node routes to destination through a muted gain node.** A worklet
  is only pulled when its output reaches the destination — but at zero gain, so
  the watch isn't played out the speakers.

## Traps that cost time once already

- **Never use Hostinger's `hosting_deployStaticSiteArchiveV1` or
  `hosting_deployStaticWebsite`.** Both extract into the document root and would
  destroy the PHP app living there; the former's own docs say it "overwrites the
  website's existing contents and cannot be undone". Deploy by per-file TUS
  upload into `tools/timegrapher/`. Full procedure in `docs/deployment.md`.
- **`web/public/capture-worklet.js` is plain JS on purpose.** `addModule` fetches
  a real script; the dev server would hand it untranspiled TypeScript. It must
  stay at the deploy root, not under `assets/`, since it's fetched at runtime
  from `${BASE_URL}capture-worklet.js`.
- **`vite.config.ts` imports `defineConfig` from `'vitest/config'`, not `'vite'`.**
  Vite's own `UserConfig` type has no `test` field and `tsc` rejects it.
- **`tsconfig.app.json` sets `erasableSyntaxOnly: true`.** TypeScript
  parameter-property shorthand (`constructor(readonly x: number)`) fails with
  TS1294. Use explicit fields.
- **Upstream's `.gitignore` opens with a bare `.*`.** New dotfiles under `web/`
  are silently untracked unless negated — this already swallowed
  `web/.oxlintrc.json`.
- **`web/dist/` is never committed**, here or in the private site repo. Compiled
  output of GPL source is GPL-covered; committing it to the private repo would
  reintroduce the entanglement the split exists to avoid.
- **The `upstream` remote has push URL `no_push`** so nothing can be pushed to
  agrigera by accident. Leave it that way.

## Layout

```
src/          upstream C, untouched and still buildable — the DSP reference.
              Not part of the web build. Native tg has NO WAV file input
              (live PortAudio only), which is why this is kept: a file-input
              mode gets added here later for exact A/B comparison.
web/src/audio/  pure, browser-free logic — unit-testable without hardware
web/src/components/  one concern each, props-driven
core/ wasm/   empty until Milestones 2-3
fixtures/     recorded WAVs + expected values; the DSP regression corpus
```

`startCapture` and the React components other than `SourceFooter` have no
automated tests **by design** — mocking the Web Audio graph would test the mock.
They are verified at the bench. Don't "fix" this by adding mocks.

## Commands

```sh
cd web && npm test          # 54 tests
cd web && npm run build     # tsc -b && vite build
cd web && npm run dev       # http://localhost:5173/tools/timegrapher/
```

`base` is `/tools/timegrapher/`, overridable via `VITE_BASE` for forks — the dev
URL includes that path.

## Conventions

- It is a **timegrapher** (the instrument). *Regulating* is adjusting the
  movement afterwards. Never call the product a regulator.
- Comments explain *why*, especially where code looks arbitrary — the audio
  constraints, the muted gain node, the copy in `WavRecorder.push()`. Several
  tests carry comments naming the regression they exist to catch. Keep that.
- Commit messages end with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.
