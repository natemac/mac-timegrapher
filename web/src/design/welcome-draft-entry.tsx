/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import './welcome-draft.css';
import { WelcomeDraft } from './WelcomeDraft';

/* A separate entry so the draft can be looked at beside the real app without
   being wired into it. Vite builds index.html only, so this never ships. */
createRoot(document.getElementById('root')!).render(
  <WelcomeDraft version={__BUILD_VERSION__} />,
);
