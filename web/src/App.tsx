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
import { GraphSwitch, type Graph } from './components/GraphSwitch';
import { resolveZoom, ZOOM_AUTO } from './timegrapher/trace-zoom';
import { SettingsSheet, DEFAULT_SETTINGS, type Settings } from './components/SettingsSheet';
import type { Topic } from './components/guide-content';
import { findMovement, engineConfigFor } from './timegrapher/movements';
import { useWakeLock } from './hooks/useWakeLock';
import { SessionSheet } from './components/SessionSheet';
import { loadMode, saveMode, type Mode } from './components/ModeSwitch';
import { InspectionWizard } from './components/InspectionWizard';
import {
  startWizard, begin, captured, advance, finish, retry, jumpTo, positionAt,
  shouldAutoCapture, loadAutoCapture, saveAutoCapture, type WizardState,
} from './timegrapher/wizard';
import {
  drawSnapshot, dataUrlToBytes, snapshotFilename, loadSnapshotLogo, deliverSnapshot,
  type SnapshotInput,
} from './export/snapshot';
import * as sessionStore from './timegrapher/session';
import type { PositionId, Reading, SessionMeta } from './timegrapher/session';
import { Certificate } from './components/Certificate';
import { DEFAULT_LIFT_ANGLE } from './timegrapher/movements';

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
  const [graph, setGraph] = useState<Graph>('trace');
  // Remembered: a bench usually works through a batch of the same calibre.
  const [movementId, setMovementId] = useState<string | null>(
    () => {
      try {
        return localStorage.getItem('mac-timegrapher.movement');
      } catch {
        return null;
      }
    },
  );

  const selectMovement = useCallback((id: string | null) => {
    setMovementId(id);
    try {
      if (id) localStorage.setItem('mac-timegrapher.movement', id);
      else localStorage.removeItem('mac-timegrapher.movement');
    } catch {
      // Private browsing or a full quota; a forgotten preference is not worth
      // failing over.
    }
  }, []);
  // null topic means the full guide; a topic means one section's note.
  const [helpTopic, setHelpTopic] = useState<Topic | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [readings, setReadings] = useState<Reading[]>(() => sessionStore.load());
  const [meta, setMeta] = useState<SessionMeta>(() => sessionStore.loadMeta());

  // Which job the operator is here to do. Remembered: a bench that certifies
  // does it all day, and a bench that regulates never opens the wizard.
  const [mode, setMode] = useState<Mode>(loadMode);
  const [wizard, setWizard] = useState<WizardState>(startWizard);
  const [autoCapture, setAutoCapture] = useState(loadAutoCapture);
  const [snapshotNote, setSnapshotNote] = useState<string | null>(null);

  const selectMode = useCallback((next: Mode) => {
    setMode(next);
    saveMode(next);
  }, []);

  const changeAutoCapture = useCallback((next: boolean) => {
    setAutoCapture(next);
    saveAutoCapture(next);
  }, []);

  const updateMeta = useCallback((next: SessionMeta) => {
    setMeta(next);
    sessionStore.saveMeta(next);
  }, []);

  /*
     Stable identities. Both sheets key effects on their close handler, and a
     fresh arrow on every render re-runs those effects at the rate the app
     re-renders — twice a second while measuring.
  */
  const closeSession = useCallback(() => setSessionOpen(false), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const showFullGuide = useCallback(() => setHelpTopic(null), []);

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
  // Capture reads the latest measurement without being rebuilt on every one of
  // them, which would otherwise re-render the capture control twice a second.
  const measurementRef = useRef<Measurement | null>(null);
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
  /*
    Consecutive settled reports. `settling()` is already conservative, but it
    is evaluated twice a second and a reading can graze the bounds for a single
    report on its way through — an unattended capture must not fire on that.
  */
  const settledRuns = useRef(0);
  // Read by wizardCapture, which must not be rebuilt on every step change:
  // it is a dependency of the auto-capture effect, which runs twice a second.
  const wizardRef = useRef(wizard);
  // Decoded ahead of time. iOS only honours navigator.share while it can still
  // see the tap, and waiting on an image load inside the handler loses it.
  const snapshotLogo = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    traceSecondsRef.current = settings.traceSeconds;
  }, [settings.traceSeconds]);

  useEffect(() => {
    wizardRef.current = wizard;
  }, [wizard]);

  useEffect(() => {
    void loadSnapshotLogo(import.meta.env.BASE_URL).then((img) => {
      snapshotLogo.current = img;
    });
  }, []);

  // Readings take half a minute to settle and the operator's hands are on a
  // watch, not the screen.
  useWakeLock(capturing);

  const capture = useCallback((position: PositionId) => {
    const m = measurementRef.current;
    if (!m?.valid) return;
    const next = sessionStore.upsert(readings, {
      position,
      rate: m.rate,
      amplitude: m.amplitude,
      beatError: m.beatError,
      bph: m.detectedBph,
      at: new Date().toISOString(),
    });
    setReadings(next);
    sessionStore.save(next);
  }, [readings]);

  /*
    Throw away the collected average and the trace, keeping the audio running.
    Moving the watch onto the sensor makes a burst of noise the spread cannot
    distinguish from the movement misbehaving, and it would otherwise sit in
    the window for the next thirty seconds.

    Deliberately not a full stop and start: that would tear down the engine and
    the microphone for something the operator does several times a session.
  */
  const resetAverage = useCallback(() => {
    stability.current.reset();
    beatStore.current.clear();
    setBeats([]);
    setSpreads({ rate: null, amplitude: null, beatError: null });
    setSettling('waiting');
    engine.current?.reset();
  }, []);

  /*
     The wizard's Go.

     Restarting the average is the whole point of the button: the operator has
     just had a hand on the watch, and that handling noise is sitting in the
     window. Everything measured from here was recorded after the watch went
     still.
  */
  const wizardGo = useCallback(() => {
    settledRuns.current = 0;
    resetAverage();
    setWizard(begin);
  }, [resetAverage]);

  const wizardCapture = useCallback(() => {
    const p = positionAt(wizardRef.current.step);
    if (!p) return;
    capture(p);
    setWizard(captured);
  }, [capture]);

  const restartWizard = useCallback(() => {
    settledRuns.current = 0;
    setWizard(startWizard());
  }, []);

  const jumpWizard = useCallback((step: number) => {
    settledRuns.current = 0;
    setWizard((w) => jumpTo(w, step));
  }, []);

  const clearSession = useCallback(() => {
    setReadings([]);
    setMeta(sessionStore.EMPTY_META);
    sessionStore.clear();
    setSessionOpen(false);
  }, []);

  /*
    Close the sheet before printing. The print stylesheet hides it anyway, but
    a modal left open behind the print dialog is disorienting when it returns —
    and on iOS the dialog is a full-screen takeover, so the app underneath
    should be in a sensible state when it comes back.
  */
  const printCertificate = useCallback(() => {
    setSessionOpen(false);
    window.setTimeout(() => window.print(), 60);
  }, []);


  /*
     Count consecutive settled reports.

     Declared before the effect that reads it, because effects run in
     declaration order and the auto-capture check has to see this update's
     count rather than the previous one's. `secondsCaptured` is in the
     dependencies because it is the only value that changes on every report —
     `settling` alone would run this on transitions only.
  */
  useEffect(() => {
    settledRuns.current = settling === 'settled' ? settledRuns.current + 1 : 0;
  }, [settling, secondsCaptured]);

  useEffect(() => {
    if (mode !== 'inspection') return;
    if (
      !shouldAutoCapture({
        stage: wizard.stage,
        auto: autoCapture,
        valid: measurement?.valid ?? false,
        settling,
        settledRuns: settledRuns.current,
      })
    ) {
      return;
    }
    wizardCapture();
  }, [mode, wizard.stage, autoCapture, measurement, settling, secondsCaptured, wizardCapture]);

  /*
     Move on by itself, but only when the operator asked not to be involved.
     Long enough to read which position was recorded before it is replaced by
     the instruction for the next one.
  */
  useEffect(() => {
    if (mode !== 'inspection' || wizard.stage !== 'captured' || !autoCapture) return;
    const id = window.setTimeout(() => setWizard(advance), 1600);
    return () => window.clearTimeout(id);
  }, [mode, wizard.stage, wizard.step, autoCapture]);

  // The engine is built from the movement, so it is created by an effect rather
  // than inside start(): changing the movement mid-capture has to rebuild it,
  // and previously that silently did nothing — the operator picked the right
  // calibre, saw amplitude not move, and had no way to know why.
  //
  // Runs in a Worker. The analysis sweeps a sixteen-second window through seven
  // FFTs, which visibly stutters the UI on the main thread.
  useEffect(() => {
    if (!capturing || sampleRate === null) return;

    const { bph, liftAngle } = engineConfigFor(findMovement(movementId));
    const built = TimegrapherEngine.create({
      sampleRate,
      bph,
      liftAngle,
      onMeasurement: (m, seconds, newBeats) => {
        setMeasurement(m);
        measurementRef.current = m;
        setSecondsCaptured(seconds);

        for (const b of newBeats) beatStore.current.set(b.time, b);
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
      // Capture still works without measurement — the meter, waveform and trace
      // are useful on their own — so report and carry on.
      onError: (message) => setError(`Measurement unavailable: ${message}`),
    });
    engine.current = built;

    return () => {
      built.destroy();
      if (engine.current === built) engine.current = null;
      // A changed calibre invalidates everything derived from the old one.
      stability.current.reset();
      beatStore.current.clear();
      setBeats([]);
      setMeasurement(null);
      measurementRef.current = null;
      setSpreads({ rate: null, amplitude: null, beatError: null });
      setSettling('waiting');
    };
  }, [capturing, sampleRate, movementId]);

  // Auto magnification follows the reading, so it is resolved here rather than
  // inside the canvas — the header has to show the figure actually in use.
  const effectiveZoom = resolveZoom(
    settings.zoomMs,
    measurement?.valid ? measurement.rate : 0,
    settings.traceSeconds,
  );

  const chosenMovement = findMovement(movementId);
  const movementLabel = chosenMovement ? `${chosenMovement.maker} ${chosenMovement.name}` : null;

  /*
     Save the reading on screen as an image.

     Everything up to the share call is synchronous on purpose: iOS Safari only
     opens the share sheet while it can still attribute the call to the tap
     that started it, and an awaited toBlob is enough of a gap to lose that.
  */
  const saveSnapshot = useCallback(async () => {
    const m = measurementRef.current;
    if (!m?.valid) return;

    const input: SnapshotInput = {
      rate: m.rate,
      amplitude: m.amplitude,
      beatError: m.beatError,
      bph: m.detectedBph,
      spreads,
      movementName: movementLabel,
      position: mode === 'inspection' ? positionAt(wizard.step) : null,
      reference: meta.reference,
      at: new Date(),
      showLogo: settings.showLogo,
    };

    try {
      const canvas = document.createElement('canvas');
      drawSnapshot(canvas, input, snapshotLogo.current);
      const bytes = dataUrlToBytes(canvas.toDataURL('image/png'));
      const name = snapshotFilename(input);
      const file = new File([bytes], name, { type: 'image/png' });
      const outcome = await deliverSnapshot(file);
      setSnapshotNote(outcome === 'shared' ? 'Image shared.' : `Saved as ${name}`);
    } catch (err) {
      // Dismissing the share sheet rejects with AbortError. That is the
      // operator changing their mind, not a failure to report.
      if (err instanceof Error && err.name === 'AbortError') return;
      setSnapshotNote('Could not save the image.');
    }
  }, [spreads, movementLabel, mode, wizard.step, meta.reference, settings.showLogo]);

  useEffect(() => {
    if (!snapshotNote) return;
    const id = window.setTimeout(() => setSnapshotNote(null), 3200);
    return () => window.clearTimeout(id);
  }, [snapshotNote]);

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
    setMeasurement(null);
    measurementRef.current = null;
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

      // The rate the device actually granted, not the one requested. The core's
      // period arithmetic is in samples, so a wrong figure here would scale
      // every reading; the engine effect builds from this value.
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
    <>
    <div className={granted ? 'app app--measuring' : 'app'}>
      <header className="app__masthead">
        {settings.showLogo && (
          <>
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
          </>
        )}
        <span className="app__wordmark">Timegrapher</span>

        <div className="app__controls">
        <button
          className="icon-button"
          onClick={() => setSessionOpen(true)}
          aria-label={`Session — ${readings.length} of 6 positions recorded`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M4 5.5h16M4 12h16M4 18.5h16" strokeLinecap="round" />
          </svg>
          {readings.length > 0 && <span className="icon-button__badge">{readings.length}</span>}
        </button>

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
        </div>
      </header>

      <SessionSheet
        open={sessionOpen}
        onClose={closeSession}
        readings={readings}
        movementName={movementLabel}
        meta={meta}
        onChangeMeta={updateMeta}
        onPrint={printCertificate}
        onClear={clearSession}
      />


      <SettingsSheet
        open={sheetOpen}
        topic={helpTopic}
        onClose={closeSheet}
        onShowFullGuide={showFullGuide}
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
        <>
          <PermissionGate
            onGrant={grant}
            error={error}
            busy={busy}
            mode={mode}
            onSelectMode={selectMode}
          />
          {/*
            The source offer under GPLv2 §3. It is off the measuring screen,
            which has no room for it, but it is the first thing every visitor
            passes on the way in and it is repeated at the foot of the guide —
            so it is always present and always one tap away, which is what the
            licence asks for. It is not conditional on anything.
          */}
          <SourceFooter />
        </>
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
            movementId={movementId}
            onSelectMovement={selectMovement}
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
            onResetAverage={resetAverage}
            onSnapshot={saveSnapshot}
            guidance={mode === 'measure'}
          />

          {snapshotNote && (
            <p className="dim app__note" role="status">{snapshotNote}</p>
          )}

          {mode === 'inspection' && (
            <InspectionWizard
              state={wizard}
              capturing={capturing}
              settling={settling}
              valid={measurement?.valid ?? false}
              seconds={secondsCaptured}
              auto={autoCapture}
              onAutoChange={changeAutoCapture}
              onGo={wizardGo}
              onCapture={wizardCapture}
              onSkip={() => setWizard(advance)}
              onNext={() => setWizard(advance)}
              onRetry={() => setWizard(retry)}
              onFinish={() => setWizard(finish)}
              onRestart={restartWizard}
              onOpenSummary={() => setSessionOpen(true)}
              onJump={jumpWizard}
            />
          )}

          <LevelMeter signal={signal} onHelp={showHelp} />

          {/* One panel, two views. The switch names what you are looking at,
              so the panel needs no separate label of its own. */}
          <div className="panel panel--tight app__graph">
            <div className="panel__head">
              <GraphSwitch value={graph} onChange={setGraph} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="dim mono" style={{ fontSize: 10 }}>
                  {graph === 'trace'
                    ? `${settings.traceSeconds}s · ${effectiveZoom}ms${settings.zoomMs === ZOOM_AUTO ? ' auto' : ''}`
                    : '1s'}
                </span>
                <button
                  className="panel__help-icon"
                  onClick={() => showHelp(graph)}
                  aria-label={graph === 'trace' ? 'What is the trace?' : 'What is the waveform?'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.6-2.8 2.6" strokeLinecap="round" />
                    <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>
            </div>

            {graph === 'trace' ? (
              <TraceCanvas
                beats={beats}
                bph={measurement?.detectedBph ?? 0}
                zoomMs={effectiveZoom}
                rate={measurement?.valid ? measurement.rate : 0}
                windowSeconds={settings.traceSeconds}
                capturing={capturing}
              />
            ) : (
              <WaveformCanvas latest={latest} />
            )}
          </div>
        </>
      )}
    </div>

    {/*
      Outside .app on purpose. The print stylesheet hides .app, and a hidden
      parent hides its children however they are styled — nested here, printing
      produced a blank page.
    */}
    <Certificate
      readings={readings}
      meta={meta}
      movementName={movementLabel}
      liftAngle={findMovement(movementId)?.liftAngle ?? DEFAULT_LIFT_ANGLE}
      deviceLabel={devices.find((d) => d.deviceId === selectedId)?.label ?? null}
      sampleRate={sampleRate}
      showLogo={settings.showLogo}
    />
    </>
  );
}
