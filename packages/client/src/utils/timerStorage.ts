/**
 * Timer state persistence utilities.
 * Stores and retrieves rest timer state from localStorage.
 */

const STORAGE_KEY = 'rest-timer-state';

/**
 * Represents the persisted state of a rest timer.
 */
export interface TimerState {
  /** Unix timestamp when the timer was started */
  startedAt: number;
  /** Target rest time in seconds */
  targetSeconds: number;
  /** ID of the exercise the timer is for */
  exerciseId: number;
  /** Index of the set that triggered the timer (0-based) */
  setIndex: number;
}

/**
 * Saves timer state to localStorage.
 *
 * @param state - The timer state to persist
 */
export function saveTimerState(state: TimerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save timer state:', error);
  }
}

/**
 * Loads timer state from localStorage.
 *
 * @returns The stored timer state, or null if not found or invalid
 */
export function loadTimerState(): TimerState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null || stored === '') {
      return null;
    }
    return JSON.parse(stored) as TimerState;
  } catch (error) {
    console.error('Failed to load timer state:', error);
    return null;
  }
}

/**
 * Removes timer state from localStorage.
 */
export function clearTimerState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear timer state:', error);
  }
}

/**
 * Calculates elapsed seconds from a start timestamp.
 *
 * @param startedAt - Unix timestamp when the timer started
 * @returns Elapsed time in whole seconds (minimum 0)
 */
export function calculateElapsedSeconds(startedAt: number): number {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  return Math.max(0, elapsed);
}
