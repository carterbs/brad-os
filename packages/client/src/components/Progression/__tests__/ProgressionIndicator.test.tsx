import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { ProgressionIndicator } from '../ProgressionIndicator';

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

describe('ProgressionIndicator', () => {
  it('should show checkmark icon when exercise will progress', () => {
    renderWithTheme(<ProgressionIndicator willProgress={true} />);

    expect(screen.getByTestId('progression-will-progress')).toBeInTheDocument();
  });

  it('should show "Will progress" text when exercise will progress', () => {
    renderWithTheme(<ProgressionIndicator willProgress={true} />);

    expect(screen.getByText('Will progress')).toBeInTheDocument();
  });

  it('should show warning icon when exercise will not progress', () => {
    renderWithTheme(<ProgressionIndicator willProgress={false} />);

    expect(
      screen.getByTestId('progression-will-not-progress')
    ).toBeInTheDocument();
  });

  it('should show "Incomplete" text when exercise will not progress', () => {
    renderWithTheme(<ProgressionIndicator willProgress={false} />);

    expect(screen.getByText('Incomplete')).toBeInTheDocument();
  });

  it('should have title attribute for accessibility', () => {
    renderWithTheme(<ProgressionIndicator willProgress={true} />);

    const indicator = screen.getByTestId('progression-will-progress');
    expect(indicator).toHaveAttribute('title');
  });

  it('should have appropriate title for non-progressing exercise', () => {
    renderWithTheme(<ProgressionIndicator willProgress={false} />);

    const indicator = screen.getByTestId('progression-will-not-progress');
    expect(indicator).toHaveAttribute('title');
    expect(indicator.getAttribute('title')).toContain('not progress');
  });
});
