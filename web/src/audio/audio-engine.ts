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
  const track = stream.getAudioTracks()[0];
  const settings = track.getSettings();
  const warnings = checkAppliedProcessing(settings);

  // Construct at the device's own rate. Omitting this lets the context default
  // to the system rate and silently resample, which would corrupt fixtures.
  const context = settings.sampleRate
    ? new AudioContext({ sampleRate: settings.sampleRate })
    : new AudioContext();

  await context.resume(); // Safari starts contexts suspended

  const workletUrl = `${import.meta.env.BASE_URL}capture-worklet.js`;
  await context.audioWorklet.addModule(workletUrl);

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'capture-processor');
  node.port.onmessage = (event: MessageEvent<Float32Array>) => onBlock(event.data);

  // A worklet is only pulled when its output reaches the destination, so route
  // through a muted gain node rather than playing the watch out of the speakers.
  const silence = context.createGain();
  silence.gain.value = 0;
  source.connect(node);
  node.connect(silence);
  silence.connect(context.destination);

  return {
    context,
    stream,
    sampleRate: context.sampleRate,
    warnings,
    async stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      silence.disconnect();
      for (const t of stream.getTracks()) t.stop();
      await context.close();
    },
  };
}
