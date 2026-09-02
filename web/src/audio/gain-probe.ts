/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { buildAudioConstraints } from './audio-engine';

/*
   How much level the platform's voice processing is worth on this device.

   The app asks for echo cancellation, gain control and noise suppression all
   off, because automatic gain does not degrade an amplitude measurement, it
   invalidates it. On Android that constraint set makes Chrome pick a different
   audio source — the unprocessed path rather than the voice chain — and on some
   devices that path is far quieter. An escapement that a voice app hears
   comfortably can then sit under the noise floor here.

   This measures that difference directly: the same room, the same microphone,
   seconds apart, once with our constraints and once with processing on. It
   needs no watch and no pickup, so it can be run on any phone to hand.

   Sequential rather than simultaneous. Two live captures of one microphone is
   not reliably allowed on mobile, and the effect being looked for is tens of
   decibels — far larger than the drift in room tone across a few seconds.
*/

export interface ProbeLevels {
  /** RMS over the window, in dBFS. -Infinity when the stream was silent. */
  rmsDb: number;
  /** Loudest single sample in the window, in dBFS. */
  peakDb: number;
  /** What the browser reported about the track it granted. */
  settings: MediaTrackSettings;
}

export interface GainProbeResult {
  /** Our constraints: all processing off. */
  off: ProbeLevels;
  /** Processing requested on, the way a voice app would ask. */
  on: ProbeLevels;
  /*
     on − off, in dB. A large positive figure means the platform's gain chain
     is doing a lot of work that this app deliberately declines, which is the
     condition that makes a quiet pickup unusable here and fine elsewhere.
  */
  differenceDb: number;
  secondsEach: number;
}

/** Seconds of audio measured per stream. Long enough to average room tone. */
export const PROBE_SECONDS = 3;

const dB = (linear: number) => (linear > 0 ? 20 * Math.log10(linear) : -Infinity);

/*
   Reduce a run of blocks to an RMS and a peak. Pure, so the arithmetic is
   tested without a microphone: the surrounding capture is not.
*/
export function summariseBlocks(blocks: Float32Array[]): { rmsDb: number; peakDb: number } {
  let sumSquares = 0;
  let count = 0;
  let peak = 0;
  for (const b of blocks) {
    for (let i = 0; i < b.length; i++) {
      const v = b[i];
      sumSquares += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    count += b.length;
  }
  if (count === 0) return { rmsDb: -Infinity, peakDb: -Infinity };
  return { rmsDb: dB(Math.sqrt(sumSquares / count)), peakDb: dB(peak) };
}

/** The difference the probe reports, with -Infinity handled as "no signal". */
export function gainDifferenceDb(off: number, on: number): number {
  if (!Number.isFinite(off) || !Number.isFinite(on)) return 0;
  return on - off;
}

async function measure(
  constraints: MediaStreamConstraints,
  seconds: number,
): Promise<ProbeLevels> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  let context: AudioContext | undefined;
  try {
    const track = stream.getAudioTracks()[0];
    const settings = track.getSettings();
    const ctx = new AudioContext();
    context = ctx;
    await ctx.resume();

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const blocks: Float32Array[] = [];
    const buffer = new Float32Array(analyser.fftSize);
    const started = performance.now();
    // Poll rather than use a worklet: this needs no sample-accurate timing,
    // only a fair sample of the level over a few seconds.
    while (performance.now() - started < seconds * 1000) {
      analyser.getFloatTimeDomainData(buffer);
      blocks.push(buffer.slice());
      await new Promise((r) => setTimeout(r, 40));
    }

    source.disconnect();
    analyser.disconnect();
    return { ...summariseBlocks(blocks), settings };
  } finally {
    for (const t of stream.getTracks()) t.stop();
    await context?.close().catch(() => {});
  }
}

/*
   Runs both halves. `deviceId` picks the same input for each so the comparison
   is of processing and nothing else.
*/
export async function probeInputGain(
  deviceId: string,
  onPhase?: (phase: 'off' | 'on') => void,
  seconds = PROBE_SECONDS,
): Promise<GainProbeResult> {
  /*
     Processed first, ours last, and the order is not cosmetic.

     Android leaves the input session configured the way the most recent
     stream asked for it, and the next getUserMedia inherits that rather than
     the constraints it asked for. Measuring ours first and the processed
     stream second left gain control switched on for whatever capture followed
     — observed on a Samsung, where a session opened after a probe came back
     with all three of echo cancellation, gain control and noise suppression
     applied despite being asked for none of them. A diagnostic that quietly
     invalidates the amplitude of everything measured after it is worse than
     no diagnostic.

     Ending on our own constraints leaves the device where the app wants it.
  */
  onPhase?.('on');
  const on = await measure(
    {
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true,
        channelCount: 1,
      },
      video: false,
    },
    seconds,
  );

  onPhase?.('off');
  const off = await measure(buildAudioConstraints(deviceId), seconds);

  return { off, on, differenceDb: gainDifferenceDb(off.rmsDb, on.rmsDb), secondsEach: seconds };
}
