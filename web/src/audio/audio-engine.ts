/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

const PROCESSED_SETTINGS = ['echoCancellation', 'autoGainControl', 'noiseSuppression'] as const;

export interface ProcessingWarning {
  setting: string;
  actual: boolean;
}

export interface CaptureSession {
  context: AudioContext;
  stream: MediaStream;
  /** The rate actually in force, which may differ from the rate requested. */
  sampleRate: number;
  warnings: ProcessingWarning[];
  stop(): Promise<void>;
}

/**
 * Browsers apply speech-oriented processing by default. Every one of these
 * must be off: they are tuned to make voices intelligible, which is close to
 * the opposite of preserving a watch's impulse train.
 */
export function buildAudioConstraints(deviceId: string): MediaStreamConstraints {
  return {
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: false,
      channelCount: 1,
    },
    video: false,
  };
}

/** Report any processing the browser applied despite being asked not to. */
export function checkAppliedProcessing(settings: MediaTrackSettings): ProcessingWarning[] {
  const warnings: ProcessingWarning[] = [];
  for (const setting of PROCESSED_SETTINGS) {
    if (settings[setting] === true) warnings.push({ setting, actual: true });
  }
  return warnings;
}

export async function startCapture(
  deviceId: string,
  onBlock: (block: Float32Array) => void,
): Promise<CaptureSession> {
  const stream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));

  // Everything below can throw partway through setup (unsupported sample
  // rate, a missing/failed worklet fetch, graph construction). If it does,
  // the stream and any context already created must be torn down before
  // rethrowing — otherwise the mic stays open and lit with no session object
  // for the caller to call stop() on.
  let context: AudioContext | undefined;
  try {
    const track = stream.getAudioTracks()[0];
    const settings = track.getSettings();
    const warnings = checkAppliedProcessing(settings);

    // Construct at the device's own rate. Omitting this lets the context default
    // to the system rate and silently resample, which would corrupt fixtures.
    const ctx = settings.sampleRate
      ? new AudioContext({ sampleRate: settings.sampleRate })
      : new AudioContext();
    context = ctx; // tracked outside the try so the catch block can clean it up

    await ctx.resume(); // Safari starts contexts suspended

    const workletUrl = `${import.meta.env.BASE_URL}capture-worklet.js`;
    await ctx.audioWorklet.addModule(workletUrl);

    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'capture-processor', {
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    node.port.onmessage = (event: MessageEvent<Float32Array>) => onBlock(event.data);

    // A worklet is only pulled when its output reaches the destination, so route
    // through a muted gain node rather than playing the watch out of the speakers.
    const silence = ctx.createGain();
    silence.gain.value = 0;
    source.connect(node);
    node.connect(silence);
    silence.connect(ctx.destination);

    return {
      context: ctx,
      stream,
      sampleRate: ctx.sampleRate,
      warnings,
      async stop() {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        silence.disconnect();
        for (const t of stream.getTracks()) t.stop();
        await ctx.close();
      },
    };
  } catch (err) {
    for (const t of stream.getTracks()) t.stop();
    if (context && context.state !== 'closed') {
      // A cleanup failure here must not hide the original error, and
      // close() itself can reject if the context is already closed.
      await context.close().catch(() => {});
    }
    throw err;
  }
}
