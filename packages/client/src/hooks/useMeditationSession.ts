/**
 * Meditation Session Hook
 *
 * Core state machine for managing a meditation session with:
 * - Cue-based narration triggering
 * - Bell sounds at start and end
 * - Randomized interjection timing
 * - Session state persistence for crash recovery
 * - Timestamp-based timer for background tab support
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  MeditationSessionState,
  MeditationDuration,
  MeditationManifest,
} from '@brad-os/shared';
import { MEDITATION_PAUSE_TIMEOUT_MS } from '@brad-os/shared';
import {
  playMeditationNarration,
  playMeditationBell,
  stopMeditationNarration,
  startMeditationKeepalive,
  stopMeditationKeepalive,
  setMeditationMediaSessionMetadata,
  setMeditationMediaSessionPlaybackState,
  setMeditationMediaSessionCallbacks,
  stopAllMeditationAudio,
  MeditationAudioPlaybackError,
} from '../utils/meditationAudio';
import {
  getSessionVariant,
  generateScheduledCues,
  getVariantTotalSeconds,
  getSessionDefinition,
} from '../utils/meditationData';
import {
  saveMeditationState,
  loadMeditationState,
  clearMeditationState,
  isMeditationSessionStale,
} from '../utils/meditationStorage';

const DEFAULT_SESSION_TYPE = 'basic-breathing';

export interface UseMeditationSessionOptions {
  manifest: MeditationManifest | null;
}

export interface AudioErrorState {
  clipPath: string;
  message: string;
}

export interface UseMeditationSessionReturn {
  // State
  status: MeditationSessionState['status'];
  durationMinutes: MeditationDuration;
  sessionType: string;
  sessionName: string;
  elapsedSeconds: number;
  totalSeconds: number;
  remainingSeconds: number;
  currentPhase: 'intro' | 'breathing' | 'closing' | null;
  audioError: AudioErrorState | null;

  // Recovery state
  hasSavedSession: boolean;

  // Actions
  start: (duration: MeditationDuration) => void;
  pause: () => void;
  resume: () => void;
  end: () => void;

  // Recovery actions
  resumeSavedSession: () => void;
  discardSavedSession: () => void;

  // Audio error actions
  retryAudio: () => Promise<void>;
  skipAudio: () => void;

  // Completion data
  completedFully: boolean;
  sessionStartedAt: number | null;
}

function getInitialState(): MeditationSessionState {
  return {
    status: 'idle',
    sessionType: DEFAULT_SESSION_TYPE,
    durationMinutes: 10,
    sessionStartedAt: null,
    pausedAt: null,
    pausedElapsed: 0,
    scheduledCues: [],
    currentPhaseIndex: 0,
  };
}

export function useMeditationSession({
  manifest,
}: UseMeditationSessionOptions): UseMeditationSessionReturn {
  const [state, setState] = useState<MeditationSessionState>(getInitialState);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioError, setAudioError] = useState<AudioErrorState | null>(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [completedFully, setCompletedFully] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingNarrationRef = useRef<string | null>(null);
  const isPlayingCueRef = useRef(false);

  // Get current variant info
  const variant =
    manifest !== null
      ? getSessionVariant(manifest, state.sessionType, state.durationMinutes)
      : undefined;

  const totalSeconds = variant !== undefined ? getVariantTotalSeconds(variant) : 0;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

  // Calculate current phase
  const getCurrentPhase = useCallback((): 'intro' | 'breathing' | 'closing' | null => {
    if (variant === undefined || state.status === 'idle') return null;

    let phaseStart = 0;
    for (const phase of variant.phases) {
      const phaseEnd = phaseStart + phase.durationSeconds;
      if (elapsedSeconds < phaseEnd) {
        return phase.type;
      }
      phaseStart = phaseEnd;
    }
    return 'closing';
  }, [variant, state.status, elapsedSeconds]);

  const currentPhase = getCurrentPhase();

  // Get session name
  const sessionDef =
    manifest !== null ? getSessionDefinition(manifest, state.sessionType) : undefined;
  const sessionName = sessionDef?.name ?? 'Meditation';

  // Clear interval helper
  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Calculate elapsed seconds from timestamp
  const calculateElapsed = useCallback((): number => {
    if (state.sessionStartedAt === null) {
      return state.pausedElapsed;
    }

    const elapsed = Math.floor((Date.now() - state.sessionStartedAt) / 1000);
    return elapsed;
  }, [state.sessionStartedAt, state.pausedElapsed]);

  // Play narration with error handling
  const playNarrationSafe = useCallback(
    async (clipPath: string): Promise<boolean> => {
      pendingNarrationRef.current = clipPath;
      try {
        await playMeditationNarration(clipPath);
        pendingNarrationRef.current = null;
        return true;
      } catch (error) {
        if (error instanceof MeditationAudioPlaybackError) {
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

  // Process cues that should have played by now
  const processCues = useCallback(
    async (currentElapsed: number): Promise<void> => {
      if (isPlayingCueRef.current) return;

      const cuesToPlay = state.scheduledCues.filter(
        (cue) => !cue.played && cue.atSeconds <= currentElapsed
      );

      if (cuesToPlay.length === 0) return;

      console.log(`[MeditationSession] Processing ${cuesToPlay.length} cue(s) at ${currentElapsed}s`);
      isPlayingCueRef.current = true;

      // Play each cue that needs to be played
      for (const cue of cuesToPlay) {
        console.log(`[MeditationSession] Triggering cue: ${cue.audioFile} (scheduled at ${cue.atSeconds}s)`);
        const success = await playNarrationSafe(cue.audioFile);

        // Mark as played regardless of success (to avoid infinite retry)
        setState((prev) => ({
          ...prev,
          scheduledCues: prev.scheduledCues.map((c) =>
            c.atSeconds === cue.atSeconds && c.audioFile === cue.audioFile
              ? { ...c, played: true }
              : c
          ),
        }));

        if (!success) {
          isPlayingCueRef.current = false;
          return; // Stop on error
        }
      }

      isPlayingCueRef.current = false;
    },
    [state.scheduledCues, playNarrationSafe]
  );

  // Handle session completion
  const handleSessionComplete = useCallback(
    (wasFullyCompleted: boolean): void => {
      clearTimer();
      setCompletedFully(wasFullyCompleted);

      if (wasFullyCompleted) {
        // Play closing bell (fire and forget - don't block completion)
        playMeditationBell().catch(() => {
          // Ignore bell error at end
        });
      }

      setState((prev) => ({
        ...prev,
        status: 'complete',
      }));

      stopMeditationKeepalive();
      setMeditationMediaSessionPlaybackState('none');
      clearMeditationState();
    },
    [clearTimer]
  );

  // Start a new session
  const start = useCallback(
    (duration: MeditationDuration): void => {
      if (manifest === null) {
        console.warn('Cannot start session: manifest not loaded');
        return;
      }

      const sessionVariant = getSessionVariant(manifest, DEFAULT_SESSION_TYPE, duration);
      if (sessionVariant === undefined) {
        console.warn('Cannot start session: variant not found');
        return;
      }

      // Generate randomized cue schedule
      const scheduledCues = generateScheduledCues(sessionVariant);
      console.log('[MeditationSession] Starting session with cues:', scheduledCues.map(c => `${c.atSeconds}s: ${c.audioFile}`));

      const now = Date.now();
      setCompletedFully(false);

      const newState: MeditationSessionState = {
        status: 'active',
        sessionType: DEFAULT_SESSION_TYPE,
        durationMinutes: duration,
        sessionStartedAt: now,
        pausedAt: null,
        pausedElapsed: 0,
        scheduledCues,
        currentPhaseIndex: 0,
      };

      setState(newState);
      saveMeditationState(newState);

      // Start keepalive for background playback
      startMeditationKeepalive();
      setMeditationMediaSessionPlaybackState('playing');
      setMeditationMediaSessionMetadata(sessionName, 'Introduction');

      // Note: First cues will be picked up by the timer
      // Bell only plays at session end, not at start
    },
    [manifest, sessionName]
  );

  // Pause the session
  const pause = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'active') return prev;

      const elapsed =
        prev.sessionStartedAt !== null
          ? Math.floor((Date.now() - prev.sessionStartedAt) / 1000)
          : prev.pausedElapsed;

      const newState: MeditationSessionState = {
        ...prev,
        status: 'paused',
        pausedAt: Date.now(),
        pausedElapsed: elapsed,
        sessionStartedAt: null,
      };

      saveMeditationState(newState);
      return newState;
    });

    clearTimer();
    stopMeditationNarration();
    setMeditationMediaSessionPlaybackState('paused');
  }, [clearTimer]);

  // Resume the session
  const resume = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'paused') return prev;

      // Calculate new startedAt to account for elapsed time
      const startedAt = Date.now() - prev.pausedElapsed * 1000;

      const newState: MeditationSessionState = {
        ...prev,
        status: 'active',
        sessionStartedAt: startedAt,
        pausedAt: null,
      };

      saveMeditationState(newState);
      return newState;
    });

    setMeditationMediaSessionPlaybackState('playing');
  }, []);

  // End session early
  const end = useCallback(() => {
    clearTimer();
    stopAllMeditationAudio();
    clearMeditationState();
    setState(getInitialState());
    setElapsedSeconds(0);
    setCompletedFully(false);
    isPlayingCueRef.current = false;
  }, [clearTimer]);

  // Resume a saved session
  const resumeSavedSession = useCallback((): void => {
    const saved = loadMeditationState();
    if (saved === null) return;

    // Resume from paused state
    const startedAt = Date.now() - saved.pausedElapsed * 1000;
    const newState: MeditationSessionState = {
      ...saved,
      status: 'active',
      sessionStartedAt: startedAt,
      pausedAt: null,
    };

    setState(newState);
    saveMeditationState(newState);
    setHasSavedSession(false);

    startMeditationKeepalive();
    setMeditationMediaSessionPlaybackState('playing');
  }, []);

  // Discard a saved session
  const discardSavedSession = useCallback(() => {
    clearMeditationState();
    setHasSavedSession(false);
  }, []);

  // Retry failed audio
  const retryAudio = useCallback(async (): Promise<void> => {
    if (pendingNarrationRef.current === null) return;

    setAudioError(null);
    await playNarrationSafe(pendingNarrationRef.current);
  }, [playNarrationSafe]);

  // Skip failed audio and continue
  const skipAudio = useCallback(() => {
    setAudioError(null);
    pendingNarrationRef.current = null;
    isPlayingCueRef.current = false;
  }, []);

  // Check for saved session on mount
  useEffect(() => {
    const saved = loadMeditationState();
    if (saved !== null && saved.status !== 'idle' && saved.status !== 'complete') {
      if (isMeditationSessionStale(saved)) {
        // Silently discard stale sessions
        clearMeditationState();
      } else {
        setHasSavedSession(true);
      }
    }
  }, []);

  // Main timer effect
  useEffect(() => {
    if (state.status === 'active' && audioError === null) {
      intervalRef.current = setInterval(() => {
        const currentElapsed = calculateElapsed();
        setElapsedSeconds(currentElapsed);

        // Check if session is complete
        if (currentElapsed >= totalSeconds && totalSeconds > 0) {
          void handleSessionComplete(true);
          return;
        }

        // Process any cues that should play
        void processCues(currentElapsed);
      }, 100); // Update frequently for smooth countdown

      return clearTimer;
    }
    return undefined;
  }, [
    state.status,
    audioError,
    totalSeconds,
    calculateElapsed,
    processCues,
    handleSessionComplete,
    clearTimer,
  ]);

  // Update MediaSession metadata when phase changes
  useEffect(() => {
    if (state.status === 'active' && currentPhase !== null) {
      const phaseLabel =
        currentPhase === 'intro'
          ? 'Introduction'
          : currentPhase === 'breathing'
            ? 'Breathing'
            : 'Closing';
      setMeditationMediaSessionMetadata(sessionName, phaseLabel);
    }
  }, [state.status, currentPhase, sessionName]);

  // Visibility change handler for background recovery
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && state.status === 'active') {
        const currentElapsed = calculateElapsed();
        setElapsedSeconds(currentElapsed);

        if (currentElapsed >= totalSeconds && totalSeconds > 0) {
          void handleSessionComplete(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return (): void => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.status, totalSeconds, calculateElapsed, handleSessionComplete]);

  // Pause timeout effect
  useEffect(() => {
    if (state.status === 'paused' && state.pausedAt !== null) {
      const pausedAtValue = state.pausedAt;
      const checkTimeout = (): void => {
        if (Date.now() - pausedAtValue > MEDITATION_PAUSE_TIMEOUT_MS) {
          // Auto-end the session
          end();
        }
      };

      const timeoutId = setInterval(checkTimeout, 60000); // Check every minute
      return (): void => {
        clearInterval(timeoutId);
      };
    }
    return undefined;
  }, [state.status, state.pausedAt, end]);

  // Persist state changes
  useEffect(() => {
    if (state.status !== 'idle') {
      saveMeditationState(state);
    }
  }, [state]);

  // Set up MediaSession callbacks
  useEffect(() => {
    setMeditationMediaSessionCallbacks({
      onPause: pause,
      onPlay: resume,
    });
  }, [pause, resume]);

  return {
    status: state.status,
    durationMinutes: state.durationMinutes,
    sessionType: state.sessionType,
    sessionName,
    elapsedSeconds,
    totalSeconds,
    remainingSeconds,
    currentPhase,
    audioError,
    hasSavedSession,
    start,
    pause,
    resume,
    end,
    resumeSavedSession,
    discardSavedSession,
    retryAudio,
    skipAudio,
    completedFully,
    sessionStartedAt: state.sessionStartedAt,
  };
}
