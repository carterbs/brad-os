/**
 * Stretch Session Hook
 *
 * Core state machine for managing a stretching session with:
 * - Segment-based timer (2 segments per stretch)
 * - Narration triggers at stretch start and segment boundary
 * - Skip controls (segment and stretch level)
 * - Session state persistence for crash recovery
 * - Timestamp-based timer for background tab support
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  StretchSessionState,
  StretchSessionConfig,
  SelectedStretch,
  StretchManifest,
  CompletedStretch,
} from '@lifting/shared';
import { BODY_REGION_LABELS, PAUSE_TIMEOUT_MS } from '@lifting/shared';
import {
  playNarration,
  startKeepalive,
  stopKeepalive,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionCallbacks,
  stopAllAudio,
  AudioPlaybackError,
} from '../utils/stretchAudio';
import { selectRandomStretches } from '../utils/stretchData';
import {
  saveStretchState,
  loadStretchState,
  clearStretchState,
  isSessionStale,
} from '../utils/stretchStorage';

export interface UseStretchSessionOptions {
  config: StretchSessionConfig;
  manifest: StretchManifest | null;
}

export interface AudioErrorState {
  clipPath: string;
  message: string;
}

export interface UseStretchSessionReturn {
  // State
  status: StretchSessionState['status'];
  currentStretch: SelectedStretch | null;
  currentStretchIndex: number;
  currentSegment: 1 | 2;
  segmentRemaining: number; // Seconds remaining in current segment
  totalStretches: number;
  audioError: AudioErrorState | null;

  // Recovery state
  hasSavedSession: boolean;

  // Actions
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  skipSegment: () => void;
  skipStretch: () => void;
  end: () => void;

  // Recovery actions
  resumeSavedSession: () => void;
  discardSavedSession: () => void;

  // Audio error actions
  retryAudio: () => Promise<void>;
  skipAudio: () => void;

  // Completion data
  completedStretches: CompletedStretch[];
  sessionStartedAt: number | null;
}

function getInitialState(): StretchSessionState {
  return {
    status: 'idle',
    currentStretchIndex: 0,
    currentSegment: 1,
    segmentStartedAt: null,
    pausedAt: null,
    pausedElapsed: 0,
    selectedStretches: [],
  };
}

export function useStretchSession({
  config,
  manifest,
}: UseStretchSessionOptions): UseStretchSessionReturn {
  const [state, setState] = useState<StretchSessionState>(getInitialState);
  const [segmentRemaining, setSegmentRemaining] = useState(0);
  const [audioError, setAudioError] = useState<AudioErrorState | null>(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [completedStretches, setCompletedStretches] = useState<CompletedStretch[]>([]);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingNarrationRef = useRef<string | null>(null);
  const skippedSegmentsRef = useRef<Map<number, number>>(new Map());

  // Current stretch helper
  const currentStretch =
    state.status !== 'idle' && state.selectedStretches[state.currentStretchIndex] !== undefined
      ? state.selectedStretches[state.currentStretchIndex] ?? null
      : null;

  const totalStretches = state.selectedStretches.length;

  // Clear interval helper
  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Calculate remaining seconds for current segment
  const calculateRemaining = useCallback((): number => {
    if (state.segmentStartedAt === null || currentStretch === null) {
      return state.pausedElapsed > 0
        ? currentStretch?.segmentDuration ?? 0 - state.pausedElapsed
        : currentStretch?.segmentDuration ?? 0;
    }

    const elapsed = Math.floor((Date.now() - state.segmentStartedAt) / 1000);
    const remaining = Math.max(0, currentStretch.segmentDuration - elapsed);
    return remaining;
  }, [state.segmentStartedAt, state.pausedElapsed, currentStretch]);

  // Play narration with error handling
  const playNarrationSafe = useCallback(
    async (clipPath: string): Promise<boolean> => {
      pendingNarrationRef.current = clipPath;
      try {
        await playNarration(clipPath);
        pendingNarrationRef.current = null;
        return true;
      } catch (error) {
        if (error instanceof AudioPlaybackError) {
          setAudioError({
            clipPath: error.clipPath,
            message: error.message,
          });
          return false;
        }
        throw error;
      }
    },
    []
  );

  // Advance to next segment or stretch
  const advanceSegment = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'active') return prev;

      const stretch = prev.selectedStretches[prev.currentStretchIndex];
      if (stretch === undefined) return prev;

      if (prev.currentSegment === 1) {
        // Move to segment 2
        return {
          ...prev,
          currentSegment: 2,
          segmentStartedAt: Date.now(),
          pausedElapsed: 0,
        };
      } else {
        // Move to next stretch
        const nextIndex = prev.currentStretchIndex + 1;

        if (nextIndex >= prev.selectedStretches.length) {
          // Session complete
          return {
            ...prev,
            status: 'complete',
            segmentStartedAt: null,
          };
        }

        return {
          ...prev,
          currentStretchIndex: nextIndex,
          currentSegment: 1,
          segmentStartedAt: Date.now(),
          pausedElapsed: 0,
        };
      }
    });
  }, []);

  // Handle segment completion
  const handleSegmentComplete = useCallback(async (): Promise<void> => {
    if (currentStretch === null) return;

    clearTimer();

    if (state.currentSegment === 1) {
      // Play transition narration
      const clipPath = currentStretch.stretch.bilateral
        ? 'shared/switch-sides.wav'
        : 'shared/halfway.wav';

      const success = await playNarrationSafe(clipPath);
      if (success === false) {
        // Audio error - state machine paused, waiting for retry/skip
        return;
      }

      // Advance to segment 2
      advanceSegment();

      // Update MediaSession
      setMediaSessionMetadata(
        currentStretch.stretch.name,
        BODY_REGION_LABELS[currentStretch.region],
        2
      );
    } else {
      // Record completed stretch
      const skipped = skippedSegmentsRef.current.get(state.currentStretchIndex) ?? 0;
      setCompletedStretches((prev) => [
        ...prev,
        {
          region: currentStretch.region,
          stretchId: currentStretch.stretch.id,
          stretchName: currentStretch.stretch.name,
          durationSeconds: currentStretch.durationSeconds,
          skippedSegments: skipped,
        },
      ]);

      // Check if this was the last stretch
      const nextIndex = state.currentStretchIndex + 1;
      if (nextIndex >= state.selectedStretches.length) {
        // Play completion narration
        await playNarrationSafe('shared/session-complete.wav');

        setState((prev) => ({
          ...prev,
          status: 'complete',
          segmentStartedAt: null,
        }));

        stopKeepalive();
        setMediaSessionPlaybackState('none');
        clearStretchState();
        return;
      }

      // Advance to next stretch
      advanceSegment();

      // Get the new current stretch and play its narration
      const nextStretch = state.selectedStretches[nextIndex];
      if (nextStretch === undefined) {
        return;
      }
      const success = await playNarrationSafe(nextStretch.stretch.audioFiles.begin);
      if (success === false) {
        return;
      }

      setMediaSessionMetadata(
        nextStretch.stretch.name,
        BODY_REGION_LABELS[nextStretch.region],
        1
      );
    }
  }, [
    currentStretch,
    state.currentSegment,
    state.currentStretchIndex,
    state.selectedStretches,
    clearTimer,
    playNarrationSafe,
    advanceSegment,
  ]);

  // Start a new session
  const start = useCallback(async (): Promise<void> => {
    if (manifest === null) {
      console.warn('Cannot start session: manifest not loaded');
      return;
    }

    // Select random stretches
    const selectedStretches = selectRandomStretches(config, manifest);

    if (selectedStretches.length === 0) {
      console.warn('Cannot start session: no stretches selected');
      return;
    }

    const now = Date.now();
    setSessionStartedAt(now);
    setCompletedStretches([]);
    skippedSegmentsRef.current.clear();

    const newState: StretchSessionState = {
      status: 'active',
      currentStretchIndex: 0,
      currentSegment: 1,
      segmentStartedAt: now,
      pausedAt: null,
      pausedElapsed: 0,
      selectedStretches,
    };

    setState(newState);
    saveStretchState(newState);

    // Start keepalive for background playback
    startKeepalive();
    setMediaSessionPlaybackState('playing');

    // Play first stretch narration
    const firstStretch = selectedStretches[0];
    if (firstStretch === undefined) {
      return;
    }
    const success = await playNarrationSafe(firstStretch.stretch.audioFiles.begin);
    if (success === false) {
      return;
    }

    setMediaSessionMetadata(
      firstStretch.stretch.name,
      BODY_REGION_LABELS[firstStretch.region],
      1
    );
  }, [manifest, config, playNarrationSafe]);

  // Pause the session
  const pause = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'active') return prev;

      const elapsed =
        prev.segmentStartedAt !== null
          ? Math.floor((Date.now() - prev.segmentStartedAt) / 1000)
          : prev.pausedElapsed;

      const newState: StretchSessionState = {
        ...prev,
        status: 'paused',
        pausedAt: Date.now(),
        pausedElapsed: elapsed,
        segmentStartedAt: null,
      };

      saveStretchState(newState);
      return newState;
    });

    clearTimer();
    setMediaSessionPlaybackState('paused');
  }, [clearTimer]);

  // Resume the session
  const resume = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'paused') return prev;

      // Calculate new startedAt to account for elapsed time
      const startedAt = Date.now() - prev.pausedElapsed * 1000;

      const newState: StretchSessionState = {
        ...prev,
        status: 'active',
        segmentStartedAt: startedAt,
        pausedAt: null,
      };

      saveStretchState(newState);
      return newState;
    });

    setMediaSessionPlaybackState('playing');
  }, []);

  // Skip current segment
  const skipSegment = useCallback(() => {
    // Record the skip
    skippedSegmentsRef.current.set(
      state.currentStretchIndex,
      (skippedSegmentsRef.current.get(state.currentStretchIndex) ?? 0) + 1
    );

    // Trigger segment completion
    void handleSegmentComplete();
  }, [state.currentStretchIndex, handleSegmentComplete]);

  // Skip entire stretch
  const skipStretch = useCallback(() => {
    // Record both segments as skipped
    skippedSegmentsRef.current.set(state.currentStretchIndex, 2);

    setState((prev) => {
      if (prev.status !== 'active' && prev.status !== 'paused') return prev;

      const nextIndex = prev.currentStretchIndex + 1;

      if (nextIndex >= prev.selectedStretches.length) {
        // This was the last stretch - complete the session
        return {
          ...prev,
          status: 'complete',
          segmentStartedAt: null,
        };
      }

      const newState: StretchSessionState = {
        ...prev,
        status: 'active',
        currentStretchIndex: nextIndex,
        currentSegment: 1,
        segmentStartedAt: Date.now(),
        pausedElapsed: 0,
        pausedAt: null,
      };

      saveStretchState(newState);
      return newState;
    });
  }, [state.currentStretchIndex]);

  // End session early
  const end = useCallback(() => {
    clearTimer();
    stopAllAudio();
    clearStretchState();
    setState(getInitialState());
    setCompletedStretches([]);
    setSessionStartedAt(null);
    skippedSegmentsRef.current.clear();
  }, [clearTimer]);

  // Resume a saved session
  const resumeSavedSession = useCallback((): void => {
    const saved = loadStretchState();
    if (saved === null) return;

    // Resume from paused state
    const startedAt = Date.now() - saved.pausedElapsed * 1000;
    const newState: StretchSessionState = {
      ...saved,
      status: 'active',
      segmentStartedAt: startedAt,
      pausedAt: null,
    };

    setState(newState);
    saveStretchState(newState);
    setHasSavedSession(false);

    startKeepalive();
    setMediaSessionPlaybackState('playing');
  }, []);

  // Discard a saved session
  const discardSavedSession = useCallback(() => {
    clearStretchState();
    setHasSavedSession(false);
  }, []);

  // Retry failed audio
  const retryAudio = useCallback(async (): Promise<void> => {
    if (pendingNarrationRef.current === null) return;

    setAudioError(null);
    const success = await playNarrationSafe(pendingNarrationRef.current);
    if (success) {
      // Continue where we left off
      // The state machine will pick up from here
    }
  }, [playNarrationSafe]);

  // Skip failed audio and continue
  const skipAudio = useCallback(() => {
    setAudioError(null);
    pendingNarrationRef.current = null;

    // Resume the timer
    setState((prev) => ({
      ...prev,
      segmentStartedAt: Date.now() - prev.pausedElapsed * 1000,
    }));
  }, []);

  // Check for saved session on mount
  useEffect(() => {
    const saved = loadStretchState();
    if (saved !== null && saved.status !== 'idle' && saved.status !== 'complete') {
      if (isSessionStale(saved)) {
        // Silently discard stale sessions
        clearStretchState();
      } else {
        setHasSavedSession(true);
      }
    }
  }, []);

  // Main timer effect
  useEffect(() => {
    if (state.status === 'active' && audioError === null) {
      intervalRef.current = setInterval(() => {
        const remaining = calculateRemaining();
        setSegmentRemaining(remaining);

        if (remaining <= 0) {
          void handleSegmentComplete();
        }
      }, 100); // Update frequently for smooth countdown

      return clearTimer;
    }
    return undefined;
  }, [state.status, audioError, calculateRemaining, handleSegmentComplete, clearTimer]);

  // Visibility change handler for background recovery
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && state.status === 'active') {
        const remaining = calculateRemaining();
        setSegmentRemaining(remaining);

        if (remaining <= 0) {
          void handleSegmentComplete();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return (): void => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.status, calculateRemaining, handleSegmentComplete]);

  // Pause timeout effect
  useEffect(() => {
    if (state.status === 'paused' && state.pausedAt !== null) {
      const pausedAtValue = state.pausedAt;
      const checkTimeout = (): void => {
        if (Date.now() - pausedAtValue > PAUSE_TIMEOUT_MS) {
          // Auto-end the session
          end();
        }
      };

      const timeoutId = setInterval(checkTimeout, 60000); // Check every minute
      return (): void => { clearInterval(timeoutId); };
    }
    return undefined;
  }, [state.status, state.pausedAt, end]);

  // Persist state changes
  useEffect(() => {
    if (state.status !== 'idle') {
      saveStretchState(state);
    }
  }, [state]);

  // Set up MediaSession callbacks
  useEffect(() => {
    setMediaSessionCallbacks({
      onPause: pause,
      onPlay: resume,
      onNext: skipSegment,
    });
  }, [pause, resume, skipSegment]);

  return {
    status: state.status,
    currentStretch,
    currentStretchIndex: state.currentStretchIndex,
    currentSegment: state.currentSegment,
    segmentRemaining,
    totalStretches,
    audioError,
    hasSavedSession,
    start,
    pause,
    resume,
    skipSegment,
    skipStretch,
    end,
    resumeSavedSession,
    discardSavedSession,
    retryAudio,
    skipAudio,
    completedStretches,
    sessionStartedAt,
  };
}
