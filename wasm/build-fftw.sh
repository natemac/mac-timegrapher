#!/usr/bin/env bash
#
# MAC Bespoke Web Timegrapher
# Copyright (C) 2026 MAC Bespoke Watch Co.
# Licensed under the GNU General Public License version 2.
#
# Builds FFTW single-precision as a static WebAssembly library.
#
# Why FFTW rather than a smaller FFT: struct processing_buffers embeds
# fftwf_complex and fftwf_plan directly, and all 961 lines of tg_algo.c read
# those fields. Replacing the library is not a swap behind an interface, it is
# a rewrite of the core data structure. Building upstream's own FFTW means any
# numerical disagreement with native tg is a bug in our build rather than an
# argument about which implementation is right.
#
# Output: wasm/build/fftw/lib/libfftw3f.a and its headers.
# Takes several minutes. Skips itself if already built.

set -euo pipefail

VERSION=3.3.11
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/wasm/build"
PREFIX="$BUILD/fftw"

if [ -f "$PREFIX/lib/libfftw3f.a" ]; then
	echo "FFTW for wasm already built at $PREFIX"
	exit 0
fi

command -v emconfigure >/dev/null || { echo "emconfigure not found — install emscripten"; exit 1; }

mkdir -p "$BUILD"
cd "$BUILD"

if [ ! -d "fftw-$VERSION" ]; then
	echo "==> fetching FFTW $VERSION"
	curl -fsSL "https://www.fftw.org/fftw-$VERSION.tar.gz" -o "fftw-$VERSION.tar.gz"
	tar xzf "fftw-$VERSION.tar.gz"
fi

cd "fftw-$VERSION"

echo "==> configuring for wasm"
# --enable-float gives the single-precision fftwf_* symbols tg uses.
# Threads and SIMD are off: the browser build is single-threaded, and wasm SIMD
# would need matching runtime flags for no benefit at these transform sizes.
emconfigure ./configure \
	--prefix="$PREFIX" \
	--enable-float \
	--enable-static \
	--disable-shared \
	--disable-fortran \
	--disable-threads \
	--disable-openmp \
	--disable-alloca \
	--host=wasm32 \
	CFLAGS="-O3" \
	>/dev/null

echo "==> building (this takes a few minutes)"
emmake make -j"$(sysctl -n hw.ncpu)" >/dev/null

# Deliberately not `make install`. FFTW's install rules invoke GNU install
# flags that macOS's BSD install rejects, and the two files we need are the
# only two we want — pulling in the Fortran headers and man pages would be
# noise. Copying them directly also keeps the prefix reproducible.
mkdir -p "$PREFIX/lib" "$PREFIX/include"
cp .libs/libfftw3f.a "$PREFIX/lib/"
cp api/fftw3.h "$PREFIX/include/"

echo "built $PREFIX/lib/libfftw3f.a"
