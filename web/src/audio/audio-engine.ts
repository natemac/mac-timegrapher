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
  /*
     'applied' is the browser overriding what was asked for, which invalidates
     a measurement silently. 'intentional' is the same flag arrived at on
     purpose — a diagnostic profile deliberately requesting it — and reads
     completely differently to anyone holding the report. 'unreported' is
     Safari omitting the key, which is not the same as off.
  */
  state: 'applied' | 'intentional' | 'unreported';
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
export function checkAppliedProcessing(
  settings: MediaTrackSettings,
  /* Settings this capture deliberately asked to have switched on. Anything
     here that comes back true was obeyed, not imposed. */
  intentional: readonly string[] = [],
): ProcessingWarning[] {
  const warnings: ProcessingWarning[] = [];
  for (const setting of PROCESSED_SETTINGS) {
    const value = settings[setting];
    if (value === true) {
      warnings.push({ setting, state: intentional.includes(setting) ? 'intentional' : 'applied' });
    } else if (value === undefined) {
      warnings.push({ setting, state: 'unreported' });
    }
  }
  return warnings;
}

/*
   Whether the browser gave back the input that was asked for.

   Only a concrete id can be checked. 'default' and the communication aliases
   resolve to whatever the platform picks, so they are not mismatches; and a
   track that reports no deviceId at all is unknown, which is not the same as
   verified. Both return null rather than a false accusation.

   Note what this can and cannot settle: it compares identifiers, so it catches
   a browser substituting a device. It cannot detect a platform that returns
   the requested id and captures from somewhere else anyway — that needs a
   physical source check.
*/
/*
   Whether this request deliberately switches a processing flag on. Read from
   the constraints rather than from a profile name so the graph cannot drift
   out of step with what was actually asked for.
*/
export function isProcessingRequested(
  constraints: MediaStreamConstraints,
  setting: 'echoCancellation' | 'autoGainControl' | 'noiseSuppression',
): boolean {
  const audio = constraints.audio;
  if (!audio || typeof audio === 'boolean') return false;
  return (audio as MediaTrackConstraints)[setting] === true;
}

/* Ids that name a choice rather than a device. */
const ALIAS_IDS = new Set(['default', 'communications']);

export function deviceIdMismatch(
  requested: string,
  settings: MediaTrackSettings,
): { requested: string; granted: string } | null {
  if (ALIAS_IDS.has(requested) || requested === '') return null;
  const granted = settings.deviceId;
  if (typeof granted !== 'string' || granted === '') return null;
  if (granted === requested) return null;
  /*
     An alias coming back is the platform naming the same choice differently,
     not a substitution. Treating it as one would break capture on browsers
     that answer a concrete request with the alias they resolved it through —
     and every device that works today does so through this path.
  */
  if (ALIAS_IDS.has(granted)) return null;
  return { requested, granted };
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
  /* Processing this caller asked for on purpose, so an obeyed request is not
     reported as the browser overriding the constraints. */
  intentional: readonly string[] = [],
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

    /*
       A browser that substitutes a device has produced a stream that answers a
       question nobody asked. Measuring it and labelling it with the requested
       input is worse than failing, because the reading looks ordinary.
    */
    const mismatch = deviceIdMismatch(deviceId, settings);
    if (mismatch) {
      throw new Error(
        `The browser opened a different input than the one selected ` +
        `(asked for ${mismatch.requested.slice(0, 12)}…, got ${mismatch.granted.slice(0, 12)}…). ` +
        `Reselect the input and try again.`,
      );
    }

    const warnings = checkAppliedProcessing(settings, intentional);
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

    /*
       A worklet is only pulled when its output reaches a destination, so the
       graph has to end somewhere. Which destination is not a free choice on
       Android.

       Reaching ctx.destination opens a hardware output stream, and Android
       routes a communication device as an input/output pair — so about
       thirty-four seconds after that output appears it re-evaluates the pair
       and drags the input back to the built-in microphone. Measured on a
       Pixel 3 XL with a USB pickup: an analyser alone held the USB input for
       fifty seconds at full scale; the same graph ending at ctx.destination
       collapsed by seventy decibels at thirty-four seconds every time; ending
       at a MediaStreamAudioDestinationNode held for fifty-five.

       A stream sink pulls the graph without opening a hardware output, so it
       is used wherever the route has to survive. It is not the default,
       because every Apple and desktop device that works today works through
       ctx.destination and Safari has its own history with stream sinks.
    */
    const usesCommunicationRoute = isProcessingRequested(constraints, 'echoCancellation');
    const sink: AudioNode = usesCommunicationRoute
      ? ctx.createMediaStreamDestination()
      : ctx.destination;

    const silence = ctx.createGain();
    silence.gain.value = 0;
    source.connect(node);
    node.connect(silence);
    silence.connect(sink);

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
