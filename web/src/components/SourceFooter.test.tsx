/*
    MAC Bespoke Web Timegrapher
    Copyright (C) 2026 MAC Bespoke Watch Co.

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License version 2 as
    published by the Free Software Foundation.
*/
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceFooter } from './SourceFooter';

describe('SourceFooter', () => {
  it('links to the public source repository', () => {
    render(<SourceFooter />);
    const link = screen.getByRole('link', { name: /view source/i });
    expect(link).toHaveAttribute('href', 'https://github.com/natemac/mac-timegrapher');
  });

  it('names the license', () => {
    render(<SourceFooter />);
    expect(screen.getByText(/GPLv2/)).toBeInTheDocument();
  });

  /*
     The v36 footer drops the "Derived from tg by Marcello Mamino" credit that
     used to sit beside the licence offer. Not a licence defect — the copyright
     notices are in LICENSE and in every source header, both of which the link
     above reaches — but it is a courtesy credit to the author of the project
     this is a public fork of, and it is listed for a decision in
     docs/updateui.md, A2. Restore the sentence and this test with it.
  */
  it('offers the source unconditionally, with no wrapper to hide it', () => {
    const { container } = render(<SourceFooter />);
    expect(container.querySelector('[hidden]')).toBeNull();
    expect(screen.getByRole('link', { name: /view source/i })).toBeVisible();
  });
});
