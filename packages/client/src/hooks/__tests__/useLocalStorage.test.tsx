import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage, useWorkoutStorage } from '../useLocalStorage';
import type { StoredWorkoutState } from '../useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('should return initial value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('initial');
  });

  it('should load stored value from localStorage', () => {
    window.localStorage.setItem('test-key', JSON.stringify('stored-value'));

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('stored-value');
  });

  it('should save value to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('new-value');
    });

    expect(result.current[0]).toBe('new-value');
    const storedValue = window.localStorage.getItem('test-key');
    expect(storedValue).not.toBeNull();
    expect(JSON.parse(storedValue ?? '')).toBe('new-value');
  });

  it('should support function updates', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 5));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(6);
  });

  it('should remove value from localStorage', () => {
    window.localStorage.setItem('test-key', JSON.stringify('stored-value'));
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[2](); // removeValue
    });

    expect(result.current[0]).toBe('initial');
    expect(window.localStorage.getItem('test-key')).toBeNull();
  });

  it('should handle corrupted localStorage data', () => {
    window.localStorage.setItem('test-key', 'not-valid-json');

    // Mock console.warn to suppress expected warning
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    expect(result.current[0]).toBe('initial');

    warnSpy.mockRestore();
  });

  it('should work with complex objects', () => {
    const complexValue = {
      id: 1,
      nested: { value: 'test' },
      array: [1, 2, 3],
    };

    const { result } = renderHook(() =>
      useLocalStorage('test-key', { id: 0, nested: { value: '' }, array: [] as number[] })
    );

    act(() => {
      result.current[1](complexValue);
    });

    expect(result.current[0]).toEqual(complexValue);
  });
});

