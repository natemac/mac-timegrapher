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

  const handleBlock = useCallback((block: Float32Array) => {
    setReading(measureLevel(block));
    setLatest(block);
    if (isRecording.current && recorder.current) {
      recorder.current.push(block);
      setDuration(recorder.current.durationSeconds);
    }
  }, []);

  const start = async () => {
    if (!selectedId) return;
    setError(null);
    try {
      const s = await startCapture(selectedId, handleBlock);
      session.current = s;
      setSampleRate(s.sampleRate);
      setWarnings(s.warnings);
      setCapturing(true);
      saveSelection(selectedId);
    } catch (err) {
      setError(describeError(err));
    }
  };

  const stop = async () => {
    isRecording.current = false;
    setRecording(false);
    await session.current?.stop();
    session.current = null;
    setCapturing(false);
    setReading(null);
    setSampleRate(null);
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
    URL.revokeObjectURL(url);
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
            warnings={warnings}
            capturing={capturing}
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
