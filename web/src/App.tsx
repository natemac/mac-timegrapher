/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestPermission, listAudioInputs, saveSelection, loadSelection, resolveSelection,
  type AudioInput,
} from './audio/device-manager';
import { startCapture, type CaptureSession, type ProcessingWarning } from './audio/audio-engine';
import { SignalMeter, type SignalState } from './audio/signal-strength';
import { WavRecorder } from './audio/wav-recorder';
import { PermissionGate } from './components/PermissionGate';
import { DeviceSelector } from './components/DeviceSelector';
import { LevelMeter } from './components/LevelMeter';
import { WaveformCanvas } from './components/WaveformCanvas';
import { RecorderPanel } from './components/RecorderPanel';
import { SourceFooter } from './components/SourceFooter';
import { MeasurementPanel } from './components/MeasurementPanel';
import { TimegrapherEngine, type Measurement, type Beat } from './timegrapher/tg-engine';
import { StabilityTracker, type Settling, type Spread } from './timegrapher/stability';
import { TraceCanvas } from './components/TraceCanvas';

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return 'Could not open the audio input.';
  switch (err.name) {
    case 'NotAllowedError':
      return 'Microphone access was denied. Allow it in your browser’s site settings, then reload.';
    case 'NotFoundError':
      return 'No audio input was found. Connect a microphone or USB timegrapher and reload.';
    case 'NotReadableError':
      return 'The device is in use by another application. Close it and try again.';
    case 'OverconstrainedError':
      return 'That device was disconnected. Choose another input.';
    default:
      return err.message;
  }
}