describe('useWorkoutStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('should return null when no stored state', () => {
    const { result } = renderHook(() => useWorkoutStorage());

    expect(result.current.storedState).toBeNull();
  });

  it('should save workout state', () => {
    const { result } = renderHook(() => useWorkoutStorage());

    const state: StoredWorkoutState = {
      workoutId: 1,
      sets: {
        1: { actual_reps: 10, actual_weight: 135, status: 'completed' },
      },
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    act(() => {
      result.current.saveState(state);
    });

    expect(result.current.storedState).toEqual(state);
  });

  it('should clear workout state', () => {
    const { result } = renderHook(() => useWorkoutStorage());

    const state: StoredWorkoutState = {
      workoutId: 1,
      sets: { 1: { actual_reps: 10, actual_weight: 135, status: 'completed' } },
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    act(() => {
      result.current.saveState(state);
    });

    act(() => {
      result.current.clearState();
    });

    expect(result.current.storedState).toBeNull();
  });

  it('should update a set for existing workout', () => {
    const { result } = renderHook(() => useWorkoutStorage());

    const initialState: StoredWorkoutState = {
      workoutId: 1,
      sets: {
        1: { actual_reps: 10, actual_weight: 135, status: 'completed' },
      },
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    act(() => {
      result.current.saveState(initialState);
    });

    act(() => {
      result.current.updateSet(1, 2, {
        actual_reps: 8,
        actual_weight: 140,
        status: 'completed',
      });
    });

    expect(result.current.storedState?.sets[2]).toEqual({
      actual_reps: 8,
      actual_weight: 140,
      status: 'completed',
    });
    expect(result.current.storedState?.sets[1]).toEqual({
      actual_reps: 10,
      actual_weight: 135,
      status: 'completed',
    });
  });

  it('should create new state when updating set for different workout', () => {
    const { result } = renderHook(() => useWorkoutStorage());

    const initialState: StoredWorkoutState = {
      workoutId: 1,
      sets: {
        1: { actual_reps: 10, actual_weight: 135, status: 'completed' },
      },
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    act(() => {
      result.current.saveState(initialState);
    });

    act(() => {
      result.current.updateSet(2, 5, {
        actual_reps: 12,
        actual_weight: 100,
        status: 'completed',
      });
    });

    expect(result.current.storedState?.workoutId).toBe(2);
    expect(result.current.storedState?.sets[5]).toEqual({
      actual_reps: 12,
      actual_weight: 100,
      status: 'completed',
    });
  });

  it('should get stored state for specific workout', () => {
    const { result } = renderHook(() => useWorkoutStorage());

    const state: StoredWorkoutState = {
      workoutId: 1,
      sets: {
        1: { actual_reps: 10, actual_weight: 135, status: 'completed' },
      },
      lastUpdated: '2024-01-15T10:00:00Z',
    };

    act(() => {
      result.current.saveState(state);
    });

    expect(result.current.getStoredStateForWorkout(1)).toEqual(state);
    expect(result.current.getStoredStateForWorkout(2)).toBeNull();
  });

  it('should update lastUpdated when updating set', () => {
    const { result } = renderHook(() => useWorkoutStorage());

    const oldDate = '2024-01-15T10:00:00Z';
    const state: StoredWorkoutState = {
      workoutId: 1,
      sets: {},
      lastUpdated: oldDate,
    };

    act(() => {
      result.current.saveState(state);
    });

    act(() => {
      result.current.updateSet(1, 1, {
        actual_reps: 10,
        actual_weight: 135,
        status: 'completed',
      });
    });

    expect(result.current.storedState?.lastUpdated).not.toBe(oldDate);
  });

  describe('pending edits', () => {
    it('should update pending edit for a set', () => {
      const { result } = renderHook(() => useWorkoutStorage());

      const state: StoredWorkoutState = {
        workoutId: 1,
        sets: {},
        lastUpdated: '2024-01-15T10:00:00Z',
      };

      act(() => {
        result.current.saveState(state);
      });

      act(() => {
        result.current.updatePendingEdit(1, 5, { weight: '150', reps: '10' });
      });

      expect(result.current.storedState?.pendingEdits?.[5]).toEqual({
        weight: '150',
        reps: '10',
      });
    });

    it('should create new state when updating pending edit with no existing state', () => {
      const { result } = renderHook(() => useWorkoutStorage());

      act(() => {
        result.current.updatePendingEdit(1, 5, { weight: '150' });
      });

      expect(result.current.storedState?.workoutId).toBe(1);
      expect(result.current.storedState?.pendingEdits?.[5]).toEqual({ weight: '150' });
      expect(result.current.storedState?.sets).toEqual({});
    });

    it('should merge pending edits for the same set', () => {
      const { result } = renderHook(() => useWorkoutStorage());

      act(() => {
        result.current.updatePendingEdit(1, 5, { weight: '150' });
      });

      act(() => {
        result.current.updatePendingEdit(1, 5, { reps: '12' });
      });

      expect(result.current.storedState?.pendingEdits?.[5]).toEqual({
        weight: '150',
        reps: '12',
      });
    });

    it('should get pending edit for a set', () => {
      const { result } = renderHook(() => useWorkoutStorage());

      act(() => {
        result.current.updatePendingEdit(1, 5, { weight: '150', reps: '10' });
      });

      expect(result.current.getPendingEdit(5)).toEqual({ weight: '150', reps: '10' });
      expect(result.current.getPendingEdit(99)).toBeUndefined();
    });

    it('should clear pending edit for a set', () => {
      const { result } = renderHook(() => useWorkoutStorage());

      act(() => {
        result.current.updatePendingEdit(1, 5, { weight: '150' });
        result.current.updatePendingEdit(1, 6, { weight: '200' });
      });

      act(() => {
        result.current.clearPendingEdit(1, 5);
      });

      expect(result.current.storedState?.pendingEdits?.[5]).toBeUndefined();
      expect(result.current.storedState?.pendingEdits?.[6]).toEqual({ weight: '200' });
    });

    it('should remove pendingEdits field when last edit is cleared', () => {
      const { result } = renderHook(() => useWorkoutStorage());

      act(() => {
        result.current.updatePendingEdit(1, 5, { weight: '150' });
      });

      act(() => {
        result.current.clearPendingEdit(1, 5);
      });

      expect(result.current.storedState?.pendingEdits).toBeUndefined();
    });

    it('should not affect other workout state when clearing pending edit', () => {
      const { result } = renderHook(() => useWorkoutStorage());

      act(() => {
        result.current.updatePendingEdit(1, 5, { weight: '150' });
      });

      // Try to clear for a different workout - should not affect anything
      act(() => {
        result.current.clearPendingEdit(2, 5);
      });

      expect(result.current.storedState?.pendingEdits?.[5]).toEqual({ weight: '150' });
    });

    it('should create new state when updating pending edit for different workout', () => {
      const { result } = renderHook(() => useWorkoutStorage());

      const state: StoredWorkoutState = {
        workoutId: 1,
        sets: { 1: { actual_reps: 10, actual_weight: 135, status: 'completed' } },
        lastUpdated: '2024-01-15T10:00:00Z',
      };

      act(() => {
        result.current.saveState(state);
      });

      act(() => {
        result.current.updatePendingEdit(2, 5, { weight: '150' });
      });

      // Should have switched to workout 2
      expect(result.current.storedState?.workoutId).toBe(2);
      expect(result.current.storedState?.pendingEdits?.[5]).toEqual({ weight: '150' });
      // Previous workout data should be gone
      expect(result.current.storedState?.sets).toEqual({});
    });
  });
});
