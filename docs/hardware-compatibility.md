# Hardware and browser compatibility

Results are recorded as they are verified on real hardware. An empty cell means
untested, not unsupported.

## Test device

- **Device:** USB PnP Sound Device
- **Manufacturer:** C-Media Electronics Inc.
- **USB Vendor ID:** `0x0d8c`
- **USB Product ID:** `0x013c`

## Results

| Browser | OS | Appears in list | Opens stream | Actual rate | AGC/NS disabled | Ticks visible | WAV clean |
|---|---|---|---|---|---|---|---|
| Chrome | macOS | | | | | | |
| Safari | macOS | | | | | | |
| Chrome | Windows | | | | | | |
| Edge | Windows | | | | | | |
| Chrome | Android | | | | | | |
| Safari | iPadOS | | | | | | |

## Notes

Record any browser that refuses to honour `autoGainControl: false` or
`noiseSuppression: false`. Amplitude measurement is unreliable on such a
browser, and the app warns the operator at runtime.
