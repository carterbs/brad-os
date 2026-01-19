import { useState, useEffect, useCallback, useRef } from 'react';

const WORKOUT_STORAGE_KEY = 'lifting-app-workout-state';

/**
 * Pending weight/reps edit for an unlogged set
 */
export interface PendingSetEdit {
  weight?: string;
  reps?: string;
}

/**
 * Stored state for an in-progress workout
 */
export interface StoredWorkoutState {
  workoutId: number;
  sets: Record<
    number,
    { actual_reps: number; actual_weight: number; status: 'completed' | 'skipped' }
  >;
  /** Pending weight/reps edits for sets that haven't been logged yet */
  pendingEdits?: Record<number, PendingSetEdit>;
  lastUpdated: string;
}

/**
 * Hook for managing localStorage state
 * Provides type-safe get/set operations with automatic JSON serialization
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Use ref for initial value to avoid unnecessary re-renders
  const initialValueRef = useRef(initialValue);

  // Get stored value (defined inline to avoid dependency issues)
  const getStoredValue = (): T => {
    if (typeof window === 'undefined') {
      return initialValueRef.current;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValueRef.current;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValueRef.current;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(getStoredValue);

  // Set value in localStorage
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        setStoredValue((prev) => {
          const valueToStore = value instanceof Function ? value(prev) : value;
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          }
          return valueToStore;
        });
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key]
  );

  // Remove value from localStorage
  const removeValue = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
      setStoredValue(initialValueRef.current);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key]);

  // Handle storage events from other tabs
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent): void => {
      if (event.key === key && event.newValue !== null) {
        try {
          setStoredValue(JSON.parse(event.newValue) as T);
        } catch {
          // Ignore parse errors
        }
      } else if (event.key === key && event.newValue === null) {
        setStoredValue(initialValueRef.current);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return (): void => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [storedValue, setValue, removeValue];
}

/**
 * Specialized hook for workout state localStorage management
 */
export function useWorkoutStorage(): {
  storedState: StoredWorkoutState | null;
  saveState: (state: StoredWorkoutState) => void;
  clearState: () => void;
  updateSet: (
    workoutId: number,
    setId: number,
    data: { actual_reps: number; actual_weight: number; status: 'completed' | 'skipped' }
  ) => void;
  removeSet: (workoutId: number, setId: number) => void;
  getStoredStateForWorkout: (workoutId: number) => StoredWorkoutState | null;
  updatePendingEdit: (workoutId: number, setId: number, data: PendingSetEdit) => void;
  getPendingEdit: (setId: number) => PendingSetEdit | undefined;
  clearPendingEdit: (workoutId: number, setId: number) => void;
} {
  const [storedState, setStoredState, clearStoredState] =
    useLocalStorage<StoredWorkoutState | null>(WORKOUT_STORAGE_KEY, null);

  const saveState = useCallback(
    (state: StoredWorkoutState) => {
      setStoredState(state);
    },
    [setStoredState]
  );

  const clearState = useCallback(() => {
    clearStoredState();
  }, [clearStoredState]);

  const updateSet = useCallback(
    (
      workoutId: number,
      setId: number,
      data: { actual_reps: number; actual_weight: number; status: 'completed' | 'skipped' }
    ) => {
      setStoredState((prev) => {
        if (!prev || prev.workoutId !== workoutId) {
          // Create new state for this workout
          return {
            workoutId,
            sets: {
              [setId]: data,
            },
            lastUpdated: new Date().toISOString(),
          };
        }

        // Update existing state
        return {
          ...prev,
          sets: {
            ...prev.sets,
            [setId]: data,
          },
          lastUpdated: new Date().toISOString(),
        };
      });
    },
    [setStoredState]
  );

  const removeSet = useCallback(
    (workoutId: number, setId: number) => {
      setStoredState((prev) => {
        if (!prev || prev.workoutId !== workoutId) {
          return prev;
        }

        // Remove the set from the stored state
        const { [setId]: _removed, ...remainingSets } = prev.sets;
        void _removed; // Suppress unused variable warning

        // If no sets remain, clear the state entirely
        if (Object.keys(remainingSets).length === 0) {
          return null;
        }

        return {
          ...prev,
          sets: remainingSets,
          lastUpdated: new Date().toISOString(),
        };
      });
    },
    [setStoredState]
  );

  const getStoredStateForWorkout = useCallback(
    (workoutId: number): StoredWorkoutState | null => {
      if (storedState && storedState.workoutId === workoutId) {
        return storedState;
      }
      return null;
    },
    [storedState]
  );

  const updatePendingEdit = useCallback(
    (workoutId: number, setId: number, data: PendingSetEdit) => {
      setStoredState((prev) => {
        if (!prev || prev.workoutId !== workoutId) {
          // Create new state for this workout
          return {
            workoutId,
            sets: {},
            pendingEdits: {
              [setId]: data,
            },
            lastUpdated: new Date().toISOString(),
          };
        }

        // Merge with existing pending edit for this set
        const existingEdit = prev.pendingEdits?.[setId] ?? {};
        return {
          ...prev,
          pendingEdits: {
            ...prev.pendingEdits,
            [setId]: { ...existingEdit, ...data },
          },
          lastUpdated: new Date().toISOString(),
        };
      });
    },
    [setStoredState]
  );

  const getPendingEdit = useCallback(
    (setId: number): PendingSetEdit | undefined => {
      return storedState?.pendingEdits?.[setId];
    },
    [storedState]
  );

  const clearPendingEdit = useCallback(
    (workoutId: number, setId: number) => {
      setStoredState((prev) => {
        if (!prev || prev.workoutId !== workoutId || !prev.pendingEdits) {
          return prev;
        }

        const { [setId]: _removed, ...remainingEdits } = prev.pendingEdits;
        void _removed; // Suppress unused variable warning

        const hasRemainingEdits = Object.keys(remainingEdits).length > 0;
        return {
          workoutId: prev.workoutId,
          sets: prev.sets,
          lastUpdated: new Date().toISOString(),
          ...(hasRemainingEdits ? { pendingEdits: remainingEdits } : {}),
        };
      });
    },
    [setStoredState]
  );

  return {
    storedState,
    saveState,
    clearState,
    updateSet,
    removeSet,
    getStoredStateForWorkout,
    updatePendingEdit,
    getPendingEdit,
    clearPendingEdit,
  };
}
