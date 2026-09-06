/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   The written offer of source, under GPLv2 §3.

   Serving WebAssembly and JavaScript to a browser is distribution of object
   code, so the offer has to travel with it. It is in the page footer, which is
   rendered on every screen — the opening screen, both measuring modes — and is
   never behind a condition, a setting or a tab. Do not make it one.
*/
const REPO = 'https://github.com/natemac/mac-timegrapher';

export function SourceFooter() {
  return (
    <p>
      Open source (GPLv2) —{' '}
      <a
        className="source-label"
        href={REPO}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit' }}
      >
        view source.
      </a>
    </p>
  );
}
