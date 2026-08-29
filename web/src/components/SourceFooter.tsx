/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
const REPO = 'https://github.com/natemac/mac-timegrapher';

export function SourceFooter() {
  return (
    <footer className="dim" style={{ fontSize: 13, lineHeight: 1.7, paddingTop: 8 }}>
      <p>
        Open source (GPLv2) — <a href={REPO}>view source</a>. Derived from{' '}
        <a href="https://github.com/vacaboja/tg">tg</a> by Marcello Mamino.
      </p>
      <p>Audio is processed entirely in your browser and never uploaded.</p>
    </footer>
  );
}
