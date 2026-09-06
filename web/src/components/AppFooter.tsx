/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { SourceFooter } from './SourceFooter';

/*
   Four lines, on every screen.

   Two of them are a promise about the audio, which is worth repeating where a
   person can see it while the microphone is open. The third identifies the
   build, so a report of odd behaviour can be tied to what was actually being
   served. The fourth is the licence offer and is not optional — see
   SourceFooter.
*/
export function AppFooter() {
  return (
    <footer>
      <p className="privacy-lock">
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="4" y="7" width="8" height="7" rx="2" />
          <path d="M5.5 7V4a2.5 2.5 0 0 1 5 0v3" />
        </svg>
        <span>Nothing is recorded or uploaded.</span>
      </p>
      <p>Audio is analysed and stays on this device.</p>
      <p>Release: {__BUILD_VERSION__}</p>
      <SourceFooter />
    </footer>
  );
}
