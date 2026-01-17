import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { RestTimer } from '../RestTimer';

// Mock the audio module
vi.mock('../../../utils/audio', () => ({
  playRestCompleteBeep: vi.fn(),
}));

const renderWithTheme = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<Theme>{ui}</Theme>);
};

describe('RestTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('display', () => {
    it('should display elapsed time in MM:SS format', () => {
      renderWithTheme(<RestTimer targetSeconds={60} isActive={true} />);
      expect(screen.getByText('00:00')).toBeInTheDocument();
    });

    it('should display target rest time', () => {
      renderWithTheme(<RestTimer targetSeconds={90} isActive={true} />);
      expect(screen.getByText(/1:30/)).toBeInTheDocument();
    });

    it('should update elapsed time as timer runs', () => {
      renderWithTheme(<RestTimer targetSeconds={60} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByText('00:05')).toBeInTheDocument();
    });

    it('should show minutes and seconds correctly', () => {
      renderWithTheme(<RestTimer targetSeconds={120} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(75000);
      });

      expect(screen.getByText('01:15')).toBeInTheDocument();
    });

    it('should display target time in seconds format for short durations', () => {
      renderWithTheme(<RestTimer targetSeconds={45} isActive={true} />);
      expect(screen.getByText(/45s/)).toBeInTheDocument();
    });
  });

  describe('completion state', () => {
    it('should show visual indicator when rest is complete', () => {
      renderWithTheme(<RestTimer targetSeconds={5} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByTestId('rest-complete-indicator')).toBeInTheDocument();
    });

    it('should display "Rest Complete" text when timer finishes', () => {
      renderWithTheme(<RestTimer targetSeconds={5} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByText(/rest complete/i)).toBeInTheDocument();
    });

    it('should cap displayed time at target', () => {
      renderWithTheme(<RestTimer targetSeconds={3} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Should show 00:03, not 00:10
      expect(screen.getByText('00:03')).toBeInTheDocument();
    });
  });

  describe('dismiss button', () => {
    it('should render dismiss button', () => {
      renderWithTheme(<RestTimer targetSeconds={60} isActive={true} />);
      expect(
        screen.getByRole('button', { name: /dismiss/i })
      ).toBeInTheDocument();
    });

    it('should call onDismiss when dismiss button is clicked', () => {
      const onDismiss = vi.fn();
      renderWithTheme(
        <RestTimer targetSeconds={60} isActive={true} onDismiss={onDismiss} />
      );

      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('should stop timer when dismissed', () => {
      renderWithTheme(<RestTimer targetSeconds={60} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Timer should still show 5 seconds, not 10
      expect(screen.getByText('00:05')).toBeInTheDocument();
    });
  });

  describe('reset functionality', () => {
    it('should not render reset button by default', () => {
      renderWithTheme(<RestTimer targetSeconds={60} isActive={true} />);
      expect(
        screen.queryByRole('button', { name: /reset/i })
      ).not.toBeInTheDocument();
    });

    it('should render reset button when showReset is true', () => {
      renderWithTheme(
        <RestTimer targetSeconds={60} isActive={true} showReset={true} />
      );
      expect(
        screen.getByRole('button', { name: /reset/i })
      ).toBeInTheDocument();
    });

    it('should reset timer to 0 when reset button is clicked', () => {
      renderWithTheme(
        <RestTimer targetSeconds={60} isActive={true} showReset={true} />
      );

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(screen.getByText('00:10')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /reset/i }));

      expect(screen.getByText('00:00')).toBeInTheDocument();
    });

    it('should restart timer after reset', () => {
      renderWithTheme(
        <RestTimer targetSeconds={60} isActive={true} showReset={true} />
      );

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      fireEvent.click(screen.getByRole('button', { name: /reset/i }));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByText('00:05')).toBeInTheDocument();
    });
  });

  describe('inactive state', () => {
    it('should not render when isActive is false', () => {
      const { container } = renderWithTheme(
        <RestTimer targetSeconds={60} isActive={false} />
      );
      expect(container.querySelector('[role="timer"]')).toBeNull();
    });
  });

  describe('audio', () => {
    it('should play beep sound when timer completes', async () => {
      const { playRestCompleteBeep } = await import('../../../utils/audio');

      renderWithTheme(<RestTimer targetSeconds={3} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(playRestCompleteBeep).toHaveBeenCalledTimes(1);
    });

    it('should not play beep sound if muted', async () => {
      const { playRestCompleteBeep } = await import('../../../utils/audio');

      renderWithTheme(
        <RestTimer targetSeconds={3} isActive={true} muted={true} />
      );

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(playRestCompleteBeep).not.toHaveBeenCalled();
    });
  });

  describe('progress indicator', () => {
    it('should show progress bar', () => {
      renderWithTheme(<RestTimer targetSeconds={60} isActive={true} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should start at 0% progress', () => {
      renderWithTheme(<RestTimer targetSeconds={100} isActive={true} />);

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });

    it('should update progress as timer runs', () => {
      renderWithTheme(<RestTimer targetSeconds={100} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(50000);
      });

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('should cap progress at 100%', () => {
      renderWithTheme(<RestTimer targetSeconds={3} isActive={true} />);

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });
  });

  describe('initial elapsed time', () => {
    it('should start with initial elapsed time when provided', () => {
      renderWithTheme(
        <RestTimer targetSeconds={60} isActive={true} initialElapsed={30} />
      );

      expect(screen.getByText('00:30')).toBeInTheDocument();
    });

    it('should continue counting from initial elapsed', () => {
      renderWithTheme(
        <RestTimer targetSeconds={60} isActive={true} initialElapsed={30} />
      );

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(screen.getByText('00:35')).toBeInTheDocument();
    });

    it('should show as complete if initial elapsed >= target', () => {
      renderWithTheme(
        <RestTimer targetSeconds={30} isActive={true} initialElapsed={35} />
      );

      expect(screen.getByTestId('rest-complete-indicator')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have timer role', () => {
      renderWithTheme(<RestTimer targetSeconds={60} isActive={true} />);
      expect(screen.getByRole('timer')).toBeInTheDocument();
    });

    it('should have accessible button labels', () => {
      renderWithTheme(
        <RestTimer targetSeconds={60} isActive={true} showReset={true} />
      );

      expect(screen.getByRole('button', { name: /dismiss timer/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset timer/i })).toBeInTheDocument();
    });
  });
});
