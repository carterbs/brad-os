import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveMeditationState,
  loadMeditationState,
  clearMeditationState,
  isMeditationSessionStale,
  saveMeditationConfig,
  loadMeditationConfig,
} from '../meditationStorage';
import type { MeditationSessionState } from '@brad-os/shared';

describe('meditationStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveMeditationState / loadMeditationState', () => {
    it('should save and load session state', () => {
      const state: MeditationSessionState = {
        status: 'active',
        sessionType: 'basic-breathing',
        durationMinutes: 10,
        sessionStartedAt: Date.now(),
        pausedAt: null,
        pausedElapsed: 0,
        scheduledCues: [],
        currentPhaseIndex: 0,
      };

      saveMeditationState(state);
      const loaded = loadMeditationState();

      expect(loaded).toEqual(state);
    });

    it('should return null when no state is saved', () => {
      const loaded = loadMeditationState();
      expect(loaded).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full');
      });

      const state: MeditationSessionState = {
        status: 'idle',
        sessionType: 'basic-breathing',
        durationMinutes: 10,
        sessionStartedAt: null,
        pausedAt: null,
        pausedElapsed: 0,
        scheduledCues: [],
        currentPhaseIndex: 0,
      };

      saveMeditationState(state);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('clearMeditationState', () => {
    it('should clear saved state', () => {
      const state: MeditationSessionState = {
        status: 'active',
        sessionType: 'basic-breathing',
        durationMinutes: 5,
        sessionStartedAt: Date.now(),
        pausedAt: null,
        pausedElapsed: 0,
        scheduledCues: [],
        currentPhaseIndex: 0,
      };

      saveMeditationState(state);
      expect(loadMeditationState()).not.toBeNull();

      clearMeditationState();
      expect(loadMeditationState()).toBeNull();
    });
  });

  describe('isMeditationSessionStale', () => {
    it('should return true for sessions with no timestamp', () => {
      const state: MeditationSessionState = {
        status: 'active',
        sessionType: 'basic-breathing',
        durationMinutes: 10,
        sessionStartedAt: null,
        pausedAt: null,
        pausedElapsed: 0,
        scheduledCues: [],
        currentPhaseIndex: 0,
      };

      expect(isMeditationSessionStale(state)).toBe(true);
    });

    it('should return false for recent active sessions', () => {
      const state: MeditationSessionState = {
        status: 'active',
        sessionType: 'basic-breathing',
        durationMinutes: 10,
        sessionStartedAt: Date.now() - 10000, // 10 seconds ago
        pausedAt: null,
        pausedElapsed: 0,
        scheduledCues: [],
        currentPhaseIndex: 0,
      };

      expect(isMeditationSessionStale(state)).toBe(false);
    });

    it('should return true for old active sessions', () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const state: MeditationSessionState = {
        status: 'active',
        sessionType: 'basic-breathing',
        durationMinutes: 10,
        sessionStartedAt: twoHoursAgo,
        pausedAt: null,
        pausedElapsed: 0,
        scheduledCues: [],
        currentPhaseIndex: 0,
      };

      expect(isMeditationSessionStale(state)).toBe(true);
    });

    it('should check pausedAt for paused sessions', () => {
      const state: MeditationSessionState = {
        status: 'paused',
        sessionType: 'basic-breathing',
        durationMinutes: 10,
        sessionStartedAt: null,
        pausedAt: Date.now() - 10000, // 10 seconds ago
        pausedElapsed: 120,
        scheduledCues: [],
        currentPhaseIndex: 0,
      };

      expect(isMeditationSessionStale(state)).toBe(false);
    });
  });

  describe('saveMeditationConfig / loadMeditationConfig', () => {
    it('should save and load duration preference', () => {
      saveMeditationConfig(20);
      expect(loadMeditationConfig()).toBe(20);

      saveMeditationConfig(5);
      expect(loadMeditationConfig()).toBe(5);
    });

    it('should return default (10) when no config saved', () => {
      expect(loadMeditationConfig()).toBe(10);
    });

    it('should return default for invalid saved values', () => {
      localStorage.setItem('meditation-config', JSON.stringify({ duration: 15 }));
      expect(loadMeditationConfig()).toBe(10);
    });

    it('should handle malformed JSON gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('meditation-config', 'not json');

      expect(loadMeditationConfig()).toBe(10);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
