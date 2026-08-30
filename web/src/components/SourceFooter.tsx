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
    <footer
      className="dim"
      style={{ fontSize: 10.5, lineHeight: 1.5, textAlign: 'center', flex: '0 0 auto' }}
    >
      Open source (GPLv2) — <a href={REPO}>view source</a>. Derived from{' '}
      <a href="https://github.com/vacaboja/tg">tg</a> by Marcello Mamino. Audio
      never leaves this device.
    </footer>
  );
}
