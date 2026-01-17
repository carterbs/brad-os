import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveTimerState,
  loadTimerState,
  clearTimerState,
  calculateElapsedSeconds,
  type TimerState,
} from '../timerStorage';

describe('timerStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveTimerState', () => {
    it('should save timer state to localStorage', () => {
      const state: TimerState = {
        startedAt: Date.now(),
        targetSeconds: 60,
        exerciseId: 1,
        setIndex: 2,
      };

      saveTimerState(state);

      const stored = window.localStorage.getItem('rest-timer-state');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored ?? '')).toEqual(state);
    });

    it('should overwrite existing state', () => {
      const state1: TimerState = {
        startedAt: Date.now(),
        targetSeconds: 60,
        exerciseId: 1,
        setIndex: 2,
      };

      const state2: TimerState = {
        startedAt: Date.now() + 1000,
        targetSeconds: 90,
        exerciseId: 2,
        setIndex: 3,
      };

      saveTimerState(state1);
      saveTimerState(state2);

      const stored = window.localStorage.getItem('rest-timer-state');
      expect(JSON.parse(stored ?? '')).toEqual(state2);
    });

    it('should handle localStorage errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full');
      });

      const state: TimerState = {
        startedAt: Date.now(),
        targetSeconds: 60,
        exerciseId: 1,
        setIndex: 2,
      };

      // Should not throw
      expect(() => saveTimerState(state)).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('loadTimerState', () => {
    it('should load timer state from localStorage', () => {
      const state: TimerState = {
        startedAt: Date.now(),
        targetSeconds: 60,
        exerciseId: 1,
        setIndex: 2,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(state));

      const loaded = loadTimerState();

      expect(loaded).toEqual(state);
    });

    it('should return null when no state exists', () => {
      const loaded = loadTimerState();
      expect(loaded).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      window.localStorage.setItem('rest-timer-state', 'invalid-json');

      const loaded = loadTimerState();

      expect(loaded).toBeNull();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('should return null for empty string', () => {
      window.localStorage.setItem('rest-timer-state', '');

      const loaded = loadTimerState();

      expect(loaded).toBeNull();
    });

    it('should preserve startedAt timestamp', () => {
      const startedAt = Date.now() - 30000; // 30 seconds ago
      const state: TimerState = {
        startedAt,
        targetSeconds: 60,
        exerciseId: 1,
        setIndex: 2,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(state));

      const loaded = loadTimerState();

      expect(loaded).not.toBeNull();
      expect(loaded?.startedAt).toBe(startedAt);
    });
  });

  describe('clearTimerState', () => {
    it('should remove timer state from localStorage', () => {
      const state: TimerState = {
        startedAt: Date.now(),
        targetSeconds: 60,
        exerciseId: 1,
        setIndex: 2,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(state));

      clearTimerState();

      expect(window.localStorage.getItem('rest-timer-state')).toBeNull();
    });

    it('should not throw when no state exists', () => {
      expect(() => clearTimerState()).not.toThrow();
    });

    it('should handle localStorage errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not throw
      expect(() => clearTimerState()).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('calculateElapsedSeconds', () => {
    it('should calculate elapsed time correctly', () => {
      const now = Date.now();
      const startedAt = now - 30000; // 30 seconds ago

      vi.setSystemTime(now);

      const elapsed = calculateElapsedSeconds(startedAt);

      expect(elapsed).toBe(30);
    });

    it('should return 0 for future timestamps', () => {
      const now = Date.now();
      const futureTime = now + 10000;

      vi.setSystemTime(now);

      const elapsed = calculateElapsedSeconds(futureTime);

      expect(elapsed).toBe(0);
    });

    it('should round down to whole seconds', () => {
      const now = Date.now();
      const startedAt = now - 10500; // 10.5 seconds ago

      vi.setSystemTime(now);

      const elapsed = calculateElapsedSeconds(startedAt);

      expect(elapsed).toBe(10);
    });

    it('should handle exact second boundaries', () => {
      const now = Date.now();
      const startedAt = now - 60000; // Exactly 60 seconds ago

      vi.setSystemTime(now);

      const elapsed = calculateElapsedSeconds(startedAt);

      expect(elapsed).toBe(60);
    });
  });
});
