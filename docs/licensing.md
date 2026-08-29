# Licensing and modification record

## License

GNU General Public License, **version 2 only**. Upstream `tg` headers read
"under the terms of the GNU General Public License version 2 as published by
the Free Software Foundation" with no "or later" clause, so this work cannot
be relicensed to GPLv3 and cannot link GPLv3-only code.

## Why this file exists

GPLv2 §2(a) requires modified files to carry prominent notices stating that
they were changed, and the date of change. This file is the human-readable
index of those changes. The authoritative record is the git history: this
repository is seeded from upstream's full 236-commit history (2015-08-22 to
2026-03-22), with our commits on top.

## Distribution and source availability

Serving compiled WebAssembly to a visitor's browser is distribution under
GPLv2 §3. The deployed application therefore carries a visible
"Open source (GPLv2) — view source" link to this repository on every page.

## Boundary with proprietary code

The entire web timegrapher is GPLv2 and public. MAC Bespoke's business logic
(build numbers, customer records, inventory, pricing, QC thresholds) lives in
a separate private PHP application and communicates only over authenticated
HTTP. That is a process and network boundary between two separately-usable
programs, not a module split inside one bundle.

## Modification log

| Date | Change | Files |
|---|---|---|
| 2026-08-29 | Forked from agrigera/tg at cdbeee8 | — |
| 2026-08-29 | Added web application foundation and browser audio capture layer. No upstream C source modified. | `web/**`, `NOTICE`, `README.md`, `docs/**` |
