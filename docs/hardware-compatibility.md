# Hardware and browser compatibility

Results are recorded as they are verified on real hardware. An empty cell means
untested, not unsupported. Nothing here is inferred from another row — a
platform property read off one browser is how three wrong conclusions about
Android were reached, and each of them looked obvious at the time.

## Test device

- **Device:** USB PnP Sound Device
- **Manufacturer:** C-Media Electronics Inc.
- **USB Vendor ID:** `0x0d8c`
- **USB Product ID:** `0x013c`

## Results

| Browser | OS | In list | Opens | Rate | Processing off | Ticks | Measures |
|---|---|---|---|---|---|---|---|
| Safari | iOS 18.7 | yes | yes | 44,100 native | EC off; AGC/NS **unreported** | yes, 29 dB over room | yes — 21,600 locked, 266° |
| Safari | macOS | yes | yes | | | yes | yes — 279° |
| Chrome | macOS | yes | yes | | | yes | yes — 274° |
| Firefox | macOS | yes | yes | | | yes | yes |
| Chrome | Android | **only via communication route** | yes | | EC **on by necessity** | yes | rate/beat yes, **amplitude invalid** |
| Firefox | Android | **only via communication route** | yes | | EC on by necessity | yes, 24–27 dB over room | yes — 267–280° |
| Chrome | Windows | | | | | | |
| Edge | Windows | | | | | | |
| Safari | iPadOS | | | | | | |

## What the exceptions mean

**Android reaches a chosen input only on the communication route.** `deviceId`
selects nothing without `echoCancellation: true` — with all processing off, four
enumerated inputs including the USB pickup returned the same built-in
microphone, matching within a decibel. Reported on a Pixel 9 Pro where Chrome
and Firefox both failed, reproduced on a Pixel 3 XL. The app takes that route on
Android automatically and there is no setting; a control could only let someone
pick the configuration that cannot measure. Full measurements in
[android-usb-audio-findings.md](android-usb-audio-findings.md).

**Chromium on Android applies gain control below the browser** on that route,
which `getSettings()` reports as absent. Amplitude read 156–171° against 276–291°
for the same watch elsewhere, and padding the movement raised the level rather
than lowering it. Rate and beat error read timing and survive. The figure is
shown with a warning under it rather than withheld — a caveated reading can be
checked against another device, a blank cannot. **Firefox on Android is
unaffected**, which is why the two rows differ.

**iOS Safari omits `autoGainControl` and `noiseSuppression` from
`getSettings()`.** The constraint is requested and never acknowledged. Device
Check reports these as **Unknown**, deliberately not as *Off*: silence is not
consent, and gain control is the one that invalidates amplitude outright.

**iOS reports a large frames-against-wall drift at 44,100 Hz.** Measured −80
s/day (−921 ppm) on a run whose analysis read +1.0 s/day, so it is an artefact of
that platform's clock reporting rather than a real crystal error. Suspect the
rate before suspecting the crystal — see the table in `CLAUDE.md`.

## How to add a row

Run **Settings → Device Check** with the movement box ticked and the watch on
the sensor, then **Export**. Everything in the columns above is in that file,
including what the browser reported about the track verbatim. Record any browser
that refuses to honour `autoGainControl: false` or `noiseSuppression: false`;
amplitude is unreliable on such a browser and the app should be saying so.
