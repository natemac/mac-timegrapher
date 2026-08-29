/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

import { describe, it, expect } from 'vitest';
import { encodeWavFloat32, decodeWavFloat32, WavRecorder } from './wav-recorder';

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
});

describe('WavRecorder', () => {
  it('starts empty', () => {
    const r = new WavRecorder(48000, 1);
    expect(r.frameCount).toBe(0);
    expect(r.durationSeconds).toBe(0);
  });

  it('accumulates blocks in order', () => {
    const r = new WavRecorder(48000, 1);
    r.push(new Float32Array([0.1, 0.2]));
    r.push(new Float32Array([0.3]));
    expect(Array.from(decodeWavFloat32(r.toWav()).samples)).toEqual([
      expect.closeTo(0.1, 6), expect.closeTo(0.2, 6), expect.closeTo(0.3, 6),
    ]);
  });

  it('copies incoming blocks so later mutation cannot corrupt the recording', () => {
    // The AudioWorklet reuses its render-quantum buffer. Storing the reference
    // rather than a copy silently overwrites already-recorded audio.
    const r = new WavRecorder(48000, 1);
    const reused = new Float32Array([0.1, 0.2]);
    r.push(reused);
    reused[0] = 0.9;
    expect(decodeWavFloat32(r.toWav()).samples[0]).toBeCloseTo(0.1, 6);
  });

  it('reports duration from frame count and sample rate', () => {
    const r = new WavRecorder(48000, 1);
    r.push(new Float32Array(24000));
    expect(r.durationSeconds).toBeCloseTo(0.5, 6);
  });

  it('reports duration correctly for stereo', () => {
    const r = new WavRecorder(48000, 2);
    r.push(new Float32Array(48000)); // 24000 frames of 2 channels
    expect(r.durationSeconds).toBeCloseTo(0.5, 6);
  });

  it('clears on reset', () => {
    const r = new WavRecorder(48000, 1);
    r.push(new Float32Array([0.1]));
    r.reset();
    expect(r.frameCount).toBe(0);
  });
});
