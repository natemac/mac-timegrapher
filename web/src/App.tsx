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
import {
  ClockCalibrator, correctedSampleRate, type ClockResult, type ClockDebug,
} from './audio/clock-calibration';
import { PermissionGate } from './components/PermissionGate';
import { DeviceSelector } from './components/DeviceSelector';
import { LevelMeter } from './components/LevelMeter';
import { WaveformCanvas } from './components/WaveformCanvas';
import { SourceFooter } from './components/SourceFooter';
import { MeasurementPanel } from './components/MeasurementPanel';
import { TimegrapherEngine, type Measurement, type Beat, type BeatWaveform, type Calibration } from './timegrapher/tg-engine';
import {
  StabilityTracker, SETTLED_BOUNDS, type BestSpread, type Settling, type Spread,
} from './timegrapher/stability';
import { TraceCanvas } from './components/TraceCanvas';
import { BeatCanvas } from './components/BeatCanvas';
import { GraphSwitch, type Graph } from './components/GraphSwitch';
import { resolveZoom, ZOOM_AUTO } from './timegrapher/trace-zoom';
import {
  SettingsSheet, DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings,
} from './components/SettingsSheet';
import { GUIDE, type Topic } from './components/guide-content';
import { findMovement, engineConfigFor, isQuartz, loadMovementId, saveMovementId } from './timegrapher/movements';
import { useWakeLock } from './hooks/useWakeLock';
import { useInspectionRun } from './hooks/useInspectionRun';
import { SessionSheet } from './components/SessionSheet';
import { loadMode, saveMode, type Mode } from './components/ModeSwitch';
import { InspectionWizard } from './components/InspectionWizard';
import {
  startWizard, begin, abort, captured, advance, finish, retry, jumpTo,
  positionAt, loadAutoCapture, saveAutoCapture,
  COUNTDOWN_SECONDS, type WizardState,
} from './timegrapher/wizard';
import {
  drawSnapshot, dataUrlToBytes, snapshotFilename, loadSnapshotLogo, deliverSnapshot,
  type SnapshotInput,
} from './export/snapshot';
import { DiagnosticsLog, diagnosticsFilename } from './export/diagnostics';
import { runningSummary, type PositionId } from './timegrapher/session';
import {
  createInspection, upsertReading, putInspection,
  loadInspections, saveInspections, loadCurrentId, saveCurrentId,
  type Inspection,
} from './timegrapher/inspections';
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
  const [beatWaveform, setBeatWaveform] = useState<BeatWaveform | null>(null);
  /* A quartz clock check. Non-null only while one is running or has just
     finished; it is deliberately not persisted, because the result is a
     measurement of this session's audio path and nothing else. */
  const [clockCheck, setClockCheck] = useState<Calibration | null>(null);
  /* Held in a ref, not state: the engine effect has to read it without being
     re-run by it, or asking for a check would tear down the engine. */
  const wantClockCheck = useRef(false);
  const [settling, setSettling] = useState<Settling>('waiting');
  const [spreads, setSpreads] = useState<{ rate: Spread | null; amplitude: Spread | null; beatError: Spread | null }>({ rate: null, amplitude: null, beatError: null });
  // Read when the settings sheet opens rather than tracked continuously: it is
  // a slow-moving figure and re-rendering the app for it would be waste.
  const [bestSpread, setBestSpread] = useState<BestSpread>({ rate: null, amplitude: null, beatError: null });
  const [diagnosticSamples, setDiagnosticSamples] = useState(0);
  const [clock, setClock] = useState<ClockResult | null>(null);
  const [clockDebug, setClockDebug] = useState<ClockDebug>(() => new ClockCalibrator().debug());
  const [clockDisturbed, setClockDisturbed] = useState(false);
  /* Waveform by default: it shows something the moment audio arrives, so a
     first-time user can tell the sensor is hearing the watch before any
     reading exists. The trace needs beats before it draws anything at all. */
  const [graph, setGraph] = useState<Graph>('waveform');
  /* Remembered: a bench usually works through a batch of the same calibre.
     Nothing stored means nothing has been chosen yet, which gets the default
     rather than automatic detection — see DEFAULT_MOVEMENT_ID. Automatic is
     stored explicitly so choosing it survives a reload. */
  const [movementId, setMovementId] = useState<string | null>(loadMovementId);

  const selectMovement = useCallback((id: string | null) => {
    setMovementId(id);
    saveMovementId(id);
  }, []);
  // null topic means the full guide; a topic means one section's note.
  const [helpTopic, setHelpTopic] = useState<Topic | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  /*
     Runs are records of their own, kept as a list, because a bench does not
     measure one watch at a time from start to finish. `current` is the one
     being added to; everything else is history that a before-and-after can be
     paired against.
  */
  const [saved, setSaved] = useState<Inspection[]>(loadInspections);
  const [current, setCurrent] = useState<Inspection>(() => {
    const all = loadInspections();
    const id = loadCurrentId();
    return all.find((i) => i.id === id) ?? createInspection();
  });

  // Which job the operator is here to do. Remembered: a bench that certifies
  // does it all day, and a bench that regulates never opens the wizard.
  const [mode, setMode] = useState<Mode>(loadMode);
  const [wizard, setWizard] = useState<WizardState>(startWizard);
  const [autoCapture, setAutoCapture] = useState(loadAutoCapture);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [snapshotNote, setSnapshotNote] = useState<string | null>(null);

  const selectMode = useCallback((next: Mode) => {
    setMode(next);
    saveMode(next);
  }, []);

  const changeAutoCapture = useCallback((next: boolean) => {
    setAutoCapture(next);
    saveAutoCapture(next);
  }, []);

  /* One place that writes: the run, its position in the list, and which run is
     open all have to move together or a reload finds them disagreeing. */
  const updateCurrent = useCallback((next: Inspection) => {
    setCurrent(next);
    setSaved((all) => {
      const merged = putInspection(all, next);
      saveInspections(merged);
      return merged;
    });
    saveCurrentId(next.id);
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
    setBestSpread(stability.current.best());
    setSheetOpen(true);
  }, []);

  /*
     The clock figure used to be read once, when the settings sheet opened.
     That suited a passive measurement you came back to later: by the time you
     looked, the run was long finished.

     Calibration is now a tab you sit and watch, so a result that only appears
     on the next open never appears at all — the counter passes 60s and nothing
     happens, which is exactly what it looked like.

     Polled at a second rather than derived during render. The fit is a least
     squares over thousands of points and this component re-renders on every
     audio block; running it there would be a regression per block.
  */
  useEffect(() => {
    if (!sheetOpen) return;
    const read = () => {
      setClock(calibrator.current.result());
      setClockDebug(calibrator.current.debug(sampleRate));
      setClockDisturbed(calibrator.current.disturbed);
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [sheetOpen, sampleRate]);

  const openSettings = useCallback(() => {
    setHelpTopic(null);
    setBestSpread(stability.current.best());
    setDiagnosticSamples(diagnostics.current.size);
    setSheetOpen(true);
  }, []);
  // Remembered per device: magnification is a matter of taste and of what the
  // operator is doing, and re-picking it every session would be tedious.
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    traceSecondsRef.current = next.traceSeconds;
    saveSettings(next);
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
  // stop() is declared below the effects that end a position; a ref lets them
  // call it without being rebuilt every time its closure changes.
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  // A written record of the run, for working out afterwards why a reading
  // behaved the way it did. Nothing leaves the device unless it is exported.
  const diagnostics = useRef(new DiagnosticsLog());
  // Measures the sound card's clock against the system clock while capture
  // runs. It costs nothing and needs no reference watch.
  const calibrator = useRef(new ClockCalibrator());
  // Read inside the measurement callback, which is built once per capture and
  // would otherwise pin whatever the signal was at that moment.
  const signalRef = useRef<SignalState | null>(null);
  // Read by start(), which is declared above where the label is computed.
  const movementLabelRef = useRef<string | null>(null);
  const movementIdRef = useRef<string | null>(null);
  // Read by capture(), which must not be rebuilt every time a detail is typed
  // — it is a dependency of the auto-record effect, which runs twice a second.
  const currentRef = useRef(current);

  useEffect(() => {
    traceSecondsRef.current = settings.traceSeconds;
  }, [settings.traceSeconds]);

  useEffect(() => {
    wizardRef.current = wizard;
  }, [wizard]);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    stopRef.current = stop;
  });

  useEffect(() => {
    void loadSnapshotLogo(import.meta.env.BASE_URL).then((img) => {
      snapshotLogo.current = img;
    });
  }, []);

  // Readings take half a minute to settle and the operator's hands are on a
  // watch, not the screen.
  useWakeLock(capturing);

  /*
     Hold off the browser's pull-to-refresh while a measurement is running.

     A reload is not destructive — recorded readings and the session details
     are in local storage — but it cuts the microphone off mid-reading and puts
     the run back to its first position. Off only while that matters: on an
     idle screen the gesture behaves as it does anywhere else.
  */
  useEffect(() => {
    if (!capturing) return;
    document.documentElement.classList.add('is-measuring');
    return () => document.documentElement.classList.remove('is-measuring');
  }, [capturing]);

  const capture = useCallback((position: PositionId) => {
    const m = measurementRef.current;
    if (!m?.valid) return;

    updateCurrent(upsertReading(
      { ...currentRef.current, movementId: movementIdRef.current, movementName: movementLabelRef.current },
      {
        position,
        rate: m.rate,
        amplitude: m.amplitude,
        beatError: m.beatError,
        bph: m.detectedBph,
        at: new Date().toISOString(),
      },
    ));

    diagnostics.current.event(
      'recorded',
      `${position} (${currentRef.current.phase})  rate ${m.rate.toFixed(1)}  amp ${m.amplitude.toFixed(0)}  beat ${m.beatError.toFixed(2)}`,
    );
  }, [updateCurrent]);

  /*
    Throw away the collected average and the trace, keeping the audio running.
    Moving the watch onto the sensor makes a burst of noise the spread cannot
    distinguish from the movement misbehaving, and it would otherwise sit in
    the window for the next thirty seconds.

    Deliberately not a full stop and start: that would tear down the engine and
    the microphone for something the operator does several times a session.
  */
  const resetAverage = useCallback(() => {
    diagnostics.current.event('average restarted');
    stability.current.reset();
    beatStore.current.clear();
    setBeats([]);
    setBeatWaveform(null);
    setSpreads({ rate: null, amplitude: null, beatError: null });
    setSettling('waiting');
    engine.current?.reset();
  }, []);

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

  /*
     Clear the reading and start the next watch.

     The technician and the calibre carry over, because the next watch is
     usually measured by the same person on the same bench. The reference does
     not: it is what identifies the watch, and inheriting it would silently
     pair the new reading with the old one's opposite pass.
  */
  const startNewInspection = useCallback(() => {
    const next = createInspection({
      // Before regulation, because that is what a watch arriving is. The
      // switch changes it in one tap when this is the second visit.
      phase: 'pre',
      technician: currentRef.current.technician,
      movementId: movementIdRef.current,
      movementName: movementLabelRef.current,
    });
    updateCurrent(next);
    settledRuns.current = 0;
    setWizard(startWizard());
    setSessionOpen(false);
  }, [updateCurrent]);


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

  /*
     The sequencing of a position — the grace, the unattended capture, and
     capture stopping once a reading is kept. It lived here as three effects
     and was verified by reading them; it is a hook now so it can be driven by
     a test, because it is the part that decides what lands on a document.
  */
  useInspectionRun({
    active: mode === 'inspection',
    wizard,
    setWizard,
    countdown,
    tickCountdown: () => setCountdown((n) => n - 1),
    settling,
    valid: measurement?.valid ?? false,
    auto: autoCapture,
    reportTick: secondsCaptured,
    settledRuns: () => settledRuns.current,
    resetSettledRuns: () => { settledRuns.current = 0; },
    resetAverage,
    capture: wizardCapture,
    stop: () => { void stopRef.current?.(); },
    note: (label) => diagnostics.current.event(label),
  })

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
    /*
       The one place a clock correction has to be applied. The core's arithmetic
       is in samples, so correcting the rate it is told corrects everything
       downstream from it.
    */
    const built = TimegrapherEngine.create({
      sampleRate: correctedSampleRate(sampleRate, settings.clockDriftSecondsPerDay),
      bph,
      liftAngle,
      onMeasurement: (m, seconds, newBeats, shape) => {
        setMeasurement(m);
        setBeatWaveform(shape);
        measurementRef.current = m;
        setSecondsCaptured(seconds);

        for (const b of newBeats) beatStore.current.set(b.time, b);
        const cutoff = seconds - Math.max(60, traceSecondsRef.current + 10);
        for (const key of beatStore.current.keys()) {
          if (key < cutoff) beatStore.current.delete(key);
        }
        setBeats([...beatStore.current.values()].sort((a, b) => a.time - b.time));

        if (m.valid) {
          stability.current.push(seconds, m.rate, m.amplitude, m.beatError, m.signalQuality);
          setSpreads({
            rate: stability.current.spread('rate'),
            amplitude: stability.current.spread('amplitude'),
            beatError: stability.current.spread('beatError'),
          });
        }
        const nextSettling = stability.current.settling(seconds);
        setSettling(nextSettling);

        diagnostics.current.sample({
          t: seconds,
          valid: m.valid,
          rate: m.rate,
          amplitude: m.amplitude,
          beatError: m.beatError,
          detectedBph: m.detectedBph,
          signalQuality: m.signalQuality,
          settling: nextSettling,
          rateSpread: stability.current.spread('rate')?.plusMinus ?? null,
          amplitudeSpread: stability.current.spread('amplitude')?.plusMinus ?? null,
          beatErrorSpread: stability.current.spread('beatError')?.plusMinus ?? null,
          headroomDb: signalRef.current?.headroomDb ?? null,
          levelDb: signalRef.current?.levelDb ?? null,
          clipped: signalRef.current?.clipped ?? false,
        });
      },
      onCalibration: (c) => setClockCheck(c),
      // Capture still works without measurement — the meter, waveform and trace
      // are useful on their own — so report and carry on.
      onError: (message) => {
        diagnostics.current.event('engine error', message);
        setError(`Measurement unavailable: ${message}`);
      },
    });
    engine.current = built;
    /* A check asked for while stopped: start() only sets `capturing`, and the
       engine does not exist until this effect runs a render later. Applying
       the wish here rather than at the button is what makes that work — and
       re-applies it if the engine is rebuilt mid-check. */
    if (wantClockCheck.current) built.startClockCheck();

    return () => {
      built.destroy();
      if (engine.current === built) engine.current = null;
      // A changed calibre invalidates everything derived from the old one.
      stability.current.reset();
      beatStore.current.clear();
      setBeats([]);
      setBeatWaveform(null);
      setMeasurement(null);
      measurementRef.current = null;
      setSpreads({ rate: null, amplitude: null, beatError: null });
      setSettling('waiting');
    };
  }, [capturing, sampleRate, movementId, settings.clockDriftSecondsPerDay]);

  // Auto magnification follows the reading, so it is resolved here rather than
  // inside the canvas — the header has to show the figure actually in use.
  const effectiveZoom = resolveZoom(
    settings.zoomMs,
    measurement?.valid ? measurement.rate : 0,
    settings.traceSeconds,
  );

  const chosenMovement = findMovement(movementId);
  const movementLabel = chosenMovement ? `${chosenMovement.maker} ${chosenMovement.name}` : null;
  movementLabelRef.current = movementLabel;
  movementIdRef.current = movementId;

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
      reference: current.reference,
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
  }, [spreads, movementLabel, mode, wizard.step, current.reference, settings.showLogo]);

  /*
     Hand over the session log.

     Deliberately not automatic and not uploaded anywhere: it carries the
     device name and the browser's user agent, so it leaves only when it is
     asked for.
  */
  const exportDiagnostics = useCallback(async () => {
    const name = diagnosticsFilename(new Date());
    try {
      const file = new File([diagnostics.current.toText()], name, { type: 'text/plain' });
      const outcome = await deliverSnapshot(file);
      setSnapshotNote(outcome === 'shared' ? 'Diagnostics shared.' : `Saved as ${name}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setSnapshotNote('Could not save the diagnostics.');
    }
  }, []);

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
    /*
       Sampled here rather than on a timer, because this runs off the audio
       thread's own delivery — so a stalled or throttled main thread shows up as
       a gap the calibrator discards rather than as false drift.
    */
    const ctx = session.current?.context;
    if (ctx && ctx.state === 'running') {
      calibrator.current.sample(ctx.currentTime, performance.now(), block.length);
    }

    engine.current?.push(block);
    const next = meter.current.push(block, block.length / (session.current?.sampleRate ?? 48000));
    signalRef.current = next;
    setSignal(next);
    setLatest(block);
  }, []);

  // Everything a capture teardown has to undo, whether it was asked for or
  // forced on us by the device disappearing. Kept in one place so the two
  // paths cannot drift apart.
  const releaseCaptureState = useCallback(() => {
    // A position interrupted before it recorded has nothing to keep, so the run
    // returns to the same prompt rather than advancing past it. A position that
    // already recorded is left alone — stopping is how each one ends.
    setWizard(abort);
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
    setBeatWaveform(null);
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
      calibrator.current.beginSession();
      setClock(null);
      saveSelection(selectedId);

      diagnostics.current.reset();
      diagnostics.current.setContext({
        device: devices.find((d) => d.deviceId === selectedId)?.label ?? null,
        sampleRate: s.sampleRate,
        requestedSampleRate: s.requestedSampleRate ?? null,
        processing: s.warnings.map((w) => `${w.setting}: ${w.state}`),
        movement: movementLabelRef.current,
        liftAngle: findMovement(movementId)?.liftAngle ?? null,
        bph: findMovement(movementId)?.bph ?? null,
        quartz: isQuartz(findMovement(movementId)),
        mode,
        settledBounds: SETTLED_BOUNDS,
        clockDriftSecondsPerDay: settings.clockDriftSecondsPerDay,
      });
      diagnostics.current.event('start', `${s.sampleRate} Hz`);

      // In an inspection this is the only trigger there is: it opens the
      // device and starts the position's grace in one press.
      if (mode === 'inspection') {
        setCountdown(COUNTDOWN_SECONDS);
        setWizard(begin);
      }
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
      diagnostics.current.event('stop');
      releaseCaptureState();
      inFlight.current = false;
      setBusy(false);
    }
  };

  /*
     The way back to the opening screen.

     Installed to the home screen the app has no browser chrome — no address
     bar, no reload, no pull-to-refresh — so once you are past the opening
     screen there is otherwise no route back to it. The mark and the product
     name are the way, because that is where a person looks for it.

     The capture is stopped first. Leaving the microphone open behind a screen
     that shows no meter and no readings is how a device ends up held with its
     input live and nothing on screen saying so.

     Nothing is lost by going back: the run in progress is written to storage
     on every change, so its readings and the run they belong to are exactly
     where they were when you come back in.
  */
  const goHome = async () => {
    if (capturing) await stop();
    setGranted(false);
    setError(null);
  };

  /*
     The quartz clock check. It needs a live capture with the reference watch
     on the sensor, so it starts one if there is not already one running —
     otherwise the button would silently do nothing on the settings screen,
     which is where it lives.
  */
  const startClockCheck = async () => {
    setClockCheck(null);
    wantClockCheck.current = true;
    if (!capturing) {
      // The engine effect picks the wish up when it builds one.
      await start();
      return;
    }
    engine.current?.startClockCheck();
  };

  const stopClockCheck = () => {
    wantClockCheck.current = false;
    engine.current?.stopClockCheck();
    setClockCheck(null);
  };

  /* Both marks are always rendered; CSS shows whichever suits the theme.
     Extracted only so the masthead can wrap them in a button without the
     markup appearing twice. */
  const logoMark = (
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
  );

  return (
    <>
    <div className={granted ? 'app app--measuring' : 'app'}>
      <header className="app__masthead">
        {/* Buttons only once there is somewhere to go: on the opening screen
            the mark and the name are just the identity. See goHome(). */}
        {settings.showLogo && (
          granted ? (
            <button className="app__home app__home--mark" onClick={goHome} aria-label="Start screen">
              {logoMark}
            </button>
          ) : (
            logoMark
          )
        )}
        {granted ? (
          <button className="app__home app__wordmark" onClick={goHome} aria-label="Start screen">
            Timegrapher
          </button>
        ) : (
          <span className="app__wordmark">Timegrapher</span>
        )}

        <div className="app__controls">
        <button
          className="icon-button"
          onClick={() => setSessionOpen(true)}
          aria-label={`Inspection — ${current.readings.length} of 6 positions recorded`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M4 5.5h16M4 12h16M4 18.5h16" strokeLinecap="round" />
          </svg>
          {current.readings.length > 0 && (
            <span className="icon-button__badge">{current.readings.length}</span>
          )}
        </button>

        <button
          className="icon-button"
          onClick={openSettings}
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
        current={current}
        saved={saved}
        onChange={updateCurrent}
        onPrint={printCertificate}
        onClear={startNewInspection}
      />


      <SettingsSheet
        open={sheetOpen}
        topic={helpTopic}
        onClose={closeSheet}
        onShowFullGuide={showFullGuide}
        settings={settings}
        onChange={updateSettings}
        movementId={movementId}
        onSelectMovement={selectMovement}
        best={bestSpread}
        onExportDiagnostics={exportDiagnostics}
        diagnosticSamples={diagnosticSamples}
        clock={clock}
        clockSeconds={calibrator.current.elapsedSeconds}
        clockDisturbed={clockDisturbed}
        clockDebug={clockDebug}
        clockCheck={clockCheck}
        onStartClockCheck={startClockCheck}
        onStopClockCheck={stopClockCheck}
        granted={granted}
        onRequestMic={grant}
        busy={busy}
        devices={devices}
        selectedId={selectedId}
        onSelectDevice={setSelectedId}
        sampleRate={sampleRate}
        capturing={capturing}
        onStartCapture={start}
        onStopCapture={stop}
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
            /* An inspection is worked entirely from the wizard, so this panel
               keeps only the microphone. */
            compact={mode === 'inspection'}
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
            clockCheck={clockCheck}
            onHelp={showHelp}
            onResetAverage={resetAverage}
            onSnapshot={saveSnapshot}
            guidance={mode === 'measure'}
            quartz={isQuartz(chosenMovement)}
            /* Only in an inspection: Measure has no set to average, and its
               panel is never idle for long enough to look empty. */
            summary={mode === 'inspection' ? runningSummary(current.readings) : null}
          />

          {snapshotNote && (
            <p className="dim app__note" role="status">{snapshotNote}</p>
          )}

          {mode === 'inspection' && (
            <InspectionWizard
              state={wizard}
              capturing={capturing}
              phase={current.phase}
              settling={settling}
              valid={measurement?.valid ?? false}
              seconds={secondsCaptured}
              countdown={countdown}
              auto={autoCapture}
              onAutoChange={changeAutoCapture}
              onCapture={wizardCapture}
              onSkip={() => setWizard(advance)}
              onNext={() => setWizard(advance)}
              onRetry={() => setWizard(retry)}
              onFinish={() => setWizard(finish)}
              onRestart={restartWizard}
              onOpenSummary={() => setSessionOpen(true)}
              onJump={jumpWizard}
              onHelp={showHelp}
              onStart={start}
              onStop={stop}
              startDisabled={devices.length === 0 || busy}
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
                    : graph === 'beat'
                      ? '35ms'
                      : '1s'}
                </span>
                <button
                  className="panel__help-icon"
                  onClick={() => showHelp(graph)}
                  aria-label={`What is the ${GUIDE[graph].title.toLowerCase()}?`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.2 9a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.6-2.8 2.6" strokeLinecap="round" />
                    <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              </div>
            </div>

            {graph === 'trace' && (
              <TraceCanvas
                beats={beats}
                bph={measurement?.detectedBph ?? 0}
                zoomMs={effectiveZoom}
                rate={measurement?.valid ? measurement.rate : 0}
                windowSeconds={settings.traceSeconds}
                capturing={capturing}
              />
            )}
            {graph === 'beat' && (
              <BeatCanvas
                waveform={beatWaveform}
                liftAngle={chosenMovement?.liftAngle ?? DEFAULT_LIFT_ANGLE}
                capturing={capturing}
              />
            )}
            {graph === 'waveform' && <WaveformCanvas latest={latest} />}
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
      current={current}
      saved={saved}
      liftAngle={findMovement(movementId)?.liftAngle ?? DEFAULT_LIFT_ANGLE}
      deviceLabel={devices.find((d) => d.deviceId === selectedId)?.label ?? null}
      sampleRate={sampleRate}
      showLogo={settings.showLogo}
      quartz={isQuartz(chosenMovement)}
    />
    </>
  );
}
