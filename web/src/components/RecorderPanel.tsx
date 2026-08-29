/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
interface Props {
  recording: boolean;
  duration: number;
  canRecord: boolean;
  onStart: () => void;
  onStop: () => void;
  onDownload: () => void;
  hasRecording: boolean;
}

export function RecorderPanel({
  recording, duration, canRecord, onStart, onStop, onDownload, hasRecording,
}: Props) {
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Recording</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={recording ? onStop : onStart} disabled={!canRecord}>
          {recording ? 'Stop recording' : 'Record'}
        </button>
        <button className="secondary" onClick={onDownload} disabled={recording || !hasRecording}>
          Download WAV
        </button>
        <span className="mono dim">{duration.toFixed(1)} s</span>
      </div>
      <p className="dim" style={{ marginBottom: 0, fontSize: 13 }}>
        Saved as 32-bit float WAV at the input's own sample rate, for use as a
        reference fixture.
      </p>
    </div>
  );
}
