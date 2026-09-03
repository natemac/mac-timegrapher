/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

const PROCESSED_SETTINGS = ['echoCancellation', 'autoGainControl', 'noiseSuppression'] as const;

/**
 * `applied`    — the browser reported the setting as on despite being asked
 *                to turn it off. The measurement is compromised.
 * `unreported` — the browser did not report the setting at all, so its state
 *                is unknown. Not evidence of processing, and not evidence of
 *                its absence either.
 */
export interface ProcessingWarning {
  setting: string;
  state: 'applied' | 'unreported';
}

export interface CaptureSession {
  context: AudioContext;
  stream: MediaStream;
  /** The rate actually in force, which may differ from the rate requested. */
  sampleRate: number;
  /**
   * The rate the context was asked for, i.e. the rate the device reported.
   * `undefined` when the device reported none and the context was left to
   * pick its own — in that case there is no request to compare against.
   */
  requestedSampleRate: number | undefined;
  warnings: ProcessingWarning[];
  /*
     Everything the browser reported about the track it actually gave us, and
     everything it says the device can do. Kept verbatim rather than reduced,
     because the interesting cases are the keys we did not think to ask about:
     a phone that quietly picked a different audio source, or a device that
     cannot turn gain control off at all.
  */
  settings: MediaTrackSettings;
  capabilities: MediaTrackCapabilities | null;
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

/**
 * Classify each processing setting the browser may have applied.
 *
 * Three states, not two. A setting explicitly reported as `true` was applied
 * against our constraint. A setting explicitly reported as `false` was
 * honoured and is not mentioned. A setting that is absent from
 * `getSettings()` — Safari omits keys it does not implement, including
 * `autoGainControl` — is genuinely unknown.
 *
 * Absence is not evidence of processing, so `unreported` must not be shown as
 * an alarm. But it is not evidence of the absence of processing either, and
 * AGC does not merely degrade amplitude measurement, it invalidates it. So
 * silently treating the unknown case as "off" would have the operator read a
 * clean screen as confirmation that a setting is off when the browser never
 * said so. It is reported as a neutral note instead.
 */
export function checkAppliedProcessing(settings: MediaTrackSettings): ProcessingWarning[] {
  const warnings: ProcessingWarning[] = [];
  for (const setting of PROCESSED_SETTINGS) {
    const value = settings[setting];
    if (value === true) warnings.push({ setting, state: 'applied' });
    else if (value === undefined) warnings.push({ setting, state: 'unreported' });
  }
  return warnings;
}

export async function startCapture(
  deviceId: string,
  onBlock: (block: Float32Array) => void,
  onDisconnect?: () => void,
  /*
     Overridden only by the device test, which has to open the same graph under
     several processing configurations to find out which one a platform will
     actually give it. Measuring that through a parallel capture path would
     measure the parallel path; this way it is the real one.
  */
  constraints: MediaStreamConstraints = buildAudioConstraints(deviceId),
): Promise<CaptureSession> {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);

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
    // Not implemented everywhere, and not worth failing a capture over.
    let capabilities: MediaTrackCapabilities | null = null;
    try {
      capabilities = track.getCapabilities?.() ?? null;
    } catch {
      capabilities = null;
    }

    // Construct at the device's own rate. Omitting this lets the context default
    // to the system rate and silently resample, which would corrupt fixtures.
    const requestedSampleRate = settings.sampleRate;
    const ctx = requestedSampleRate
      ? new AudioContext({ sampleRate: requestedSampleRate })
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

    // The device vanishing mid-capture is otherwise completely silent: blocks
    // simply stop arriving and every display freezes on its last frame, so a
    // knocked cable yields a short recording with nothing to say why.
    // `stopped` keeps a normal stop() from being reported as a disconnect.
    let stopped = false;
    const handleEnded = () => {
      if (stopped) return;
      stopped = true;
      onDisconnect?.();
    };
    track.addEventListener('ended', handleEnded);

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
      requestedSampleRate,
      warnings,
      settings,
      capabilities,
      async stop() {
        stopped = true;
        track.removeEventListener('ended', handleEnded);
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
