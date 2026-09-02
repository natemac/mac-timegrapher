# Timegrapher review fixes — 2026-09-01

This folder is a handoff package for applying the review fixes to the main copy
of the MAC Bespoke Web Timegrapher. Files below this README preserve their
repository-relative paths. Copy each one over the matching path in the main
repository, review the diff, and run the verification commands below.

## Changes included

1. **Cancel capture startup when returning home**
   - `web/src/App.tsx`
   - Adds a capture-attempt generation guard. A microphone session that finishes
     opening after the operator returns home is immediately stopped and is never
     published into app state.
   - Also handles the narrow interval where a session exists but React has not
     rendered `capturing: true` yet.

2. **Dismiss only the topmost sheet with Escape**
   - `web/src/components/Sheet.tsx`
   - `web/src/components/Sheet.test.tsx`
   - Tracks open sheets as a stack so Escape closes an InfoSheet without also
     closing the SettingsSheet beneath it.

3. **Validate the entire clock-correction value**
   - `web/src/components/SettingsSheet.tsx`
   - `web/src/components/SettingsSheet.test.ts`
   - Rejects partial numeric strings such as `1.7oops`, `1..7`, and `1 7`
     instead of silently applying their numeric prefix.

4. **Make the native synthetic suite self-contained**
   - `tests/run-synthetic-tests.sh`
   - Runs the plain `.mjs` fixture generator with `node`, which is already
     required by the web project, instead of invoking the undeclared
     `vite-node` package through `npx`.

5. **Keep every settings control visible at 320 px**
   - `web/src/components/SettingsSheet.tsx`
   - `web/src/styles/tokens.css`
   - Uses a two-by-two tab grid below 360 px while keeping Close fixed and
     visible. Wider layouts retain the existing single-row presentation.

6. **Regression coverage for the microphone startup race**
   - `web/src/App.test.tsx`
   - Reproduces a delayed capture opening followed by an immediate return to the
     start screen, and verifies that the late session is stopped.

## Files to copy

```text
tests/run-synthetic-tests.sh
web/src/App.tsx
web/src/App.test.tsx
web/src/components/SettingsSheet.tsx
web/src/components/SettingsSheet.test.ts
web/src/components/Sheet.tsx
web/src/components/Sheet.test.tsx
web/src/styles/tokens.css
```

No dependency or package-lock changes are required.

## Verification completed in the review copy

```sh
cd web
npm test
npm run build
npm run lint

cd ..
make -f Makefile.core check
```

Results:

- 404 web tests passed across 29 files.
- The TypeScript and Vite production build passed.
- Lint completed with the repository's existing warnings and no errors.
- All seven native synthetic DSP cases passed.
- Browser verification at 320 x 568 confirmed that Guide, Settings,
  Calibration, Check, and Close are all visible.
- Browser verification confirmed that Escape closes only the top help popup and
  leaves the underlying settings dialog open.

## Notes for the receiving agent

- Preserve the GPLv2-only headers on both new test files.
- Review/apply these files against the main copy rather than assuming it is
  byte-identical to this working copy.
- The amplitude/reference-instrument validation documented in `docs/todo.md`
  remains a separate bench-validation task and is not changed here.
