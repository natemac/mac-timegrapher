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
import { correctedSampleRate } from './audio/clock-calibration';
import { resolveCaptureProfile, constraintsFor, amplitudeCaveat } from './audio/capture-route';
import { runDeviceCheck, type DeviceCheckReport } from './audio/device-check-run';
import { deviceReportText, deviceReportFilename } from './export/device-report';
import { DiagnosticsLog, diagnosticsFilename } from './export/diagnostics';
import { deliverSnapshot } from './export/snapshot';

import { TimegrapherEngine, type Measurement, type Beat, type BeatWaveform, type Calibration } from './timegrapher/tg-engine';
import { StabilityTracker, SETTLED_BOUNDS, type Settling, type Spread } from './timegrapher/stability';
import { resolveZoom, ZOOM_AUTO } from './timegrapher/trace-zoom';
import { findMovement, isQuartz, loadMovementId, saveMovementId } from './timegrapher/movements';
import {
  MANUAL_ID, loadManualMovement, saveManualMovement, movementBadge, resolveMovementConfig,
  type ManualMovement,
} from './timegrapher/movement-choice';
import { pendingResults, type StepId, type StepResult } from './timegrapher/device-check';
import { inspectionNote } from './timegrapher/inspection-note';
import {
  startWizard, resumeWizard, begin, abort, captured, positionAt,
  loadAutoCapture, saveAutoCapture,
  WIZARD_ORDER, COUNTDOWN_SECONDS, type WizardState,
} from './timegrapher/wizard';
import { positionName, type PositionId } from './timegrapher/session';
import {
  createInspection, upsertReading, putInspection,
  loadInspections, saveInspections, loadCurrentId, saveCurrentId,
  type Inspection,
} from './timegrapher/inspections';

import {
  loadSettings, saveSettings, resolveTheme, formatDrift, parseDrift, THEME_COLOUR,
  type Settings,
} from './settings/settings-store';

import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { WelcomeScreen } from './components/WelcomeScreen';
import { InstrumentToolbar } from './components/InstrumentToolbar';
import { ReadoutSurface } from './components/ReadoutSurface';
import { GraphSurface, type Graph } from './components/GraphSurface';
import { InspectionStrip } from './components/InspectionStrip';
import { InspectionSummaryDialog } from './components/InspectionSummaryDialog';
import { SettingsDialog, type SettingsTab } from './components/SettingsDialog';
import { GeneralPanel } from './components/settings/GeneralPanel';
import { DeviceCheckPanel } from './components/settings/DeviceCheckPanel';
import { QuartzPanel } from './components/settings/QuartzPanel';
import { GuidePanel } from './components/settings/GuidePanel';
import { TraceCanvas } from './components/TraceCanvas';
import { BeatCanvas } from './components/BeatCanvas';
import { WaveformCanvas } from './components/WaveformCanvas';
import { useWakeLock } from './hooks/useWakeLock';
import { useInspectionRun } from './hooks/useInspectionRun';

/** Which of the two jobs the operator came here to do. */
type Screen = 'welcome' | 'timing' | 'inspection';

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

/* Read once, before the component, because two pieces of state are built from
   it and they must be built from the same one. */
function openInspection(): Inspection {
  const all = loadInspections();
  const id = loadCurrentId();
  return all.find((i) => i.id === id) ?? createInspection();
}

