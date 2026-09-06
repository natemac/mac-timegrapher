/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import type { ReactNode } from 'react';

/*
   Every explanation the app gives, in one place.

   The words are the v36 design's, with one class of exception: the design was
   written against a prototype with no measurement engine, and said so in
   several places — "integration is still pending", "Run Calibration does not
   generate a result", "escapement, beat lock and analysis lock are awaiting the
   timing engine". Those sentences describe a build nobody will ever run and are
   rewritten to describe this one. Everything else is left exactly as approved.
   See docs/updateui.md, C2.

   Nothing here grades a watch. The figures a movement should hold are its
   manufacturer's business and a shop's own, and a public tool asserting a pass
   mark would be making a claim it cannot support.
*/

export interface GuideTopic {
  id: string;
  summary: string;
  body: ReactNode;
}

export const GUIDE: GuideTopic[] = [
  {
    id: 'modes',
    summary: 'Live Timing or Inspection?',
    body: (
      <>
        <p>
          <strong>Live Timing</strong> gives you a continuously updating reading
          while you check or adjust a watch.
        </p>
        <p>
          <strong>Inspection</strong> guides you through six positions and
          produces a report you can print or hand over.
        </p>
      </>
    ),
  },
  {
    id: 'input',
    summary: 'Audio input',
    body: (
      <>
        <p>
          Device Check and Quartz Calibration use the same audio input selection
          as the measuring screen. If access has not been granted, press{' '}
          <strong>Grant Permission</strong> and allow microphone access in your
          browser. The input dropdown appears once permission is granted.
        </p>
        <p>
          Choose the microphone or pickup you will use for timing. If access is
          denied, allow it in your browser settings and try again.
        </p>
        <p>
          Granting permission does not start a check or calibration. A contact
          sensor usually gives a clearer watch signal than a microphone that also
          hears the room.
        </p>
      </>
    ),
  },
  {
    id: 'measurement',
    summary: 'The four readings',
    body: (
      <>
        <p>
          <strong>Rate · seconds per day</strong>
          <br />
          How much time the watch is gaining or losing. Positive is fast;
          negative is slow. Around ±10 s/day can be a useful general reference,
          but judge the result against the movement’s specification. A single
          reading between −4 and +6 s/day does not establish chronometer
          certification.
        </p>
        <p>
          <strong>Amplitude · degrees</strong>
          <br />
          An estimate of how far the balance wheel swings. It depends on the
          correct lift angle, winding state, position, and movement design. About
          270–310° can be typical for some fully wound movements lying flat; a
          reading below 250° alone does not diagnose a fault. Amplitude commonly
          drops upright and as the watch unwinds.
        </p>
        <p>
          <strong>Beat error · milliseconds</strong>
          <br />
          The difference between alternating tick and tock intervals. Under
          0.5 ms is a useful general goal; under 0.3 ms is better, subject to the
          movement’s specification. Beat error is adjusted separately from rate.
        </p>
        <p>
          <strong>Beat rate · beats per hour</strong>
          <br />
          The movement’s intended ticking frequency. Common values include 21,600
          and 28,800 bph. An unexpected detected value can mean a weak signal,
          background noise, or an incorrect setting.
        </p>
        <p>
          <strong>The small ± value</strong>
          <br />
          How much a reading is varying. A wide spread means you should wait for
          it to settle before recording.
        </p>
      </>
    ),
  },
  {
    id: 'settling',
    summary: 'Settling',
    body: (
      <>
        <p>
          Wait for <strong>LOCKED</strong> before recording a reading. The
          indicator reflects stability, not proof of absolute accuracy — locked
          means the reading is holding within a small range of natural variation,
          not that it has stopped changing entirely.
        </p>
        <p>
          If readings will not settle, check the watch’s contact with the sensor
          and reduce background noise. If the signal is clean and the reading
          still varies, the movement may need further investigation.
        </p>
      </>
    ),
  },
  {
    id: 'signal',
    summary: 'Signal',
    body: (
      <>
        <p>
          A Good or Excellent signal makes analysis easier, but does not by itself
          guarantee accurate readings. With Weak or Fair signal, improve contact
          or move somewhere quieter.
        </p>
        <p>
          Too loud means the signal may be clipping. Amplitude depends on the
          shape of a tick, so clean audio matters more than sheer volume.
        </p>
        <p>
          Reduce input gain if your device provides that control. Otherwise,
          adjust the sensor’s placement or coupling and run the check again.
        </p>
      </>
    ),
  },
  {
    id: 'trace',
    summary: 'Trace',
    body: (
      <>
        <p>
          The scrolling trace separates tick and tock. Straight lines indicate
          little rate deviation; a slope shows gain or loss. Greater slope means a
          larger deviation, and separation between the lines reflects beat error.
        </p>
        <p>
          A fuzzy or scattered trace can come from poor contact, noise, or
          irregular running. Check the signal before drawing conclusions about the
          movement.
        </p>
        <p>
          The trace can reveal changes before the numerical reading settles. Lines
          may wrap from one edge to the other. If they wrap too quickly, choose a
          wider time scale in Settings.
        </p>
      </>
    ),
  },
  {
    id: 'beat',
    summary: 'Beat',
    body: (
      <>
        <p>
          The Beat view magnifies individual tick and tock sounds. Look for a
          repeatable pattern and compare the two.
        </p>
        <p>
          Weak, smeared, or extra peaks can come from the pickup, audio
          processing, noise, or the movement. A waveform alone cannot identify a
          worn or dirty part.
        </p>
        <p>
          The amplitude marker identifies the timing interval used to calculate
          amplitude. The lift angle must be correct for that result to be
          meaningful.
        </p>
      </>
    ),
  },
  {
    id: 'waveform',
    summary: 'Waveform',
    body: (
      <>
        <p>
          The waveform shows the raw sound and helps confirm the sensor is hearing
          the watch. Look for repeating tick events with quieter gaps between
          them.
        </p>
        <p>
          Continuous fuzz without a clear pattern usually calls for better sensor
          contact or a quieter environment. Check those before suspecting the
          watch.
        </p>
      </>
    ),
  },
  {
    id: 'inspection',
    summary: 'Running an inspection',
    body: (
      <>
        <p>
          Comparing six positions shows how the watch behaves as its orientation
          changes. Position-dependent differences can help guide investigation,
          but do not alone prove a mechanical fault.
        </p>
        <p>
          Place the watch in the position shown and press Start. A three-second
          countdown gives you time to let go. The app listens, waits for a settled
          reading, and records it.
        </p>
        <p>
          With Auto capture enabled, repeat: position the watch, press Start, and
          wait. With Auto capture off, choose when to record each reading. A
          position that will not settle cannot be captured — improve the contact
          or the surroundings and press Start again.
        </p>
      </>
    ),
  },
  {
    id: 'android-usb',
    summary: 'USB pickups on Android',
    body: (
      <>
        <p>
          Browser and Android audio routing can affect which input is used and
          which processing is applied. Check the selected input and the reported
          echo cancellation, automatic gain control, and noise suppression
          settings.
        </p>
        <p>
          Processing can alter tick shape and make amplitude less dependable. Do
          not assume rate or beat error are immune to a poor signal. If processing
          cannot be disabled, compare another browser or input and review Device
          Check.
        </p>
        <p>
          A setting reported as Unknown means the browser did not expose its
          state; it does not mean processing is off.
        </p>
      </>
    ),
  },
  {
    id: 'setting-movement',
    summary: 'Movement settings',
    body: (
      <>
        <p>
          In <strong>Settings → Movement</strong>, choose a preset to load its
          beat rate and lift angle. The list is grouped by manufacturer. The
          default is <strong>Seiko / TMI NH35 · 21,600 bph · 53°</strong>.
        </p>
        <p>
          <strong>Auto</strong> leaves beat-rate detection to the timing engine.
          You still enter the lift angle; it cannot be inferred from the audio.
        </p>
        <p>
          <strong>Manual</strong> reveals Beat Rate in beats per hour and Lift
          Angle in degrees. Enter both values. The subtext beneath Movement shows
          the active configuration; with Auto, it shows that the beat rate is
          awaiting a signal.
        </p>
        <p>
          The lift angle must match the movement for amplitude to be meaningful.
          Preset and manual settings are saved on this device and are applied to
          the measurement as soon as they change.
        </p>
      </>
    ),
  },
  {
    id: 'setting-magnification',
    summary: 'Trace magnification',
    body: (
      <>
        <p>
          In <strong>Settings → Trace</strong>, choose{' '}
          <strong>Auto, 5ms, 10ms, 20ms, 50ms, or 100ms</strong>. The default is
          Auto.
        </p>
        <p>
          Smaller values show a narrower timing range and magnify differences
          more. Choose a larger value if the trace wraps too quickly. This
          preference is saved on this device.
        </p>
      </>
    ),
  },
  {
    id: 'setting-history',
    summary: 'Trace history',
    body: (
      <>
        <p>
          In <strong>Settings → Trace</strong>, select{' '}
          <strong>15s, 30s, or 60s</strong>. The default is 30s.
        </p>
        <p>
          A longer window keeps more of the recent trend visible. A shorter window
          focuses on recent changes. This is a display preference, not a change to
          measurement accuracy.
        </p>
      </>
    ),
  },
  {
    id: 'setting-general',
    summary: 'Appearance, screen and branding',
    body: (
      <>
        <p><strong>Settings → General</strong> contains three preferences.</p>
        <p>
          <strong>Appearance</strong> offers Light, Dark, and System. System is
          the default and follows your device’s light or dark appearance.
        </p>
        <p>
          <strong>Keep Screen Awake</strong> is off by default. Turn it on to
          request that the screen stay awake while the app is visible.
          Availability depends on your browser and device; this does not let
          calibration run in the background.
        </p>
        <p>
          <strong>Show Brand Logo</strong> is off by default. Turn it on to show
          the MAC logo in the header.
        </p>
        <p>
          These preferences are saved in this browser on this device. They do not
          sync between devices.
        </p>
      </>
    ),
  },
  {
    id: 'setting-diagnostics',
    summary: 'Session diagnostics',
    body: (
      <>
        <p>
          <strong>Settings → Session Diagnostics → Export</strong> downloads a
          text log of the current session: the settings and movement
          configuration in force, basic browser and audio-device information, and
          every reading the analysis produced while it was running.
        </p>
        <p>
          <strong>Device Check → Export</strong> downloads the latest check’s
          results and observed audio metrics. It becomes available after a check
          finishes, fails, or is cancelled.
        </p>
        <p>
          Only needed to assist Developer. Neither export includes an audio
          recording or sends the file automatically. Review the contents before
          sharing.
        </p>
      </>
    ),
  },
  {
    id: 'setting-clock',
    summary: 'Quartz calibration',
    body: (
      <>
        <p>
          Open <strong>Quartz Calibration</strong>, grant microphone permission if
          needed, and choose your input.
        </p>
        <p>
          The preparation reminders are static checkmarks; there is nothing to
          tick off. Use an analogue quartz watch with a ticking seconds hand, such
          as the recommended Casio MQ24. Place it against the sensor bar on a
          rigid surface and keep everything still for about 15 minutes. Keep the
          app in front and the screen awake.
        </p>
        <p>
          <strong>Run Calibration</strong> opens the input and counts ticks up to{' '}
          <strong>900 beats</strong>. When it finishes it reports what your device
          measures against the reference; press <strong>Use this correction</strong>{' '}
          to apply it. Nothing is applied until you do.
        </p>
        <p>
          <strong>Correction</strong> is expressed in seconds per day and starts
          at +0.00. The field also accepts a correction measured elsewhere and
          saves it on this device.
        </p>
        <p>
          Calibration compares the audio clock with the watch and attributes the
          entire difference to the audio clock. It is only as accurate as the
          reference watch. Recheck your correction when changing the audio device
          or recording setup.
        </p>
      </>
    ),
  },
  {
    id: 'setting-device',
    summary: 'Device Check',
    body: (
      <>
        <p>
          Open <strong>Device Check</strong>, press Grant Permission if shown,
          choose your input, then press <strong>Run Check</strong>. It works down
          the list one item at a time, highlighting whichever it is on. About ten
          seconds, or half a minute with the movement checks. Run Check becomes
          Cancel while it runs, and closing Settings stops it.
        </p>
        <p>
          <strong>Device</strong> covers browser support, microphone access, the
          input the browser actually opened, the audio stream, the sample rate,
          the three processing settings, and audio timing. Audio timing listens
          for ten seconds and reports whether frames are keeping pace; it does
          not calibrate the clock’s accuracy — that is what Quartz Calibration is
          for.
        </p>
        <p>
          <strong>Signal</strong> covers the input level, the headroom, and the
          frequency range. The last of those is worth knowing about: a microphone
          reached over Bluetooth is a voice channel, cut off below where a tick
          lives. It looks perfectly healthy on a level meter and can never
          produce a reading.
        </p>
        <p>
          <strong>Movement</strong> is optional and off by default. Put the
          movement on the sensor first, then tick it: the check listens for
          fifteen seconds more and reports tick energy, beat lock and whether the
          analysis produced a usable reading. Leave it unticked to check the
          device alone — the movement steps are then marked Skipped rather than
          failed, because a missing watch says nothing about the device.
        </p>
        <p>
          Read the result beside each item. <strong>OK</strong> passed;{' '}
          <strong>Review</strong> or <strong>Issue</strong> needs attention;{' '}
          <strong>Unknown</strong> means the browser did not report the
          information, which is not the same as it being off;{' '}
          <strong>Skipped</strong> means the check never reached it.
        </p>
        <p>
          Use <strong>Export</strong> only when needed to assist the developer.
          It contains the results, the spectrum, the audio-clock figures and
          everything the browser reported about the track. No audio recording,
          and nothing is sent anywhere.
        </p>
      </>
    ),
  },
];
