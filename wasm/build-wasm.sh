#!/usr/bin/env bash
#
# MAC Bespoke Web Timegrapher
# Copyright (C) 2026 MAC Bespoke Watch Co.
# Licensed under the GNU General Public License version 2.
#
# Compiles the DSP core to WebAssembly for the browser app.
# Requires wasm/build-fftw.sh to have been run first.
#
# Output: web/src/wasm/tg-core.{js,wasm}

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FFTW="$ROOT/wasm/build/fftw"
OUT="$ROOT/web/src/wasm"

[ -f "$FFTW/lib/libfftw3f.a" ] || { echo "FFTW for wasm not built. Run wasm/build-fftw.sh"; exit 1; }
command -v emcc >/dev/null || { echo "emcc not found — install emscripten"; exit 1; }

mkdir -p "$OUT" "$ROOT/wasm/build/node"

# Two builds from identical source. The shipped one targets the browser only:
# including the node paths drags Node shims into the bundle and produces a
# "module externalized for browser compatibility" warning, and a build that
# warns routinely is a build whose warnings stop being read. The node variant
# exists so tests/compare-wasm-native.mjs can run the same code outside a
# browser — the ENVIRONMENT flag changes the loader, never the arithmetic.
emit() { # environment output
	emcc -O3 \
		-I"$FFTW/include" \
		"$ROOT/core/tg_algo.c" \
		"$ROOT/core/tg_measure.c" \
		"$ROOT/wasm/bindings.c" \
		"$FFTW/lib/libfftw3f.a" \
		-o "$2" \
		-s WASM=1 \
		-s MODULARIZE=1 \
		-s EXPORT_ES6=1 \
		-s ENVIRONMENT="$1" \
		-s ALLOW_MEMORY_GROWTH=1 \
		-s STACK_SIZE=8MB \
		-s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF32","HEAPF64","UTF8ToString"]' \
		-s EXPORTED_FUNCTIONS='["_tgw_init","_tgw_push","_tgw_result","_tgw_reset","_tgw_destroy","_tgw_version","_tgw_result_fields","_malloc","_free"]'
}

emit web  "$OUT/tg-core.js"
emit node "$ROOT/wasm/build/node/tg-core.js"

echo "built:"
ls -la "$OUT"/tg-core.js "$OUT"/tg-core.wasm
