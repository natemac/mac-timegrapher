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

  it('credits the upstream project', () => {
    render(<SourceFooter />);
    expect(screen.getByRole('link', { name: /tg/i })).toBeInTheDocument();
  });
});
