import { useState, useCallback, useEffect, useRef } from 'react';

interface UseRestTimerOptions {
  targetSeconds: number;
  initialElapsed?: number;
  onComplete?: () => void;
}

interface UseRestTimerReturn {
  elapsedSeconds: number;
  targetSeconds: number;
  isRunning: boolean;
  isComplete: boolean;
  isDismissed: boolean;
  start: () => void;
  pause: () => void;
  reset: () => void;
  dismiss: () => void;
}

/**
 * Hook for managing a rest timer that counts up to a target time.
 *
 * @param options - Timer configuration
 * @param options.targetSeconds - The target rest time in seconds
 * @param options.initialElapsed - Optional initial elapsed time (for restoring state)
 * @param options.onComplete - Callback fired when timer reaches target
 * @returns Timer state and control functions
 */
export function useRestTimer({
  targetSeconds,
  initialElapsed = 0,
  onComplete,
}: UseRestTimerOptions): UseRestTimerReturn {
  // Handle case where initial elapsed is >= target
  const clampedInitial = Math.min(initialElapsed, targetSeconds);
  const isInitiallyComplete = initialElapsed >= targetSeconds;

  const [elapsedSeconds, setElapsedSeconds] = useState(clampedInitial);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(isInitiallyComplete);
  const [isDismissed, setIsDismissed] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteCalledRef = useRef(isInitiallyComplete);

  const clearTimer = useCallback((): void => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback((): void => {
    if (isDismissed || isComplete) return;
    setIsRunning(true);
  }, [isDismissed, isComplete]);

  const pause = useCallback((): void => {
    setIsRunning(false);
    clearTimer();
  }, [clearTimer]);

  const reset = useCallback((): void => {
    clearTimer();
    setElapsedSeconds(0);
    setIsRunning(false);
    setIsComplete(false);
    setIsDismissed(false);
    onCompleteCalledRef.current = false;
  }, [clearTimer]);

  const dismiss = useCallback((): void => {
    clearTimer();
    setIsRunning(false);
    setIsDismissed(true);
  }, [clearTimer]);

  useEffect(() => {
    if (isRunning && !isComplete) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= targetSeconds) {
            setIsComplete(true);
            setIsRunning(false);
            if (!onCompleteCalledRef.current) {
              onCompleteCalledRef.current = true;
              onComplete?.();
            }
            return targetSeconds;
          }
          return next;
        });
      }, 1000);
    }

    return clearTimer;
  }, [isRunning, isComplete, targetSeconds, onComplete, clearTimer]);

  return {
    elapsedSeconds,
    targetSeconds,
    isRunning,
    isComplete,
    isDismissed,
    start,
    pause,
    reset,
    dismiss,
  };
}
