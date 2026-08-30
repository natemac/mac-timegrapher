/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The application's only stylesheet, imported at the entry point rather than
// from a component so that load order does not depend on render order.
import './styles/tokens.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
   Register the offline shell.

   Deliberately after load: the worker is a nicety, and competing with the app's
   own first paint for bandwidth on a bad connection would make the thing it is
   meant to speed up slower to start.

   Failure is silent by design. A browser with service workers disabled, or a
   private window, should still get a working timegrapher.
*/
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {});
  });
}
