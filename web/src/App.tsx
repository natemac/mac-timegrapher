/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useCallback, useEffect, useRef, useState } from 'react';
import './styles/tokens.css';
import {
  requestPermission, listAudioInputs, saveSelection, loadSelection, resolveSelection,
  type AudioInput,
} from './audio/device-manager';
import { startCapture, type CaptureSession, type ProcessingWarning } from './audio/audio-engine';
import { measureLevel, type LevelReading } from './audio/level-meter';
import { WavRecorder } from './audio/wav-recorder';
import { PermissionGate } from './components/PermissionGate';
import { DeviceSelector } from './components/DeviceSelector';
import { LevelMeter } from './components/LevelMeter';
import { WaveformCanvas } from './components/WaveformCanvas';
import { RecorderPanel } from './components/RecorderPanel';
import { SourceFooter } from './components/SourceFooter';

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
  const [reading, setReading] = useState<LevelReading | null>(null);
  const [latest, setLatest] = useState<Float32Array | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);

  const session = useRef<CaptureSession | null>(null);
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
    setReading(measureLevel(block));
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
    // Every live-updating display has to be cleared, not just the numeric
    // ones: a frozen waveform and a frozen duration counter both read as
    // though capture were still running.
    setReading(null);
    setLatest(null);
    setDuration(0);
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
          <LevelMeter reading={reading} />
          <WaveformCanvas latest={latest} />
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
