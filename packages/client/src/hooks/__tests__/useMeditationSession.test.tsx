import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeditationSession } from '../useMeditationSession';
import type { MeditationManifest } from '@brad-os/shared';

// Mock audio module
vi.mock('../../utils/meditationAudio', () => ({
  playMeditationNarration: vi.fn().mockResolvedValue(undefined),
  playMeditationBell: vi.fn().mockResolvedValue(undefined),
  stopMeditationNarration: vi.fn(),
  startMeditationKeepalive: vi.fn(),
  stopMeditationKeepalive: vi.fn(),
  setMeditationMediaSessionMetadata: vi.fn(),
  setMeditationMediaSessionPlaybackState: vi.fn(),
  setMeditationMediaSessionCallbacks: vi.fn(),
  stopAllMeditationAudio: vi.fn(),
  MeditationAudioPlaybackError: class extends Error {
    constructor(
      message: string,
      public readonly clipPath: string
    ) {
      super(message);
    }
  },
}));

// Mock storage module
vi.mock('../../utils/meditationStorage', () => ({
  saveMeditationState: vi.fn(),
  loadMeditationState: vi.fn().mockReturnValue(null),
  clearMeditationState: vi.fn(),
  isMeditationSessionStale: vi.fn().mockReturnValue(false),
}));

const mockManifest: MeditationManifest = {
  sessions: [
    {
      id: 'basic-breathing',
      name: 'Basic Breathing',
      description: 'A gentle breathing meditation.',
      variants: [
        {
          durationMinutes: 5,
          phases: [
            {
              type: 'intro',
              durationSeconds: 30,
              fixedCues: [
                { atSeconds: 0, audioFile: 'sessions/basic-breathing/intro.wav' },
              ],
            },
            {
              type: 'breathing',
              durationSeconds: 240,
              fixedCues: [],
              interjectionWindows: [],
            },
            {
              type: 'closing',
              durationSeconds: 30,
              fixedCues: [],
            },
          ],
        },
        {
          durationMinutes: 10,
          phases: [
            {
              type: 'intro',
              durationSeconds: 60,
              fixedCues: [],
            },
            {
              type: 'breathing',
              durationSeconds: 480,
              fixedCues: [],
            },
            {
              type: 'closing',
              durationSeconds: 60,
              fixedCues: [],
            },
          ],
        },
      ],
    },
  ],
  shared: {
    bell: 'shared/bell.wav',
    silence: 'shared/silence-1s.wav',
  },
};

describe('useMeditationSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should start with idle status', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      expect(result.current.status).toBe('idle');
    });

    it('should have default 10 minute duration', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      expect(result.current.durationMinutes).toBe(10);
    });

    it('should have no current phase when idle', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      expect(result.current.currentPhase).toBeNull();
    });

    it('should not have a saved session initially', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      expect(result.current.hasSavedSession).toBe(false);
    });
  });

  describe('start', () => {
    it('should transition to active status when started', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      expect(result.current.status).toBe('active');
    });

    it('should set the selected duration', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      expect(result.current.durationMinutes).toBe(5);
    });

    it('should calculate total seconds from variant', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      // 5 min = 30 + 240 + 30 = 300 seconds
      expect(result.current.totalSeconds).toBe(300);
    });

    it('should not start without manifest', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: null })
      );

      act(() => {
        result.current.start(5);
      });

      expect(result.current.status).toBe('idle');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Cannot start session: manifest not loaded'
      );
    });
  });

  describe('pause / resume', () => {
    it('should pause an active session', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      act(() => {
        result.current.pause();
      });

      expect(result.current.status).toBe('paused');
    });

    it('should resume a paused session', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      act(() => {
        result.current.pause();
      });

      act(() => {
        result.current.resume();
      });

      expect(result.current.status).toBe('active');
    });

    it('should preserve elapsed time across pause/resume', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      // Advance 10 seconds
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      const elapsedBeforePause = result.current.elapsedSeconds;

      act(() => {
        result.current.pause();
      });

      // Advance 5 more seconds while paused
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      act(() => {
        result.current.resume();
      });

      // Elapsed should be similar to before pause (not including paused time)
      expect(result.current.elapsedSeconds).toBeCloseTo(elapsedBeforePause, 0);
    });
  });

  describe('end', () => {
    it('should reset to idle state', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      act(() => {
        result.current.end();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.elapsedSeconds).toBe(0);
    });
  });

  describe('timer', () => {
    it('should count elapsed seconds', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      expect(result.current.elapsedSeconds).toBe(0);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.elapsedSeconds).toBeGreaterThanOrEqual(4);
    });

    it('should calculate remaining seconds correctly', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      // Total is 300 seconds
      expect(result.current.remainingSeconds).toBe(300);

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.remainingSeconds).toBeLessThanOrEqual(291);
    });
  });

  describe('phase tracking', () => {
    it('should identify intro phase at start', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      expect(result.current.currentPhase).toBe('intro');
    });

    it('should transition to breathing phase', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      // Advance past intro phase (30 seconds)
      act(() => {
        vi.advanceTimersByTime(31000);
      });

      expect(result.current.currentPhase).toBe('breathing');
    });
  });

  describe('session name', () => {
    it('should return session name from manifest', () => {
      const { result } = renderHook(() =>
        useMeditationSession({ manifest: mockManifest })
      );

      act(() => {
        result.current.start(5);
      });

      expect(result.current.sessionName).toBe('Basic Breathing');
    });
  });
});
