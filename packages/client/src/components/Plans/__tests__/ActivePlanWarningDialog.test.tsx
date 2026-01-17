import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { ActivePlanWarningDialog } from '../ActivePlanWarningDialog';

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

describe('ActivePlanWarningDialog', () => {
  const defaultProps = {
    open: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should not render when open is false', () => {
      renderWithProviders(
        <ActivePlanWarningDialog {...defaultProps} open={false} />
      );
      expect(
        screen.queryByTestId('active-plan-warning-dialog')
      ).not.toBeInTheDocument();
    });

    it('should render when open is true', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(
        screen.getByTestId('active-plan-warning-dialog')
      ).toBeInTheDocument();
    });

    it('should display title "Edit Active Plan"', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(screen.getByText('Edit Active Plan')).toBeInTheDocument();
    });

    it('should display warning about future workouts only', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(
        screen.getByText(/future workouts/i)
      ).toBeInTheDocument();
    });

    it('should display bullet point about past workouts', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(
        screen.getByText(/past workouts will remain unchanged/i)
      ).toBeInTheDocument();
    });

    it('should display bullet point about in-progress workout', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(
        screen.getByText(/current in-progress workout will not be affected/i)
      ).toBeInTheDocument();
    });

    it('should display bullet point about logged sets', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(
        screen.getByText(/logged sets will be preserved/i)
      ).toBeInTheDocument();
    });
  });

  describe('buttons', () => {
    it('should show Cancel button', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(
        screen.getByRole('button', { name: /cancel/i })
      ).toBeInTheDocument();
    });

    it('should show Continue Editing button', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(
        screen.getByRole('button', { name: /continue editing/i })
      ).toBeInTheDocument();
    });

    it('should call onCancel when Cancel button is clicked', () => {
      const onCancel = vi.fn();
      renderWithProviders(
        <ActivePlanWarningDialog {...defaultProps} onCancel={onCancel} />
      );
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('should call onConfirm when Continue Editing button is clicked', () => {
      const onConfirm = vi.fn();
      renderWithProviders(
        <ActivePlanWarningDialog {...defaultProps} onConfirm={onConfirm} />
      );
      fireEvent.click(screen.getByRole('button', { name: /continue editing/i }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('affected workout count', () => {
    it('should not display affected workout count when not provided', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(
        screen.queryByText(/future workout\(s\)/i)
      ).not.toBeInTheDocument();
    });

    it('should display affected workout count when provided', () => {
      renderWithProviders(
        <ActivePlanWarningDialog {...defaultProps} affectedWorkoutCount={5} />
      );
      expect(screen.getByText(/5 future workout\(s\)/i)).toBeInTheDocument();
    });

    it('should display singular form for 1 workout', () => {
      renderWithProviders(
        <ActivePlanWarningDialog {...defaultProps} affectedWorkoutCount={1} />
      );
      expect(screen.getByText(/1 future workout/i)).toBeInTheDocument();
    });

    it('should display 0 affected workouts when count is 0', () => {
      renderWithProviders(
        <ActivePlanWarningDialog {...defaultProps} affectedWorkoutCount={0} />
      );
      expect(screen.getByText(/0 future workout/i)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible dialog role', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('should have proper heading hierarchy', () => {
      renderWithProviders(<ActivePlanWarningDialog {...defaultProps} />);
      const heading = screen.getByRole('heading', { name: /edit active plan/i });
      expect(heading).toBeInTheDocument();
    });
  });
});
