import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { DeloadBadge } from '../DeloadBadge';

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

describe('DeloadBadge', () => {
  it('should render deload label', () => {
    renderWithTheme(<DeloadBadge />);

    expect(screen.getByText('Deload Week')).toBeInTheDocument();
  });

  it('should have appropriate test id', () => {
    renderWithTheme(<DeloadBadge />);

    const badge = screen.getByTestId('deload-badge');
    expect(badge).toBeInTheDocument();
  });

  it('should have a title attribute for accessibility', () => {
    renderWithTheme(<DeloadBadge />);

    const badge = screen.getByTestId('deload-badge');
    expect(badge).toHaveAttribute('title');
  });

  it('should show deload info in title', () => {
    renderWithTheme(<DeloadBadge />);

    const badge = screen.getByTestId('deload-badge');
    const title = badge.getAttribute('title') ?? '';
    expect(title).toContain('50%');
    expect(title).toContain('85%');
  });
});