export default function App() {
  const [granted, setGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<AudioInput[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [requestedSampleRate, setRequestedSampleRate] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<ProcessingWarning[]>([]);
  const [signal, setSignal] = useState<SignalState | null>(null);
  const [latest, setLatest] = useState<Float32Array | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [settling, setSettling] = useState<Settling>('waiting');
  const [spreads, setSpreads] = useState<{ rate: Spread | null; amplitude: Spread | null; beatError: Spread | null }>({ rate: null, amplitude: null, beatError: null });
  const [graph, setGraph] = useState<'trace' | 'waveform'>('trace');
  const [secondsCaptured, setSecondsCaptured] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);

  const session = useRef<CaptureSession | null>(null);
  const engine = useRef<TimegrapherEngine | null>(null);
  const meter = useRef(new SignalMeter());
  const stability = useRef(new StabilityTracker());
  // Beats accumulate across calls; the core re-reports overlapping windows,
  // so they are keyed by time to dedupe.
  const beatStore = useRef(new Map<number, Beat>());
  const recorder = useRef<WavRecorder | null>(null);
  const isRecording = useRef(false);
  // Guards start/stop against re-entry. A ref rather than `busy` alone
  // because setState is asynchronous: two clicks inside one tick would both
  // read the old `busy` and both call getUserMedia, leaving the first
  // MediaStream unreachable with its tracks still live — the browser's
  // recording indicator then stays lit until the tab closes.
  const inFlight = useRef(false);

  const secure = window.isSecureContext;
  const supported = typeof AudioWorkletNode !== 'undefined';

  const refreshDevices = useCallback(async () => {
    const found = await listAudioInputs();
    setDevices(found);
    const chosen = resolveSelection(loadSelection(), found);
    setSelectedId(chosen?.deviceId ?? null);
  }, []);

  const grant = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestPermission();
      setGranted(true);
      await refreshDevices();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!granted) return;
    const onChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [granted, refreshDevices]);

  // Cleanup-only: release a live capture session if App unmounts mid-capture
  // (in production App is the singleton root, so this mostly guards against
  // leaking the MediaStream/AudioContext during Fast Refresh in development).
  useEffect(() => {
    return () => {
      // Nothing is left to report a failure to at unmount, and an unhandled
      // rejection here would surface as a spurious console error.
      void session.current?.stop().catch(() => {});
    };
  }, []);

  const handleBlock = useCallback((block: Float32Array) => {
    engine.current?.push(block);
    setSignal(meter.current.push(block, block.length / (session.current?.sampleRate ?? 48000)));
    setLatest(block);
    if (isRecording.current && recorder.current) {
      recorder.current.push(block);
      setDuration(recorder.current.durationSeconds);
    }
  }, []);

  // Everything a capture teardown has to undo, whether it was asked for or
  // forced on us by the device disappearing. Kept in one place so the two
  // paths cannot drift apart.
  const releaseCaptureState = useCallback(() => {
    session.current = null;
    // The engine owns FFTW plans and a sixteen-second ring buffer in the wasm
    // heap. Dropping the reference without destroying it leaks both.
    engine.current?.destroy();
    engine.current = null;
    setMeasurement(null);
    setSecondsCaptured(0);
    // If capture stops while a recording is still in progress, reconcile
    // hasRecording the same way stopRecording() does — otherwise the
    // WavRecorder still holds captured audio but the Download button stays
    // disabled with no way to recover it.
    if (isRecording.current) {
      setHasRecording((recorder.current?.sampleCount ?? 0) > 0);
    }
    isRecording.current = false;
    setRecording(false);
    setCapturing(false);
    // Every live-updating display has to be cleared: a frozen waveform and a
    // frozen level meter both read as though capture were still running.
    setSignal(null);
    meter.current.reset();
    stability.current.reset();
    beatStore.current.clear();
    setBeats([]);
    setSettling('waiting');
    setSpreads({ rate: null, amplitude: null, beatError: null });
    setLatest(null);
    // Duration is the exception. Once a recording has ended it is no longer a
    // live counter but that recording's final length — the one number a
    // fixture is judged by. Zeroing it would show "0.0 s" beside an enabled
    // Download button. Clear it only when there is nothing left to download.
    if ((recorder.current?.sampleCount ?? 0) === 0) {
      setDuration(0);
    }
    setSampleRate(null);
    setRequestedSampleRate(null);
    setWarnings([]);
  }, []);

  const handleDisconnect = useCallback(() => {
    setError(
      'The audio input was disconnected. Reconnect it, or choose another ' +
      'input, then press Start again. Anything recorded up to that point is ' +
      'still available to download.',
    );
    // The MediaStreamTrack has already ended, but the AudioContext and the
    // graph built on it have not: run the same teardown a deliberate stop
    // would, so nothing is left holding the device.
    void session.current?.stop().catch(() => {});
    releaseCaptureState();
  }, [releaseCaptureState]);

  const start = async () => {
    if (!selectedId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const s = await startCapture(selectedId, handleBlock, handleDisconnect);
      session.current = s;

      // Built at the rate the device actually granted, not the one requested:
      // the core's period arithmetic is in samples, so a wrong rate here would
      // scale every reading.
      // Runs in a Worker: the analysis sweeps a sixteen-second window through
      // seven FFTs, which visibly stutters the waveform if done on this thread.
      engine.current = TimegrapherEngine.create({
        sampleRate: s.sampleRate,
        bph: 0,           // detect automatically until movement presets land
        liftAngle: 52,    // tg's default; per-movement values come with presets
        onMeasurement: (m, seconds, newBeats) => {
          setMeasurement(m);
          setSecondsCaptured(seconds);

          for (const b of newBeats) beatStore.current.set(b.time, b);
          // Keep a minute of beats; the trace shows thirty seconds of them.
          const cutoff = seconds - 60;
          for (const key of beatStore.current.keys()) {
            if (key < cutoff) beatStore.current.delete(key);
          }
          setBeats([...beatStore.current.values()].sort((a, b) => a.time - b.time));

          if (m.valid) {
            stability.current.push(seconds, m.rate, m.amplitude, m.beatError);
            setSpreads({
              rate: stability.current.spread('rate'),
              amplitude: stability.current.spread('amplitude'),
              beatError: stability.current.spread('beatError'),
            });
          }
          setSettling(stability.current.settling(seconds));
        },
        // Capture still works without measurement — the meter, waveform and
        // recorder are useful on their own — so report and carry on.
        onError: (message) => setError(`Measurement unavailable: ${message}`),
      });

      setSampleRate(s.sampleRate);
      setRequestedSampleRate(s.requestedSampleRate ?? null);
      setWarnings(s.warnings);
      setCapturing(true);
      saveSelection(selectedId);
    } catch (err) {
      setError(describeError(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const stop = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await session.current?.stop();
    } catch (err) {
      // ctx.close() can reject. Without this the state below never ran, so
      // the button stayed on Stop and the dropdown stayed disabled with no
      // way back short of reloading the page.
      setError(describeError(err));
    } finally {
      releaseCaptureState();
      inFlight.current = false;
      setBusy(false);
    }
  };

  const startRecording = () => {
    if (!session.current) return;
    recorder.current = new WavRecorder(session.current.sampleRate, 1);
    setDuration(0);
    setHasRecording(false);
    isRecording.current = true;
    setRecording(true);
  };

  const stopRecording = () => {
    isRecording.current = false;
    setRecording(false);
    setHasRecording((recorder.current?.sampleCount ?? 0) > 0);
  };

  const download = () => {
    if (!recorder.current) return;
    const blob = new Blob([recorder.current.toWav()], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `timegrapher-${stamp}.wav`;
    a.click();
    // Deferred: revoking immediately after click() on an anchor never added
    // to the DOM is fragile on some Safari versions, and Safari on macOS is
    // an explicit acceptance target for this milestone.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>MAC Bespoke Timegrapher</h1>
      <p className="dim" style={{ marginTop: 0 }}>Audio capture and hardware verification</p>

      {!secure && (
        <div className="panel">
          <p className="bad" style={{ margin: 0 }}>
            This page is not on a secure connection, so the browser will not
            grant microphone access. Open it over HTTPS.
          </p>
        </div>
      )}

      {!supported && (
        <div className="panel">
          <p className="bad" style={{ margin: 0 }}>
            This browser does not support AudioWorklet. Use a current version of
            Chrome, Edge or Safari.
          </p>
        </div>
      )}

      {secure && supported && !granted && (
        <PermissionGate onGrant={grant} error={error} busy={busy} />
      )}

      {granted && (
        <>
          <DeviceSelector
            devices={devices}
            selectedId={selectedId}
            sampleRate={sampleRate}
            requestedSampleRate={requestedSampleRate}
            warnings={warnings}
            capturing={capturing}
            busy={busy}
            onSelect={setSelectedId}
            onStart={start}
            onStop={stop}
          />
          {error && <div className="panel"><p className="bad" style={{ margin: 0 }}>{error}</p></div>}
          <MeasurementPanel
            measurement={measurement}
            capturing={capturing}
            secondsCaptured={secondsCaptured}
            settling={settling}
            spreads={spreads}
          />
          <LevelMeter signal={signal} />

          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['trace', 'waveform'] as const).map((g) => (
              <button
                key={g}
                className={graph === g ? undefined : 'secondary'}
                style={{ fontSize: 13, padding: '7px 14px', textTransform: 'capitalize' }}
                onClick={() => setGraph(g)}
              >
                {g}
              </button>
            ))}
          </div>

          {graph === 'trace' ? (
            <TraceCanvas
              beats={beats}
              bph={measurement?.detectedBph ?? 0}
              capturing={capturing}
            />
          ) : (
            <WaveformCanvas latest={latest} />
          )}
          <RecorderPanel
            recording={recording}
            duration={duration}
            canRecord={capturing}
            onStart={startRecording}
            onStop={stopRecording}
            onDownload={download}
            hasRecording={hasRecording}
          />
        </>
      )}

      <SourceFooter />
    </main>
  );
}
