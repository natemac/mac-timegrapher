/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

// A render quantum is 128 frames, which at 48 kHz would be 375 messages per
// second. Batching to 2048 frames cuts that to about 23.
const CHUNK_FRAMES = 2048;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(CHUNK_FRAMES);
    this._filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true; // no input connected yet; keep the node alive

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._filled++] = channel[i];
      if (this._filled === CHUNK_FRAMES) {
        // slice() copies: the buffer is reused on the next quantum.
        //
        // Only whole chunks are posted, so whatever is left in _buffer when
        // capture stops — up to CHUNK_FRAMES - 1, i.e. 2047 frames, about
        // 43 ms at 48 kHz — is discarded and never reaches the recorder.
        // Harmless for the 30-second fixtures this milestone produces, but
        // it is a real truncation at the tail of every recording and DSP
        // work should not have to rediscover it. Flushing the remainder
        // would need a stop message from the main thread.
        this.port.postMessage(this._buffer.slice(0));
        this._filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
