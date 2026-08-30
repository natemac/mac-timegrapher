/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useScrollLock } from './useScrollLock';

function Locker({ locked }: { locked: boolean }) {
  useScrollLock(locked);
  return null;
}

const isLocked = () => document.documentElement.classList.contains('is-locked');

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('is-locked');
});

describe('useScrollLock', () => {
  it('locks the document while asked to', () => {
    const view = render(<Locker locked />);
    expect(isLocked()).toBe(true);
    view.unmount();
    expect(isLocked()).toBe(false);
  });

  it('does nothing when not asked to', () => {
    render(<Locker locked={false} />);
    expect(isLocked()).toBe(false);
  });

  it('follows the flag changing', () => {
    const view = render(<Locker locked={false} />);
    expect(isLocked()).toBe(false);
    view.rerender(<Locker locked />);
    expect(isLocked()).toBe(true);
    view.rerender(<Locker locked={false} />);
    expect(isLocked()).toBe(false);
  });

  /*
     The regression this exists for: an info popup opens over the settings
     sheet, so two of these are live at once. Toggling rather than counting
     meant closing the popup unlocked the page while the sheet underneath was
     still open — and the app started scrolling behind it again.
  */
  it('stays locked while any other holder is still open', () => {
    const outer = render(<Locker locked />);
    const inner = render(<Locker locked />);
    expect(isLocked()).toBe(true);

    inner.unmount();
    expect(isLocked()).toBe(true);

    outer.unmount();
    expect(isLocked()).toBe(false);
  });

  it('unlocks once the last holder goes, in any order', () => {
    const a = render(<Locker locked />);
    const b = render(<Locker locked />);
    a.unmount();
    expect(isLocked()).toBe(true);
    b.unmount();
    expect(isLocked()).toBe(false);
  });
});
