/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

import { describe, it, expect } from 'vitest';
import { encodeWavFloat32, decodeWavFloat32 } from './wav';

function ascii(buffer: ArrayBuffer, offset: number, length: number): string {
  return String.fromCharCode(...new Uint8Array(buffer, offset, length));
}

describe('encodeWavFloat32', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 0.999]);

  it('writes a RIFF/WAVE container', () => {
    const buf = encodeWavFloat32({ samples, sampleRate: 48000, channelCount: 1 });
    expect(ascii(buf, 0, 4)).toBe('RIFF');
    expect(ascii(buf, 8, 4)).toBe('WAVE');
  });

  it('declares IEEE float format, not PCM', () => {
    const buf = encodeWavFloat32({ samples, sampleRate: 48000, channelCount: 1 });
    const view = new DataView(buf);
    // fmt chunk body starts at 20; first field is the format code.
    // 3 is WAVE_FORMAT_IEEE_FLOAT. 1 would be integer PCM and is wrong here:
    // these files are DSP reference fixtures and must not be quantised.
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(34, true)).toBe(32); // bits per sample
  });

  it('writes an 18-byte fmt chunk followed by a fact chunk', () => {
    // A regression to the 16-byte PCM-style fmt chunk (dropping cbSize and the
    // fact chunk) would still leave format-code and bits-per-sample assertions
    // passing, since both sit at the same offset relative to the chunk body
    // either way. Pin the chunk sizes explicitly so that regression can't hide.
    const buf = encodeWavFloat32({ samples, sampleRate: 48000, channelCount: 1 });
    const view = new DataView(buf);
    expect(ascii(buf, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(18); // fmt chunk body size
    expect(ascii(buf, 38, 4)).toBe('fact'); // 12 + 8 + 18
    expect(view.getUint32(42, true)).toBe(4); // fact chunk body size
  });

  it('declares the RIFF size as total length minus eight', () => {
    const buf = encodeWavFloat32({ samples, sampleRate: 48000, channelCount: 1 });
    expect(new DataView(buf).getUint32(4, true)).toBe(buf.byteLength - 8);
  });
});

describe('round trip', () => {
  it('preserves sample values exactly', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.999, -1, 1]);
    const out = decodeWavFloat32(encodeWavFloat32({ samples, sampleRate: 44100, channelCount: 1 }));
    expect(Array.from(out.samples)).toEqual(Array.from(samples));
  });

  it('preserves the sample rate', () => {
    const out = decodeWavFloat32(
      encodeWavFloat32({ samples: new Float32Array([0.1]), sampleRate: 44100, channelCount: 1 }),
    );
    expect(out.sampleRate).toBe(44100);
  });

  it('preserves a non-default sample rate', () => {
    const out = decodeWavFloat32(
      encodeWavFloat32({ samples: new Float32Array([0.1]), sampleRate: 96000, channelCount: 1 }),
    );
    expect(out.sampleRate).toBe(96000);
  });

  it('preserves the channel count', () => {
    const out = decodeWavFloat32(
      encodeWavFloat32({ samples: new Float32Array([0.1, 0.2]), sampleRate: 48000, channelCount: 2 }),
    );
    expect(out.channelCount).toBe(2);
  });

  it('handles an empty recording', () => {
    const out = decodeWavFloat32(
      encodeWavFloat32({ samples: new Float32Array(0), sampleRate: 48000, channelCount: 1 }),
    );
    expect(out.samples.length).toBe(0);
  });
});

describe('decodeWavFloat32', () => {
  it('rejects a non-RIFF buffer', () => {
    expect(() => decodeWavFloat32(new ArrayBuffer(64))).toThrow(/RIFF/);
  });

  it('rejects a truncated data chunk by name rather than by RangeError', () => {
    // A recording interrupted mid-write declares more data than it holds.
    // Reading it should say so, not surface a bare DataView RangeError.
    const full = encodeWavFloat32({
      samples: new Float32Array([0.1, 0.2, 0.3, 0.4]), sampleRate: 48000, channelCount: 1,
    });
    const cut = full.slice(0, full.byteLength - 8);
    expect(() => decodeWavFloat32(cut)).toThrow(/Truncated data chunk/);
  });
});
