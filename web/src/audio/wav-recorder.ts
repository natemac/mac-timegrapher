/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/** WAVE_FORMAT_IEEE_FLOAT. Format 1 would be integer PCM. */
const FORMAT_IEEE_FLOAT = 3;
const BYTES_PER_SAMPLE = 4;

export interface WavData {
  samples: Float32Array;
  sampleRate: number;
  channelCount: number;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

/**
 * Encode as 32-bit IEEE float WAV. Uses the 18-byte fmt chunk plus a fact
 * chunk, which is what the WAVE spec requires for non-PCM formats.
 */
export function encodeWavFloat32({ samples, sampleRate, channelCount }: WavData): ArrayBuffer {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  // 12 header + (8 + 18) fmt + (8 + 4) fact + (8 + data)
  const buffer = new ArrayBuffer(12 + 26 + 12 + 8 + dataBytes);
  const view = new DataView(buffer);
  let o = 0;

  writeAscii(view, o, 'RIFF'); o += 4;
  view.setUint32(o, buffer.byteLength - 8, true); o += 4;
  writeAscii(view, o, 'WAVE'); o += 4;

  writeAscii(view, o, 'fmt '); o += 4;
  view.setUint32(o, 18, true); o += 4;
  view.setUint16(o, FORMAT_IEEE_FLOAT, true); o += 2;
  view.setUint16(o, channelCount, true); o += 2;
  view.setUint32(o, sampleRate, true); o += 4;
  view.setUint32(o, sampleRate * channelCount * BYTES_PER_SAMPLE, true); o += 4;
  view.setUint16(o, channelCount * BYTES_PER_SAMPLE, true); o += 2;
  view.setUint16(o, 32, true); o += 2;
  view.setUint16(o, 0, true); o += 2; // cbSize

  writeAscii(view, o, 'fact'); o += 4;
  view.setUint32(o, 4, true); o += 4;
  view.setUint32(o, channelCount > 0 ? samples.length / channelCount : 0, true); o += 4;

  writeAscii(view, o, 'data'); o += 4;
  view.setUint32(o, dataBytes, true); o += 4;
  for (let i = 0; i < samples.length; i++) {
    view.setFloat32(o, samples[i], true);
    o += 4;
  }

  return buffer;
}

/** Parse a 32-bit float WAV. Walks chunks rather than assuming fixed offsets. */
export function decodeWavFloat32(buffer: ArrayBuffer): WavData {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }

  let format = 0;
  let bitsPerSample = 0;
  let sampleRate = 0;
  let channelCount = 0;
  let samples: Float32Array | null = null;

  let o = 12;
  while (o + 8 <= buffer.byteLength) {
    const id = readAscii(view, o, 4);
    const size = view.getUint32(o + 4, true);
    const body = o + 8;

    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      const count = Math.floor(size / BYTES_PER_SAMPLE);
      samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = view.getFloat32(body + i * BYTES_PER_SAMPLE, true);
    }

    o = body + size + (size % 2); // RIFF chunks are word-aligned
  }

  if (format !== FORMAT_IEEE_FLOAT || bitsPerSample !== 32) {
    throw new Error(`Expected 32-bit IEEE float, got format ${format} at ${bitsPerSample}-bit`);
  }
  if (samples === null) throw new Error('No data chunk');

  return { samples, sampleRate, channelCount };
}

/** Accumulates captured blocks and encodes them on demand. */
export class WavRecorder {
  readonly sampleRate: number;
  readonly channelCount: number;
  private blocks: Float32Array[] = [];
  private frames = 0;

  constructor(sampleRate: number, channelCount: number) {
    this.sampleRate = sampleRate;
    this.channelCount = channelCount;
  }

  /** Copies the block. The worklet reuses its buffer between render quanta. */
  push(block: Float32Array): void {
    this.blocks.push(new Float32Array(block));
    this.frames += block.length;
  }

  get sampleCount(): number {
    return this.frames;
  }

  get durationSeconds(): number {
    const divisor = this.sampleRate * this.channelCount;
    return divisor > 0 ? this.frames / divisor : 0;
  }

  reset(): void {
    this.blocks = [];
    this.frames = 0;
  }

  toWav(): ArrayBuffer {
    const all = new Float32Array(this.frames);
    let offset = 0;
    for (const block of this.blocks) {
      all.set(block, offset);
      offset += block.length;
    }
    return encodeWavFloat32({ samples: all, sampleRate: this.sampleRate, channelCount: this.channelCount });
  }
}
