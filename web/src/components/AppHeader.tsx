/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/

/*
   The masthead: mark, product name, settings.

   The mark is a way home. Installed to the home screen the app has no browser
   chrome — no address bar, no reload, no back gesture — so it is one of only
   two routes back to the opening screen, and it is where a person looks for it.

   When branding is off the button is hidden rather than removed. `visibility`
   takes it out of the tab order and the accessibility tree but keeps its box,
   so the product name stays centred in the same place whichever way the
   preference is set.
*/
interface Props {
  showLogo: boolean;
  onHome: () => void;
  onOpenSettings: () => void;
}

export function AppHeader({ showLogo, onHome, onOpenSettings }: Props) {
  return (
    <header>
      <button
        className="logo"
        id="home"
        onClick={onHome}
        style={{ visibility: showLogo ? 'visible' : 'hidden' }}
        aria-label="MAC Bespoke Watch Co. — Home"
      >
        {/* The positive mark in both themes: the stylesheet inverts it for the
            dark one, exactly as the design does. */}
        <img src={`${import.meta.env.BASE_URL}mac-logo-pos.png`} alt="MAC Bespoke Watch Co." />
      </button>

      <div className="app-title">TIMEGRAPHER</div>

      <button className="settings-button" id="settingsButton" onClick={onOpenSettings} aria-label="Settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path
            d="m9 3-.7 2.5-2.4 1L3.5 6l-2 3.5 1.8 1.8v2.8l-1.8 1.8 2 3.5 2.4-.5 2.4 1L9 22h4l.7-2.1 2.4-1 2.4.5 2-3.5-1.8-1.8v-2.8l1.8-1.8-2-3.5-2.4.5-2.4-1L13 3Z"
            transform="translate(1 -1) scale(.95)"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </header>
  );
}
