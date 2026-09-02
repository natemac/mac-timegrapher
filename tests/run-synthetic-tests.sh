#!/usr/bin/env bash
#
# MAC Bespoke Web Timegrapher
# Copyright (C) 2026 MAC Bespoke Watch Co.
# Licensed under the GNU General Public License version 2.
#
# Drives the extracted DSP core with synthetic signals whose beat rate, rate
# offset and beat error are known exactly, and checks what comes back.
#
# What this proves: the plumbing. Samples reach the algorithm, BPH detection
# latches onto the right preset, and the period and beat-error arithmetic are
# correct end to end.
#
# What it cannot prove: amplitude. That depends on the shape of a real
# escapement impulse — unlocking, impulse, drop — which a damped sine burst
# does not have. Amplitude is verified only against recorded fixtures.
#
#   make -f Makefile.core check

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TG="$ROOT/tg-process"
GEN="tools/make-synthetic-fixture.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

if [ ! -x "$TG" ]; then
	echo "tg-process not built. Run: make -f Makefile.core"
	exit 1
fi

# Compare two numbers within a tolerance, without requiring bc.
within() { # value expected tolerance
	awk -v v="$1" -v e="$2" -v t="$3" 'BEGIN { d = v - e; if (d < 0) d = -d; exit !(d <= t) }'
}

check() { # label bph rate beat_error
	local label="$1" bph="$2" rate="$3" be="$4"
	local wav="$TMP/${label}.wav"

	( cd "$ROOT/web" && node "$GEN" -- \
		--bph "$bph" --rate "$rate" --beatError "$be" \
		--seconds 30 --out "$wav" ) >/dev/null 2>&1

	if [ ! -f "$wav" ]; then
		echo "FAIL $label — generator produced no file"
		fail=$((fail + 1))
		return
	fi

	local json got_bph got_rate got_be
	json="$("$TG" --json "$wav" 2>/dev/null)"
	got_bph="$(printf '%s' "$json"  | sed -n 's/.*"detectedBph": \([0-9-]*\).*/\1/p')"
	got_rate="$(printf '%s' "$json" | sed -n 's/.*"rate": \([0-9.eE+-]*\).*/\1/p')"
	got_be="$(printf '%s' "$json"   | sed -n 's/.*"beatError": \([0-9.eE+-]*\).*/\1/p')"

	local problems=""
	[ "$got_bph" = "$bph" ] || problems="$problems bph=$got_bph(want $bph)"
	# Rate within 0.2 s/day; beat error within 0.05 ms. Both are well inside
	# the project's stated tolerances and leave room for sub-sample rounding
	# of impulse positions at the sample rate.
	within "$got_rate" "$rate" 0.2  || problems="$problems rate=$got_rate(want $rate)"
	within "$got_be"   "$be"   0.05 || problems="$problems be=$got_be(want $be)"

	if [ -z "$problems" ]; then
		printf 'ok   %-28s bph %-6s rate %+7s  be %s\n' "$label" "$got_bph" "$got_rate" "$got_be"
		pass=$((pass + 1))
	else
		printf 'FAIL %-28s%s\n' "$label" "$problems"
		fail=$((fail + 1))
	fi
}

echo "Synthetic signal tests — $("$TG" --version)"
echo

#     label                    bph    rate    beat error
check nh35-nominal             21600   0.0    0.0
check nh35-fast                21600  +7.2    0.2
check nh35-slow                21600  -12.5   0.3
check nh35-high-beat-error     21600   0.0    4.0
check chronograph-28800        28800  +3.0    0.2
check slow-beat-18000          18000  -5.0    0.1
check high-beat-36000          36000   0.0    0.2

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
