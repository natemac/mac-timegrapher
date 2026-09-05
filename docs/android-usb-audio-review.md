# Android USB microphone routing: review and coding-agent handoff

Reviewed September 5, 2026. Copy revision: `5942886991f59c3f5bf3683c66efff900fd6b993`.

**Most likely cause:** normal capture disables all audio processing, which can bypass the Android Chromium communication route needed to reach the selected USB input. The dropdown can correctly enumerate USB hardware without that hardware supplying the captured samples. The app already has an echo-cancellation-only experiment, but does not apply it to normal measurement.

This is a source-supported diagnosis, **not a confirmed result from either Pixel**. No Pixel, USB adapter, browser-version information, or device recordings were available during this review. The physical A/B test below is needed before shipping a workaround. Only this handoff document was added; application code was not changed or deployed.

## 1. Evidence in this copy

Paths below are repository-relative so this document can travel to the working checkout. Line numbers refer to the reviewed revision.

| Location | Finding |
| --- | --- |
| `web/src/audio/audio-engine.ts:53–63` | Normal constraints contain `deviceId: { exact: deviceId }`, `echoCancellation: false`, `autoGainControl: false`, `noiseSuppression: false`, and `channelCount: 1`. |
| `web/src/App.tsx:779–786` | Start passes `selectedId` to `startCapture`. It does not select an Android compatibility profile. |
| `web/src/audio/audio-engine.ts:104–115` | Opens that request and records the returned settings, but does not reject an explicit returned-device mismatch. |
| `web/src/audio/device-manager.ts:24–28` | The permission-only stream is stopped. It is not deliberately kept alive as the waveform source. |
| `web/src/components/DeviceSelector.tsx:82–95` | The select uses device IDs and is disabled during capture. The ordinary select → Start path is wired correctly. |
| `web/src/audio/device-test.ts:50–64` | `ec-only` already requests the same exact device with only echo cancellation enabled. |
| `web/src/audio/device-test.ts:175–191, 255–264` | Level/spectrum tests open a separate analyser graph; beat-lock tests use the production `startCapture` graph. They are not the same acquisition path in every test phase. |

The waveform consumes the stream returned by `getUserMedia`; changing the waveform renderer, WASM beat analysis, or gain cannot select a different physical microphone upstream.

## 2. Why the Android explanation fits

Chromium's Android audio manager contains two relevant mechanisms:

- Its communication-device branch selects an input/output pair. Enumeration can expose synthetic devices, and an output-only communication device can be associated with another available input.
- `MakeAudioInputStream` avoids entering communication mode when the platform effects mask is `NO_EFFECTS`. Separate per-stream AAudio device selection is feature-dependent.

