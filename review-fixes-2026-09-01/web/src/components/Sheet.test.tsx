/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Sheet } from './Sheet';

afterEach(cleanup);

describe('Sheet keyboard dismissal', () => {
  it('closes a single open sheet with Escape', () => {
    const close = vi.fn();
    render(<Sheet open onClose={close} label="Settings">Settings</Sheet>);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(close).toHaveBeenCalledOnce();
  });

  /* Settings can open an InfoSheet above itself. Both listen on Window, where
     stopPropagation does not stop another listener on the same target. Only
     the top sheet should consume the first Escape. */
  it('closes only the topmost of two open sheets with Escape', () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <>
        <Sheet open onClose={closeOuter} label="Settings">Settings</Sheet>
        <Sheet open onClose={closeInner} label="Movement" variant="popup">Movement help</Sheet>
      </>,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(closeInner).toHaveBeenCalledOnce();
    expect(closeOuter).not.toHaveBeenCalled();
  });
});
