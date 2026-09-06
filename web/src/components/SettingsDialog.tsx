/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

/*
   Four tabs behind the cog.

   Settings first, not the guide: the guide is read once and the settings are
   the reason the cog gets pressed again.

   The whole dialog unmounts when it is closed. It is not cheap to render — four
   panels, a movement list and seventeen guide sections — and the app underneath
   re-renders twice a second while a measurement is running.
*/
export type SettingsTab = 'general' | 'device' | 'quartz' | 'guide';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'Settings' },
  { id: 'device', label: 'Device Check' },
  { id: 'quartz', label: 'Quartz Calibration' },
  { id: 'guide', label: 'Guide' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Which tab to land on. Set when something else opened the dialog for you. */
  initialTab: SettingsTab;
  /** Rendered for whichever tab is selected. */
  panel: (tab: SettingsTab) => ReactNode;
}

export function SettingsDialog({ open, onClose, initialTab, panel }: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const title = useRef<HTMLHeadingElement>(null);

  /* Follow the caller only as the dialog opens. Doing it on every change of
     `initialTab` would drag the operator back off a tab they had just chosen. */
  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    title.current?.focus({ preventScroll: true });
    // initialTab is read at the moment of opening, deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const select = (next: SettingsTab) => setTab(next);

  return (
    <Dialog open={open} onClose={onClose} id="settings" labelledBy="settingsTitle">
      {open && (
        <>
          <div className="settings-top">
            <button className="close" aria-label="Close" onClick={onClose}>×</button>
            <h2 id="settingsTitle" ref={title} tabIndex={-1}>SETTINGS</h2>
            <div className="settings-tabs" role="tablist" aria-label="Settings sections">
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  ref={(el) => { buttons.current[i] = el; }}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-controls={`panel-${t.id}`}
                  aria-selected={tab === t.id}
                  tabIndex={tab === t.id ? 0 : -1}
                  data-tab={t.id}
                  onClick={() => select(t.id)}
                  onKeyDown={(e) => {
                    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length
                      : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length
                        : e.key === 'Home' ? 0
                          : e.key === 'End' ? TABS.length - 1
                            : null;
                    if (next === null) return;
                    e.preventDefault();
                    select(TABS[next].id);
                    buttons.current[next]?.focus();
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-content">{panel(tab)}</div>
        </>
      )}
    </Dialog>
  );
}