Consequently, recognizing a USB entry and routing raw capture to its microphone are different operations. This makes the app's all-processing-off request a strong suspect. Enabling echo cancellation is a reasonable experiment to change the capture path, not a universal guarantee for every Android release/browser. The inspected upstream source is not proof of which backend the installed Pixel browsers use. See [Chromium's Android audio manager](https://raw.githubusercontent.com/chromium/chromium/main/media/audio/android/audio_manager_android.cc), especially `GetAudioInputDeviceNames`, `MakeAudioInputStream`, and `MakeLowLatencyInputStream`.

Apple and desktop success is consistent with a platform-specific routing issue; it does not establish Android's route. Record the exact browsers tested. Several browser brands may share Chromium, while Firefox requires separate investigation if it reproduces the issue.

The exact device constraint is already the correct web request. The W3C constraint model makes `exact` required for supported constraints; weakening it to `ideal` or removing it would allow more fallback, not enforce USB capture. Keep unsupported constraints and missing settings distinguishable from successfully verified settings. See [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/).

## 3. The decisive test: identify the physical source before measuring a watch

First record phone model, Android version, browser name/full version, app build stamp, USB pickup/interface model, adapter/hub model, and whether this is an installed PWA or a browser tab. Use the same USB hardware for an Apple/desktop control. Check that the test build actually loaded; this app supports offline caching.

Close other microphone-using apps and browser tabs, stop normal capture, disconnect Bluetooth, and connect USB before opening the test. If Developer options are enabled, ensure **Disable USB audio routing is OFF**. Android documents that enabling that switch disables automatic USB routing. See [Android developer options](https://developer.android.com/studio/debug/dev-options?authuser=2&hl=en).

### Smallest useful change for the coding agent

Add a manual diagnostic selector that holds either `ours` or `ec-only` open through **the existing `startCapture` path**, with its live waveform and a recording. Reuse `constraintsFor`; there is no need to invent another constraint set. The existing Settings → **android test** → **Run the full test** can supply supporting logs now, but its automatic three-second level samples are insufficient for careful physical-source identification.

The diagnostic start operation should use this existing API after stopping and releasing the previous session:

```ts
// App.tsx: extend the existing import from './audio/device-test'.
// profile is a diagnostic control restricted to 'ours' | 'ec-only'.
const requested = constraintsFor(profile, selectedId);
const s = await startCapture(
  selectedId,
  handleBlock,
  handleDisconnect,
  requested,
);
```

Use the same session lifecycle and cancellation protection as normal Start. Do not leave two streams open or try to establish routing by opening a second processed stream alongside the raw one. Stop all tracks and await context closure before the next trial. A one-second settling interval is reasonable for the experiment; it is not a proven production requirement. Also test each profile as the first capture after a fresh browser launch to detect retained route state.

### Physical trial for each profile

1. Select the explicit USB input ID, not “Default.” Record five seconds of quiet baseline.
2. Keep the phone and pickup on separate padded surfaces, with slack cable between them. Gently excite/tap only the pickup for five seconds, then stop.
3. Leave the pickup isolated. Gently rub/tap near the phone microphone for five seconds, then stop. Avoid hitting the microphone opening itself.
4. Repeat twice, labeling the stimulus intervals in the recording/report. Where the interface permits it, mute or disconnect the analogue sensor while keeping the USB interface connected, then repeat the phone-only stimulus. An electrically injected test signal into a suitable interface is an even stronger source discriminator.
5. Stop, switch profile, and repeat. Repeat in reverse order and after a fresh launch.

Sound and vibration can reach both microphones, so a single phone tap is suggestive, not conclusive. Look for repeatable source-specific responses and use the connected-interface/muted-sensor control where possible. Do not use a single RMS threshold or a beat lock as the source identity test.

Export per trial: requested constraints and device ID/label; all enumerated inputs; `getSupportedConstraints()`; track label, settings, capabilities and constraints; context sample rate; timestamped `ended`, `mute`, `unmute`, and `devicechange` events; settings again after settling; stimulus labels; and the captured audio. Mark missing fields as unknown. Matching web device IDs alone cannot settle the suspected lower-level routing defect.

| Result | Interpretation and next step |
| --- | --- |
| Raw profile hears the phone; EC-only repeatedly hears the isolated USB pickup | Confirms the proposed workaround for that phone/browser/interface combination. Implement the compatibility profile, then validate measurement quality. |
| Both profiles hear USB | No routing failure in this controlled run. Compare app build, concurrent captures, startup order, and reconnection state with the failing run. |
| Both profiles hear the phone | EC-only is not a solution for this setup. Test the interface in a native Android recorder with explicit external-input selection; investigate Android routing, adapter/interface compatibility and browser backend. |
| A supported exact, non-alias ID request returns a different concrete ID | Treat as a selection failure; stop that stream and display the mismatch. Preserve the complete request/result for a browser report. |
| IDs match but physical stimulus still identifies the phone | Logical selection succeeded but physical routing did not. Do not mark USB as verified. |
| Neither source is distinguishable, or capture is silent | Inconclusive. Improve isolation/check input gain and hardware before drawing a routing conclusion. |

A native control that also fails points toward OS/accessory routing. A native control that succeeds while the equivalent browser test fails points toward browser capture. A native app may use a different driver/path, so record which app and capture mode it used. Native Android can request a preferred input and query the routed device while recording; those are distinct concepts in [Android AudioRouting](https://developer.android.com/reference/android/media/AudioRouting.html).

## 4. Conditional production solution

If the physical A/B test confirms EC-only:

1. Add an explicit capture profile, such as `raw` versus `android-usb-compatibility`. Keep the raw default for currently working devices. Offer the compatibility mode on Android and retain the choice for the verified input; label matching alone is not proof that a device is USB or that routing succeeded.
2. Compatibility mode requests the same exact device, `echoCancellation: true`, `autoGainControl: false`, `noiseSuppression: false`, and mono, as the existing `ec-only` variant does. Apply the chosen profile to normal measurement, inspection, calibration, and recording through the shared capture path.
3. Report requested profile separately from actual browser-reported settings. Do not silently retry with `{ audio: true }` after an exact-device failure. Do not automatically enable compatibility mode merely because the watch does not lock.
4. Verify source identity after connection/profile changes. Keep requested input, browser-reported input, and physically verified input separate in the UI/report.
5. Preserve processing warnings. If EC was intentionally requested, describe it as intentional processing rather than an unexpected override. Missing AGC/NS settings remain unknown. Do not call the stream “raw” or certify amplitude accuracy from those flags alone.

Then compare rate, beat error, amplitude, lock stability, and tick waveform against the known-working raw capture/reference setup using the same watch, lift angle, position and pickup coupling. Agree tolerances before testing. A successful beat lock proves only that the algorithm produced readings, not that those readings are accurate.

If no web profile reliably reaches USB, surface that limitation and the failed verification. A native capture bridge using explicit Android routing is a possible later implementation direction. A plain WebView/PWA wrapper retaining the same browser capture path is not evidence of a fix.

## 5. Related code defects to fix while implementing the test

**Diagnostic conclusions are too certain.** `web/src/export/device-report.ts:29–41, 96–103, 113–118` treats a level/bandwidth difference as proof of a different physical microphone, and EC-only lock as proof that amplitude remains measurable. Sequential stimuli, preprocessing, or route-dependent tuning can change the waveform on the same microphone. Replace these conclusions with “possible route or processing change; physical-source verification required.” Update the tests currently asserting the stronger claims. Also remove the “without losing anything” assertion in `web/src/audio/device-test.ts:34–41`. Android documents that source-specific tuning can include different preprocessing; absence of speaker playback does not establish a transparent capture chain. See [Android preprocessing guidance](https://source.android.com/docs/core/audio/implement-pre-processing).

**Diagnostics and normal capture can overlap.** `App.tsx:startDeviceTest` does not check/acquire `inFlight.current`; `start` does not check `deviceTestRunning`. The normal selector receives only `busy`, while the diagnostic buttons do not consistently honor it. If the test is running and the operator closes the sheet and presses Start, a second acquisition can begin. Introduce one synchronous acquisition owner/lock covering permission, normal capture and diagnostics, including cancellation/unmount cleanup. Disable relevant controls as a UI convenience, but enforce exclusion in handlers too. This is a confounder to remove, not a demonstrated explanation for every reported run.

**Hot-plug refresh can change the displayed selection independently of capture.** `App.tsx:680–705` re-resolves from the saved selection on every device change. It does not compare the active requested input with the new list or necessarily stop capture when USB disappears; the current disconnect path relies on `track.ended`. Keep active capture identity separate from the dropdown preference. If an explicitly selected input disappears, stop and require reselection even if the browser keeps the track live. Preserve a still-available current selection instead of reverting it to the saved one. Do not treat removal of an unrelated device as loss of the active input.

**The “unconstrained” test still constrains the device.** `device-test.ts:63–64` requests the exact ID. Rename it “device only; browser processing defaults.” If an actual `{ audio: true }` control is added, label it “system default” and never count its success as evidence that explicit USB selection worked.

## 6. Acceptance tests and review validation

Automated regression coverage for the proposed change:

- Raw and compatibility profiles request the same exact input; only EC changes. Working Apple/desktop default requests remain as before.
- A reported mismatch for a supported exact concrete ID stops the stream; an absent ID is unknown, not verified. Handle `default`/communication aliases separately.
- Deferred `getUserMedia` during Start prevents diagnostic acquisition; an active diagnostic prevents normal Start even after closing the sheet. Cancel/error/unmount releases the owner and all acquired tracks/contexts, including late-resolving requests.
- USB removal stops capture even when no `ended` event fires; unrelated hot-plug does not change the active label or stop a valid stream.
- A changed level, band classification, matching ID, or beat lock cannot independently yield “USB verified” or “amplitude accurate.”

Hardware acceptance remains mandatory on **Pixel 9 Pro and Pixel 3 XL**, with browser/OS versions recorded independently, plus a working Apple/desktop control. Repeat Stop/Start, profile switching, USB unplug/replug, cold launch and installed-PWA versus tab use if relevant. Confirm both correct source capture and measurement quality.

Validation completed on the unmodified application copy:

```sh
cd web
npm test -- src/audio/audio-engine.test.ts src/audio/device-manager.test.ts src/export/device-report.test.ts src/App.test.tsx
```

**4 test files, 42 tests passed.** These are JavaScript/unit/UI tests using simulated browser behavior; they do not validate Android USB routing. The new diagnostic/profile, proposed regressions, and hardware trials have not been implemented or run in this review.
