import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { DaySelector } from '../DaySelector';
import type { DayOfWeek } from '@brad-os/shared';

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

describe('DaySelector', () => {
  it('should render all 7 days', () => {
    renderWithTheme(<DaySelector selectedDays={[]} onChange={vi.fn()} />);

    // Check for abbreviated names shown in full below checkboxes
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('should show correct days as checked based on selectedDays prop', () => {
    const selectedDays: DayOfWeek[] = [1, 3, 5]; // Monday, Wednesday, Friday
    renderWithTheme(
      <DaySelector selectedDays={selectedDays} onChange={vi.fn()} />
    );

    // Monday, Wednesday, Friday should be checked
    expect(screen.getByTestId('day-checkbox-1')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('day-checkbox-3')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('day-checkbox-5')).toHaveAttribute('data-state', 'checked');

    // Sunday, Tuesday, Thursday, Saturday should not be checked
    expect(screen.getByTestId('day-checkbox-0')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('day-checkbox-2')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('day-checkbox-4')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByTestId('day-checkbox-6')).toHaveAttribute('data-state', 'unchecked');
  });

  it('should call onChange with updated array when checkbox is toggled on', () => {
    const onChange = vi.fn();
    const selectedDays: DayOfWeek[] = [1]; // Monday
    renderWithTheme(
      <DaySelector selectedDays={selectedDays} onChange={onChange} />
    );

    // Toggle Wednesday on
    fireEvent.click(screen.getByTestId('day-checkbox-3'));

    // Should be called with sorted array
    expect(onChange).toHaveBeenCalledWith([1, 3]);
  });

  it('should call onChange with updated array when checkbox is toggled off', () => {
    const onChange = vi.fn();
    const selectedDays: DayOfWeek[] = [1, 3, 5]; // Monday, Wednesday, Friday
    renderWithTheme(
      <DaySelector selectedDays={selectedDays} onChange={onChange} />
    );

    // Toggle Wednesday off
    fireEvent.click(screen.getByTestId('day-checkbox-3'));

    expect(onChange).toHaveBeenCalledWith([1, 5]);
  });

  it('should respect disabled prop', () => {
    const onChange = vi.fn();
    renderWithTheme(
      <DaySelector selectedDays={[]} onChange={onChange} disabled={true} />
    );

    // All checkboxes should be disabled
    expect(screen.getByTestId('day-checkbox-0')).toBeDisabled();
    expect(screen.getByTestId('day-checkbox-1')).toBeDisabled();
    expect(screen.getByTestId('day-checkbox-2')).toBeDisabled();
    expect(screen.getByTestId('day-checkbox-3')).toBeDisabled();
    expect(screen.getByTestId('day-checkbox-4')).toBeDisabled();
    expect(screen.getByTestId('day-checkbox-5')).toBeDisabled();
    expect(screen.getByTestId('day-checkbox-6')).toBeDisabled();
  });

  it('should keep days sorted when adding a day', () => {
    const onChange = vi.fn();
    const selectedDays: DayOfWeek[] = [5]; // Friday
    renderWithTheme(
      <DaySelector selectedDays={selectedDays} onChange={onChange} />
    );

    // Toggle Monday on
    fireEvent.click(screen.getByTestId('day-checkbox-1'));

    // Result should be sorted: [1, 5] not [5, 1]
    expect(onChange).toHaveBeenCalledWith([1, 5]);
  });
});
