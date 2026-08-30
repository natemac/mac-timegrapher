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
import { startCapture, type CaptureSession } from './audio/audio-engine';
import { SignalMeter, type SignalState } from './audio/signal-strength';
import { PermissionGate } from './components/PermissionGate';
import { DeviceSelector } from './components/DeviceSelector';
import { LevelMeter } from './components/LevelMeter';
import { WaveformCanvas } from './components/WaveformCanvas';
import { SourceFooter } from './components/SourceFooter';
import { MeasurementPanel } from './components/MeasurementPanel';
import { TimegrapherEngine, type Measurement, type Beat } from './timegrapher/tg-engine';
import { StabilityTracker, type Settling, type Spread } from './timegrapher/stability';
import { TraceCanvas } from './components/TraceCanvas';
import { SettingsSheet, DEFAULT_SETTINGS, type Settings } from './components/SettingsSheet';
import type { Topic } from './components/guide-content';

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
  const [signal, setSignal] = useState<SignalState | null>(null);
  const [latest, setLatest] = useState<Float32Array | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [settling, setSettling] = useState<Settling>('waiting');
  const [spreads, setSpreads] = useState<{ rate: Spread | null; amplitude: Spread | null; beatError: Spread | null }>({ rate: null, amplitude: null, beatError: null });
  const [graph, setGraph] = useState<'trace' | 'waveform'>('trace');
  // null topic means the full guide; a topic means one section's note.
  const [helpTopic, setHelpTopic] = useState<Topic | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const showHelp = useCallback((topic: Topic) => {
    setHelpTopic(topic);
    setSheetOpen(true);
  }, []);
  // Remembered per device: magnification is a matter of taste and of what the
  // operator is doing, and re-picking it every session would be tedious.
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem('mac-timegrapher.settings');
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    traceSecondsRef.current = next.traceSeconds;
    try {
      localStorage.setItem('mac-timegrapher.settings', JSON.stringify(next));
    } catch {
      // Private browsing or a full quota. A forgotten preference is not worth
      // failing over.
    }
  }, []);
  const [secondsCaptured, setSecondsCaptured] = useState(0);
  const [capturing, setCapturing] = useState(false);

  const session = useRef<CaptureSession | null>(null);
  const engine = useRef<TimegrapherEngine | null>(null);
  const meter = useRef(new SignalMeter());
  const stability = useRef(new StabilityTracker());
  // Beats accumulate across calls; the core re-reports overlapping windows,
  // so they are keyed by time to dedupe.
  const beatStore = useRef(new Map<number, Beat>());
  // Guards start/stop against re-entry. A ref rather than `busy` alone
  // because setState is asynchronous: two clicks inside one tick would both
  // read the old `busy` and both call getUserMedia, leaving the first
  // MediaStream unreachable with its tracks still live — the browser's
  // recording indicator then stays lit until the tab closes.
  const inFlight = useRef(false);
  // The measurement callback is created once when capture starts, so reading
  // settings directly from it would pin whatever they were at that moment.
  // A ref keeps it current when they change mid-capture.
  const traceSecondsRef = useRef(DEFAULT_SETTINGS.traceSeconds);

  useEffect(() => {
    traceSecondsRef.current = settings.traceSeconds;
  }, [settings.traceSeconds]);

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
    setSampleRate(null);
    setRequestedSampleRate(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    setError(
      'The audio input was disconnected. Reconnect it, or choose another ' +
      'input, then press Start again.',
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
          const cutoff = seconds - Math.max(60, traceSecondsRef.current + 10);
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

  return (
    <div className={granted ? 'app app--measuring' : 'app'}>
      <header className="app__masthead">
        <img
          className="app__logo app__logo--neg"
          src={`${import.meta.env.BASE_URL}mac-logo-neg.png`}
          alt="MAC Bespoke Watch Co."
        />
        <img
          className="app__logo app__logo--pos"
          src={`${import.meta.env.BASE_URL}mac-logo-pos.png`}
          alt=""
          aria-hidden="true"
        />
        <span className="app__wordmark">Timegrapher</span>

        <button
          className="icon-button"
          onClick={() => { setHelpTopic(null); setSheetOpen(true); }}
          aria-label="Guide and settings"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <SettingsSheet
        open={sheetOpen}
        topic={helpTopic}
        onClose={() => setSheetOpen(false)}
        onShowFullGuide={() => setHelpTopic(null)}
        settings={settings}
        onChange={updateSettings}
      />

      {!secure && (
        <div className="panel panel--tight">
          <p className="bad" style={{ margin: 0, fontSize: 13 }}>
            This page is not on a secure connection, so the browser will not
            grant microphone access. Open it over HTTPS.
          </p>
        </div>
      )}

      {!supported && (
        <div className="panel panel--tight">
          <p className="bad" style={{ margin: 0, fontSize: 13 }}>
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
            capturing={capturing}
            busy={busy}
            onSelect={setSelectedId}
            onStart={start}
            onStop={stop}
            onHelp={showHelp}
          />

          {error && (
            <div className="panel panel--tight">
              <p className="bad" style={{ margin: 0, fontSize: 13 }}>{error}</p>
            </div>
          )}

          <MeasurementPanel
            measurement={measurement}
            capturing={capturing}
            secondsCaptured={secondsCaptured}
            settling={settling}
            spreads={spreads}
            onHelp={showHelp}
          />

          <LevelMeter signal={signal} onHelp={showHelp} />

          {/* The graph takes whatever height is left, with its selector below
              it: the control belongs next to the thing it changes, and at the
              bottom it falls under the thumb. */}
          <div className="app__graph">
            {graph === 'trace' ? (
              <TraceCanvas
                beats={beats}
                bph={measurement?.detectedBph ?? 0}
                zoomMs={settings.zoomMs}
                windowSeconds={settings.traceSeconds}
                capturing={capturing}
                onHelp={showHelp}
              />
            ) : (
              <WaveformCanvas latest={latest} onHelp={showHelp} />
            )}
          </div>

          <div className="segmented">
            {(['trace', 'waveform'] as const).map((g) => (
              <button
                key={g}
                className={graph === g ? undefined : 'secondary'}
                style={{ textTransform: 'capitalize' }}
                onClick={() => setGraph(g)}
              >
                {g}
              </button>
            ))}
          </div>

          <SourceFooter />
        </>
      )}
    </div>
  );
}