export default function App() {
  const [currentInspection] = useState(openInspection);
  const [screen, setScreen] = useState<Screen>('welcome');
  const mode = screen === 'inspection' ? 'inspection' : 'measure';

  const [granted, setGranted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<AudioInput[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [signal, setSignal] = useState<SignalState | null>(null);
  const [latest, setLatest] = useState<Float32Array | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [beatWaveform, setBeatWaveform] = useState<BeatWaveform | null>(null);
  const [settling, setSettling] = useState<Settling>('waiting');
  const [spreads, setSpreads] = useState<{ rate: Spread | null; amplitude: Spread | null; beatError: Spread | null }>(
    { rate: null, amplitude: null, beatError: null },
  );
  const [secondsCaptured, setSecondsCaptured] = useState(0);
  const [capturing, setCapturing] = useState(false);

  /* A quartz clock check. Non-null only while one is running or has just
     finished; deliberately not persisted, because the result is a measurement
     of this session's audio path and nothing else. */
  const [clockCheck, setClockCheck] = useState<Calibration | null>(null);
  /* Held in a ref, not state: the engine effect has to read it without being
     re-run by it, or asking for a check would tear down the engine. */
  const wantClockCheck = useRef(false);


  /*
     The device check: one pass down a list, reported as it goes. Its rows are
     held here rather than inside the panel so a check survives the settings
     dialog being closed and reopened — it is the slowest thing in the app and
     losing it to a stray tap would be its own small cruelty.
  */
  const [checkReport, setCheckReport] = useState<DeviceCheckReport | null>(null);
  const [checkResults, setCheckResults] = useState<StepResult[]>(() => pendingResults(false));
  const [checkStep, setCheckStep] = useState<StepId | null>(null);
  const [checkElapsed, setCheckElapsed] = useState(0);
  const [checkRunning, setCheckRunning] = useState(false);
  const [includeMovementCheck, setIncludeMovementCheck] = useState(false);
  const checkAbort = useRef<AbortController | null>(null);

  /* The last few detected beat rates, for judging whether the lock is holding.
     A ref, not state: it feeds a memo read on render, and per-block setState
     would re-render the app on every measurement for no visible gain. */
  const bphHistory = useRef<number[]>([]);

  /* Waveform by default: it shows something the moment audio arrives, so a
     first-time user can tell the sensor is hearing the watch before any reading
     exists. The trace needs beats before it draws anything at all, and opening
     on an empty graph reads as a broken instrument. See GRAPHS for the order. */
  const [graph, setGraph] = useState<Graph>('waveform');

  /* Remembered: a bench usually works through a batch of the same calibre.
     null is automatic detection, MANUAL_ID is both numbers typed in. */
  const [movementId, setMovementId] = useState<string | null>(loadMovementId);
  const [manual, setManual] = useState<ManualMovement>(loadManualMovement);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<SettingsTab>('general');
  const [summaryOpen, setSummaryOpen] = useState(false);

  /*
     Every run ever recorded, held in a ref rather than in state.

     Nothing on screen lists them — the design surfaces only the run in
     progress — but they are still written, so a reload finds the current run
     exactly where it was. Keeping them out of state means adding a reading does
     not re-render the app for a list nobody is looking at.
  */
  const savedRuns = useRef<Inspection[]>(loadInspections());
  const [current, setCurrent] = useState<Inspection>(currentInspection);

  /*
     Seeded from what the record already holds, so the six markers and the
     report cannot disagree — see resumeWizard. A reload mid-run comes back to
     the position it was on rather than to an empty panel over six stored
     readings.
  */
  const [wizard, setWizard] = useState<WizardState>(
    () => resumeWizard(currentInspection.readings.map((r) => r.position)),
  );
  const [autoCapture, setAutoCapture] = useState(loadAutoCapture);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [lastCaptured, setLastCaptured] = useState<PositionId | null>(null);

  /* The correction as typed, held apart from the setting itself: parsing on
     every keystroke would reject a half-written "-" or "1." and write the wrong
     number back. Committed on blur or Enter. */
  const [clockDraft, setClockDraft] = useState(() => formatDrift(settings.clockDriftSecondsPerDay));

  const session = useRef<CaptureSession | null>(null);
  const engine = useRef<TimegrapherEngine | null>(null);
  const meter = useRef(new SignalMeter());
  const stability = useRef(new StabilityTracker());
  // Beats accumulate across calls; the core re-reports overlapping windows,
  // so they are keyed by time to dedupe.
  const beatStore = useRef(new Map<number, Beat>());
  const measurementRef = useRef<Measurement | null>(null);
  /* Guards start/stop against re-entry. A ref rather than `busy` alone because
     setState is asynchronous: two clicks inside one tick would both read the
     old `busy` and both call getUserMedia, leaving the first MediaStream
     unreachable with its tracks still live — the browser's recording indicator
     then stays lit until the tab closes. */
  const inFlight = useRef(false);
  /*
     One owner for the audio input, claimed synchronously.

     Permission, normal capture and the device test each open their own stream.
     Without a single claim, closing the settings and pressing Start during a
     test began a second acquisition of the same microphone — a confounder in
     exactly the measurement being used to diagnose one.
  */
  const audioOwner = useRef<'permission' | 'capture' | 'device check' | null>(null);
  const activeDeviceId = useRef<string | null>(null);
  /*
     Which constraints a capture opens with. Android needs the communication
     route to reach a chosen input at all — Chrome and Firefox both fail without
     it — and everywhere else the direct route is correct and measures
     amplitude. Nothing here is a preference.
  */
  const captureProfile = resolveCaptureProfile(navigator.userAgent);
  /*
     Which start request is still allowed to publish a session. Going home can
     happen while getUserMedia and the audio graph are still being built, and a
     session that lands afterwards must tear itself down rather than becoming
     visible state with the input live.
  */
  const captureAttempt = useRef(0);
  const traceSecondsRef = useRef(settings.traceSeconds);
  /*
    Consecutive settled reports. `settling()` is already conservative, but it is
    evaluated twice a second and a reading can graze the bounds for a single
    report on its way through — an unattended capture must not fire on that.
  */
  const settledRuns = useRef(0);
  const wizardRef = useRef(wizard);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  // A written record of the run, for working out afterwards why a reading
  // behaved the way it did. Nothing leaves the device unless it is exported.
  const diagnostics = useRef(new DiagnosticsLog());
  const signalRef = useRef<SignalState | null>(null);
  const movementLabelRef = useRef<string | null>(null);
  const movementIdRef = useRef<string | null>(null);
  const currentRef = useRef(current);

  // ---------------------------------------------------------------- theme --

  /*
     The theme, applied to the document rather than to a wrapper: the design's
     stylesheet keys off `html[data-theme]`, and the address bar's colour is a
     meta tag that has to move with it.
  */
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = resolveTheme(settings.appearance, media.matches);
      document.documentElement.dataset.theme = theme;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLOUR[theme]);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.appearance]);

  /* The measuring screen is a denser layout than the opening one — a shorter
     masthead, tighter padding — and the design switches between them with a
     class on the body. */
  useEffect(() => {
    document.body.classList.toggle('instrument-page', screen !== 'welcome');
    return () => document.body.classList.remove('instrument-page');
  }, [screen]);

  // ------------------------------------------------------------- storage --

  const selectMovement = useCallback((id: string | null) => {
    setMovementId(id);
    saveMovementId(id);
  }, []);

  const changeManual = useCallback((next: ManualMovement) => {
    setManual(next);
    saveManualMovement(next);
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    traceSecondsRef.current = next.traceSeconds;
    saveSettings(next);
  }, []);

  const changeAutoCapture = useCallback((next: boolean) => {
    setAutoCapture(next);
    saveAutoCapture(next);
  }, []);

  /* One place that writes: the run, its position in the list, and which run is
     open all have to move together or a reload finds them disagreeing. */
  const updateCurrent = useCallback((next: Inspection) => {
    setCurrent(next);
    const merged = putInspection(savedRuns.current, next);
    savedRuns.current = merged;
    saveInspections(merged);
    saveCurrentId(next.id);
  }, []);

  useEffect(() => { traceSecondsRef.current = settings.traceSeconds; }, [settings.traceSeconds]);
  useEffect(() => { wizardRef.current = wizard; }, [wizard]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { stopRef.current = stop; });

  /* The correction can change while the dialog is shut — applied from a fresh
     measurement, or restored from storage — so the field is resynced on open
     rather than only at first mount. */
  useEffect(() => {
    if (!sheetOpen) return;
    setClockDraft(formatDrift(settings.clockDriftSecondsPerDay));
  }, [sheetOpen, settings.clockDriftSecondsPerDay]);

  const applyDrift = useCallback((value: number) => {
    setClockDraft(formatDrift(value));
    setSettings((s) => {
      const next = { ...s, clockDriftSecondsPerDay: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const commitClockDraft = useCallback(() => {
    const parsed = parseDrift(clockDraft);
    if (parsed === null) {
      setClockDraft(formatDrift(settings.clockDriftSecondsPerDay));
      return;
    }
    applyDrift(parsed);
  }, [clockDraft, settings.clockDriftSecondsPerDay, applyDrift]);

  // Asked for rather than assumed. A reading takes twenty to thirty seconds to
  // settle with the operator's hands on a watch, but the battery is theirs.
  useWakeLock(settings.keepAwake);

  /*
     Hold off the browser's pull-to-refresh while a measurement is running. A
     reload is not destructive — recorded readings and the run are in local
     storage — but it cuts the microphone off mid-reading.
  */
  useEffect(() => {
    if (!capturing) return;
    document.documentElement.classList.add('is-measuring');
    return () => document.documentElement.classList.remove('is-measuring');
  }, [capturing]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(id);
  }, [notice]);

  // ------------------------------------------------------------ readings --

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
    distinguish from the movement misbehaving, and it would otherwise sit in the
    window for the next thirty seconds.
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
    setLastCaptured(p);
    setWizard(captured);
  }, [capture]);

  /*
     Count consecutive settled reports. Declared before the effect that reads
     it, because effects run in declaration order and the auto-capture check has
     to see this update's count rather than the previous one's.
  */
  useEffect(() => {
    settledRuns.current = settling === 'settled' ? settledRuns.current + 1 : 0;
  }, [settling, secondsCaptured]);

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
  });

  /* The report opens itself once every position is in. It is the point of the
     run, and the design says so. */
  useEffect(() => {
    if (mode !== 'inspection') return;
    if (wizard.stage !== 'done') return;
    if (wizard.recorded.length < WIZARD_ORDER.length) return;
    setSummaryOpen(true);
  }, [mode, wizard.stage, wizard.recorded.length]);

  const movementConfig = resolveMovementConfig(movementId, manual);

  /*
     The engine is built from the movement, so it is created by an effect rather
     than inside start(): changing the calibre mid-capture has to rebuild it, and
     previously that silently did nothing — the operator picked the right
     calibre, saw amplitude not move, and had no way to know why.

     Runs in a Worker. The analysis sweeps a sixteen-second window through seven
     FFTs, which visibly stutters the UI on the main thread.
  */
  useEffect(() => {
    if (!capturing || sampleRate === null) return;

    /*
       The one place a clock correction has to be applied. The core's arithmetic
       is in samples, so correcting the rate it is told corrects everything
       downstream from it.
    */
    const built = TimegrapherEngine.create({
      sampleRate: correctedSampleRate(sampleRate, settings.clockDriftSecondsPerDay),
      bph: movementConfig.bph,
      liftAngle: movementConfig.liftAngle,
      onMeasurement: (m, seconds, newBeats, shape) => {
        setMeasurement(m);
        setBeatWaveform(shape);
        measurementRef.current = m;
        if (m.valid) {
          const h = bphHistory.current;
          h.push(m.detectedBph);
          if (h.length > 4) h.shift();
        }
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
          floorDb: signalRef.current?.floorDb ?? null,
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
       engine does not exist until this effect runs a render later. */
    if (wantClockCheck.current) built.startClockCheck();

    return () => {
      built.destroy();
      if (engine.current === built) engine.current = null;
      /*
         Only the engine and its stores. This teardown also runs when capture
         merely stops, and clearing the panel here is what wiped the reading the
         operator had stopped in order to read.
      */
      stability.current.reset();
      beatStore.current.clear();
    };
  }, [capturing, sampleRate, movementConfig.bph, movementConfig.liftAngle, settings.clockDriftSecondsPerDay]);

  // ------------------------------------------------------------- devices --

  const secure = window.isSecureContext;
  const supported = typeof AudioWorkletNode !== 'undefined';

  const refreshDevices = useCallback(async () => {
    const found = await listAudioInputs();
    setDevices(found);

    /*
       An input that vanishes mid-capture ends the measurement even if the
       browser keeps handing us a live track: whatever is still arriving is not
       the device that was selected, and carrying on would attribute it to one
       that has been unplugged.
    */
    const active = activeDeviceId.current;
    if (active && !found.some((d) => d.deviceId === active)) {
      activeDeviceId.current = null;
      void stopRef.current?.();
      setError('The selected input was disconnected. Choose an input and start again.');
    }

    /* Only re-resolve when the current choice is actually gone. Re-resolving on
       every device change let an unrelated hot plug silently move the selection
       back to whatever was last saved. */
    setSelectedId((prev) => {
      if (prev && found.some((d) => d.deviceId === prev)) return prev;
      return resolveSelection(loadSelection(), found)?.deviceId ?? null;
    });
  }, []);

  const grant = useCallback(async () => {
    if (audioOwner.current) return;
    audioOwner.current = 'permission';
    setBusy(true);
    setError(null);
    try {
      await requestPermission();
      setGranted(true);
      await refreshDevices();
    } catch (err) {
      setError(describeError(err));
    } finally {
      if (audioOwner.current === 'permission') audioOwner.current = null;
      setBusy(false);
    }
  }, [refreshDevices]);

  useEffect(() => {
    if (!granted) return;
    const onChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [granted, refreshDevices]);

  // Cleanup-only: release a live capture session if App unmounts mid-capture.
  useEffect(() => () => {
    void session.current?.stop().catch(() => {});
  }, []);

  const handleBlock = useCallback((block: Float32Array) => {
    engine.current?.push(block);
    const next = meter.current.push(block, block.length / (session.current?.sampleRate ?? 48000));
    signalRef.current = next;
    setSignal(next);
    setLatest(block);
  }, []);

  /*
     Empty the panel. Stopping no longer does this — the last reading is the one
     you write down, and wiping it at the moment the operator reaches for a pen
     was the wrong instinct. It is cleared when a new capture starts, and when
     something it was computed under changes.
  */
  const clearReading = useCallback(() => {
    setMeasurement(null);
    measurementRef.current = null;
    setSpreads({ rate: null, amplitude: null, beatError: null });
    setSettling('waiting');
    setSecondsCaptured(0);
    setBeats([]);
    setBeatWaveform(null);
    setSignal(null);
    setLatest(null);
    beatStore.current.clear();
    stability.current.reset();
    meter.current.reset();
    bphHistory.current = [];
  }, []);

  /*
     A retained reading is only good for the watch and the correction it was
     taken under. Amplitude is computed from the calibre's lift angle and every
     rate is scaled by the clock correction, so changing either leaves figures on
     screen that describe something else — and unlike a stopped capture, nothing
     about the screen would say so.
  */
  const readingBasis = useRef({
    liftAngle: movementConfig.liftAngle,
    bph: movementConfig.bph,
    drift: settings.clockDriftSecondsPerDay,
  });
  useEffect(() => {
    const b = readingBasis.current;
    if (b.liftAngle === movementConfig.liftAngle
      && b.bph === movementConfig.bph
      && b.drift === settings.clockDriftSecondsPerDay) return;
    readingBasis.current = {
      liftAngle: movementConfig.liftAngle,
      bph: movementConfig.bph,
      drift: settings.clockDriftSecondsPerDay,
    };
    clearReading();
  }, [movementConfig.liftAngle, movementConfig.bph, settings.clockDriftSecondsPerDay, clearReading]);

  const releaseCaptureState = useCallback(() => {
    // A position interrupted before it recorded has nothing to keep, so the run
    // returns to the same prompt rather than advancing past it.
    setWizard(abort);
    session.current = null;
    activeDeviceId.current = null;
    if (audioOwner.current === 'capture') audioOwner.current = null;
    setCapturing(false);
    /*
       What is on screen stays there. A reading is taken in order to be read, and
       stopping is how you stop it moving so you can. The internal stores are
       reset rather than the displays, so the next run starts clean while the
       last one stays legible.
    */
    stability.current.reset();
    beatStore.current.clear();
    meter.current.reset();
    bphHistory.current = [];
    setSampleRate(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    setError(
      'The audio input was disconnected. Reconnect it, or choose another '
      + 'input, then press Start again.',
    );
    // The track has already ended, but the AudioContext and the graph built on
    // it have not: run the same teardown a deliberate stop would.
    void session.current?.stop().catch(() => {});
    releaseCaptureState();
  }, [releaseCaptureState]);

  const start = async () => {
    if (!selectedId || inFlight.current) return;
    /*
       Something else has the input — a permission prompt, or a device check
       still unwinding after being cancelled. This used to return in silence,
       so pressing Start during the few hundred milliseconds a cancelled check
       takes to release the microphone did nothing at all, with nothing on
       screen to say why.
    */
    if (audioOwner.current) {
      setError(audioOwner.current === 'device check'
        ? 'The device check is still releasing the microphone. Try again in a moment.'
        : 'The microphone is busy. Try again in a moment.');
      return;
    }
    const attempt = ++captureAttempt.current;
    inFlight.current = true;
    audioOwner.current = 'capture';
    setBusy(true);
    setError(null);
    // The previous run's figures must not sit under a live capture that has not
    // produced any of its own yet.
    clearReading();
    try {
      const s = await startCapture(
        selectedId,
        handleBlock,
        handleDisconnect,
        constraintsFor(captureProfile, selectedId),
        // Echo cancellation under this profile was asked for deliberately, so it
        // is reported as intentional rather than as the browser overriding us.
        captureProfile === 'ec-only' ? ['echoCancellation'] : [],
      );
      activeDeviceId.current = selectedId;
      if (attempt !== captureAttempt.current) {
        // Home was pressed while the browser was opening the input. This session
        // was never published, so nothing else will release it.
        await s.stop().catch(() => {});
        return;
      }
      session.current = s;

      // The rate the device actually granted, not the one requested. The core's
      // period arithmetic is in samples, so a wrong figure here would scale
      // every reading.
      setSampleRate(s.sampleRate);
      setCapturing(true);
      saveSelection(selectedId);

      diagnostics.current.reset();
      diagnostics.current.setContext({
        device: devices.find((d) => d.deviceId === selectedId)?.label ?? null,
        sampleRate: s.sampleRate,
        requestedSampleRate: s.requestedSampleRate ?? null,
        processing: s.warnings.map((w) => `${w.setting}: ${w.state}`),
        captureProfile,
        movement: movementLabelRef.current,
        liftAngle: movementConfig.liftAngle,
        bph: movementConfig.bph,
        quartz: isQuartz(findMovement(movementId)),
        mode,
        settledBounds: SETTLED_BOUNDS,
        clockDriftSecondsPerDay: settings.clockDriftSecondsPerDay,
        trackSettings: s.settings as Record<string, unknown>,
        trackCapabilities: s.capabilities as Record<string, unknown> | null,
        requestedDeviceId: selectedId,
        availableInputs: devices,
      });
      diagnostics.current.event('start', `${s.sampleRate} Hz`);

      // In an inspection this is the only trigger there is: it opens the device
      // and starts the position's grace in one press.
      if (mode === 'inspection') {
        setCountdown(COUNTDOWN_SECONDS);
        setWizard(begin);
      }
    } catch (err) {
      // A cancelled request belongs to the screen that was left behind.
      if (attempt === captureAttempt.current) setError(describeError(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
      /*
         A start that never produced a session must not leave the input marked as
         owned. The owner is normally released by releaseCaptureState, which only
         runs once there is something to release — so a throw here held the claim
         for the life of the page and every later press returned at the guard in
         silence, with nothing on screen to say why.
      */
      if (!session.current && audioOwner.current === 'capture') {
        audioOwner.current = null;
        activeDeviceId.current = null;
      }
    }
  };

  const stop = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await session.current?.stop();
    } catch (err) {
      // ctx.close() can reject. Without this the state below never ran, so the
      // button stayed on Pause and the dropdown stayed disabled.
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

     Installed to the home screen the app has no browser chrome — no address bar,
     no reload, no pull-to-refresh — so once you are past the opening screen
     there is otherwise no route back to it. The mark and the back control are
     the way, because that is where a person looks for it.

     The capture is stopped first. Leaving the microphone open behind a screen
     that shows no meter and no readings is how a device ends up held with its
     input live and nothing on screen saying so. Permission is not given back:
     it was granted to this page, not to this screen.
  */
  const goHome = async () => {
    captureAttempt.current += 1;
    if (capturing || session.current) await stop();
    setScreen('welcome');
    setError(null);
  };

  const enter = (next: Exclude<Screen, 'welcome'>) => {
    setScreen(next);
    setError(null);
    if (next === 'inspection') {
      settledRuns.current = 0;
      /* Resumed, not restarted. Returning to the opening screen and coming back
         used to reset the markers while leaving the readings on the record, so
         the next watch's positions landed among the last one's. */
      setWizard(resumeWizard(currentRef.current.readings.map((r) => r.position)));
      setLastCaptured(null);
    }
  };

  /*
     Clear the record and start the next watch.

     The technician and the calibre carry over, because the next watch is
     usually measured by the same person on the same bench. The reference does
     not: it is what identifies the watch, and inheriting it would silently
     label the new readings with the old watch's name.
  */
  const startNewInspection = useCallback(() => {
    const next = createInspection({
      phase: 'pre',
      technician: currentRef.current.technician,
      movementId: movementIdRef.current,
      movementName: movementLabelRef.current,
    });
    updateCurrent(next);
    settledRuns.current = 0;
    setWizard(startWizard());
    setLastCaptured(null);
    setSummaryOpen(false);
  }, [updateCurrent]);

  // --------------------------------------------------------- diagnostics --

  /*
     The quartz clock check. It needs a live capture with the reference watch on
     the sensor, so it starts one if there is not already one running.
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

  /*
     The device check. It drives the microphone directly, so it refuses while a
     capture is running or still opening — two acquisitions of one input is a
     confounder in exactly the measurement being diagnosed.
  */
  const startDeviceCheck = async () => {
    if (!selectedId || inFlight.current || audioOwner.current || checkRunning) return;
    const abort = new AbortController();
    checkAbort.current = abort;
    audioOwner.current = 'device check';
    setError(null);
    setCheckReport(null);
    setCheckResults(pendingResults(includeMovementCheck));
    setCheckElapsed(0);
    setCheckRunning(true);
    try {
      const report = await runDeviceCheck({
        deviceId: selectedId,
        profile: captureProfile,
        includeMovement: includeMovementCheck,
        movement: {
          name: movementLabelRef.current,
          bph: movementConfig.detected ? 0 : movementConfig.bph,
          liftAngle: movementConfig.liftAngle,
        },
        clockDriftSecondsPerDay: settings.clockDriftSecondsPerDay,
        onProgress: (p) => {
          setCheckStep(p.running);
          setCheckResults(p.results);
          setCheckElapsed(p.elapsedSeconds);
        },
        signal: abort.signal,
      });
      setCheckReport(report);
      setCheckResults(report.results);
    } catch (err) {
      setError(describeError(err));
    } finally {
      if (checkAbort.current === abort) checkAbort.current = null;
      if (audioOwner.current === 'device check') audioOwner.current = null;
      setCheckRunning(false);
      setCheckStep(null);
    }
  };

  const cancelDeviceCheck = useCallback(() => {
    checkAbort.current?.abort();
  }, []);

  const handOver = useCallback(async (text: string, name: string, what: string) => {
    try {
      const file = new File([text], name, { type: 'text/plain' });
      const outcome = await deliverSnapshot(file);
      setNotice(outcome === 'shared' ? `${what} shared.` : `Saved as ${name}`);
    } catch (err) {
      // Dismissing the share sheet rejects with AbortError. That is the operator
      // changing their mind, not a failure to report.
      if (err instanceof Error && err.name === 'AbortError') return;
      setNotice(`Could not save the ${what.toLowerCase()}.`);
    }
  }, []);

  const exportDiagnostics = useCallback(
    () => void handOver(diagnostics.current.toText(), diagnosticsFilename(new Date()), 'Diagnostics'),
    [handOver],
  );

  const exportDeviceCheck = useCallback(() => {
    if (!checkReport) return;
    void handOver(deviceReportText(checkReport), deviceReportFilename(new Date()), 'Device check');
  }, [checkReport, handOver]);

  // ------------------------------------------------------------- derived --

  const chosenMovement = findMovement(movementId);
  movementLabelRef.current = movementId === MANUAL_ID
    ? 'Manual'
    : chosenMovement ? `${chosenMovement.maker} ${chosenMovement.name}` : null;
  movementIdRef.current = movementId;

  const badge = movementBadge(movementId, manual);

  // Auto magnification follows the reading, so it is resolved here rather than
  // inside the canvas — the toolbar has to show the figure actually in use.
  const effectiveZoom = resolveZoom(
    settings.zoomMs,
    measurement?.valid ? measurement.rate : 0,
    settings.traceSeconds,
  );

  const graphScale = graph === 'trace'
    ? `${settings.zoomMs === ZOOM_AUTO ? 'Auto' : `${effectiveZoom}ms`} · ${settings.traceSeconds}s`
    : graph === 'beat' ? '35 ms' : '1 s';

  const graphAxis = graph === 'trace'
    ? { start: `−${settings.traceSeconds} s`, end: 'Now' }
    : graph === 'beat' ? { start: '0 ms', end: '35 ms' }
      : { start: '−1 s', end: 'Now' };

  const graphEmpty = !capturing && (
    graph === 'trace' ? beats.length === 0
      : graph === 'beat' ? beatWaveform === null
        : latest === null
  );

  const settled = settling === 'settled';
  const canCapture = capturing
    && wizard.stage === 'measuring'
    && settled
    && (measurement?.valid ?? false);

  const positions = WIZARD_ORDER.map((id) => ({
    name: positionName(id),
    captured: wizard.recorded.includes(id),
  }));

  const note = inspectionNote({
    stage: wizard.stage,
    countdown,
    capturing,
    settled,
    currentName: positionAt(wizard.step) ? positionName(positionAt(wizard.step)!) : null,
    lastCapturedName: lastCaptured ? positionName(lastCaptured) : null,
    recorded: wizard.recorded.length,
    total: WIZARD_ORDER.length,
  });

  const openSettings = (tab: SettingsTab = 'general') => {
    setSheetTab(tab);
    setSheetOpen(true);
  };

  /*
     Every position measured, so there is nothing left to start. The transport
     becomes the way to clear the run and take the next watch — the operator is
     already looking at that button, and a second control elsewhere for the
     thing they now want is one they have to go and find.
  */
  const runComplete = screen === 'inspection'
    && wizard.stage === 'done'
    && wizard.recorded.length >= WIZARD_ORDER.length;

  const toolbar = (
    <InstrumentToolbar
      granted={granted}
      busy={busy}
      devices={devices}
      selectedId={selectedId}
      onSelectDevice={setSelectedId}
      onRequestMic={grant}
      running={capturing}
      onStart={() => void start()}
      onStop={() => void stop()}
      clearing={runComplete}
      onClear={startNewInspection}
      transportDisabled={!selectedId || busy}
      movementName={badge.name}
      movementMeta={badge.meta}
      onOpenMovement={() => openSettings('general')}
    />
  );

  const blocked = !secure
    ? 'This page is not on a secure connection, so the browser will not grant microphone access. Open it over HTTPS.'
    : !supported
      ? 'This browser does not support AudioWorklet. Use a current version of Chrome, Edge, Firefox or Safari.'
      : null;

  return (
    <>
      <AppHeader
        showLogo={settings.showLogo}
        onHome={() => void goHome()}
        onOpenSettings={() => openSettings('general')}
      />

      <main>
        {screen === 'welcome' ? (
          <WelcomeScreen
            onLiveTiming={() => enter('timing')}
            onInspection={() => enter('inspection')}
          />
        ) : (
          <section className="instrument-workspace" id="measurement">
            <div className="instrument-heading">
              <button className="back" onClick={() => void goHome()} aria-label="Back to welcome">
                ‹ <span id="instrumentMode">{screen === 'inspection' ? 'INSPECTION' : 'LIVE TIMING'}</span>
              </button>
              {screen === 'inspection' && (
                <button
                  id="inspectionSummaryButton"
                  className="plain-control"
                  onClick={() => setSummaryOpen(true)}
                  aria-label={`Inspection summary, ${wizard.recorded.length} of ${WIZARD_ORDER.length} positions captured`}
                  title="Inspection summary"
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="5" y="3" width="14" height="18" rx="3" />
                    <path d="M9 8h6M9 12h6M9 16h3" />
                  </svg>
                </button>
              )}
            </div>

            {/* One toolbar, two homes: on its own in Live Timing, and inside
                the wizard during an inspection so the run is worked from one
                panel. */}
            {screen === 'inspection' ? (
              <InspectionStrip
                positions={positions}
                step={Math.min(wizard.step, WIZARD_ORDER.length - 1)}
                note={note}
                auto={autoCapture}
                onAutoChange={changeAutoCapture}
                canCapture={canCapture}
                onCapture={wizardCapture}
              >
                {toolbar}
              </InspectionStrip>
            ) : toolbar}

            <ReadoutSurface
              measurement={measurement}
              capturing={capturing}
              secondsCaptured={secondsCaptured}
              settling={settling}
              spreads={spreads}
              signal={signal}
              /*
                 Shown everywhere, warned about only where the fault was
                 measured: Chrome for Android on the communication route.
                 Firefox on the same handset and the same pickup is clean, and
                 its readings should not carry another browser's warning.
              */
              amplitudeCaveat={amplitudeCaveat(captureProfile, navigator.userAgent)}
              onReset={resetAverage}
            />

            <GraphSurface
              graph={graph}
              onChange={setGraph}
              scale={graphScale}
              axis={graphAxis}
              empty={graphEmpty}
            >
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
                  liftAngle={movementConfig.liftAngle}
                  capturing={capturing}
                />
              )}
              {graph === 'waveform' && <WaveformCanvas latest={latest} />}
            </GraphSurface>

            {(blocked || error || notice) && (
              <p
                className="instrument-notice"
                id="instrumentNotice"
                role="status"
                data-tone={blocked || error ? 'bad' : undefined}
              >
                {blocked ?? error ?? notice}
              </p>
            )}
          </section>
        )}
      </main>

      <AppFooter />

      <SettingsDialog
        open={sheetOpen}
        /* A check holds the microphone, so closing the dialog it lives in has
           to stop it rather than leave it running behind a screen that shows
           nothing about it. */
        onClose={() => { cancelDeviceCheck(); setSheetOpen(false); }}
        initialTab={sheetTab}
        panel={(tab) => (
          tab === 'general' ? (
            <GeneralPanel
              settings={settings}
              onChange={updateSettings}
              movementId={movementId}
              onSelectMovement={selectMovement}
              manual={manual}
              onManualChange={changeManual}
              onExportDiagnostics={exportDiagnostics}
              status={notice}
            />
          ) : tab === 'device' ? (
            <DeviceCheckPanel
              granted={granted}
              busy={busy}
              devices={devices}
              selectedId={selectedId}
              onSelectDevice={setSelectedId}
              onRequestMic={grant}
              capturing={capturing}
              running={checkRunning}
              activeStep={checkStep}
              results={checkResults}
              elapsedSeconds={checkElapsed}
              includeMovement={includeMovementCheck}
              onIncludeMovement={setIncludeMovementCheck}
              onRun={() => void startDeviceCheck()}
              onCancel={cancelDeviceCheck}
              onExport={exportDeviceCheck}
              canExport={checkReport !== null}
              finished={checkReport !== null}
              hint={error}
            />
          ) : tab === 'quartz' ? (
            <QuartzPanel
              granted={granted}
              busy={busy}
              devices={devices}
              selectedId={selectedId}
              onSelectDevice={setSelectedId}
              onRequestMic={grant}
              hint={error}
              check={clockCheck}
              onStart={() => void startClockCheck()}
              onStop={stopClockCheck}
              onUse={(v) => { applyDrift(v); stopClockCheck(); }}
              draft={clockDraft}
              onDraftChange={setClockDraft}
              onDraftCommit={commitClockDraft}
            />
          ) : <GuidePanel />
        )}
      />

      <InspectionSummaryDialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        inspection={current}
        onChange={updateCurrent}
        showLogo={settings.showLogo}
        movementName={movementLabelRef.current}
        liftAngle={movementConfig.liftAngle}
        deviceLabel={devices.find((d) => d.deviceId === selectedId)?.label ?? null}
        sampleRate={sampleRate}
      />
    </>
  );
}
