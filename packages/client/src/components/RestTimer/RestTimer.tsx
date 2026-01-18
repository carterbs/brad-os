import { useCallback, useEffect, useRef } from 'react';
import { Box, Button, Flex, Text } from '@radix-ui/themes';
import { useRestTimer } from '../../hooks/useRestTimer';
import { playRestCompleteBeep } from '../../utils/audio';
import styles from './RestTimer.module.css';

interface RestTimerProps {
  /** Target rest time in seconds */
  targetSeconds: number;
  /** Whether the timer should be visible and running */
  isActive: boolean;
  /** Initial elapsed time (for restoring from storage) */
  initialElapsed?: number;
  /** Disable audio beep on completion */
  muted?: boolean;
  /** Show reset button */
  showReset?: boolean;
  /** Callback when timer is dismissed */
  onDismiss?: () => void;
  /** Callback when timer completes */
  onComplete?: () => void;
}

/**
 * Formats seconds into MM:SS display format.
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats target time for display.
 * Shows seconds only (e.g., "45s") for times under 1 minute,
 * otherwise shows MM:SS format.
 */
function formatTargetTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return secs === 0 ? `${mins}:00` : `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * RestTimer component displays a count-up timer for rest periods.
 * Shows elapsed time, target time, and progress bar.
 * Plays a beep sound when the timer completes (unless muted).
 */
export function RestTimer({
  targetSeconds,
  isActive,
  initialElapsed = 0,
  muted = false,
  showReset = false,
  onDismiss,
  onComplete,
}: RestTimerProps): JSX.Element | null {
  const hasPlayedBeepRef = useRef(false);

  const handleComplete = useCallback((): void => {
    if (!muted && !hasPlayedBeepRef.current) {
      hasPlayedBeepRef.current = true;
      void playRestCompleteBeep();
    }
    onComplete?.();
  }, [muted, onComplete]);

  const {
    elapsedSeconds,
    isRunning,
    isComplete,
    isDismissed,
    start,
    reset,
    dismiss,
  } = useRestTimer({
    targetSeconds,
    initialElapsed,
    onComplete: handleComplete,
  });

  // Auto-start when active
  useEffect(() => {
    if (isActive && !isRunning && !isComplete && !isDismissed) {
      start();
    }
  }, [isActive, isRunning, isComplete, isDismissed, start]);

  // Reset beep ref when timer is reset
  useEffect(() => {
    if (!isComplete) {
      hasPlayedBeepRef.current = false;
    }
  }, [isComplete]);

  if (!isActive) {
    return null;
  }

  const progress = Math.min((elapsedSeconds / targetSeconds) * 100, 100);

  const handleDismiss = (): void => {
    dismiss();
    onDismiss?.();
  };

  const handleReset = (): void => {
    reset();
    hasPlayedBeepRef.current = false;
    // Timer will auto-start via the useEffect
  };

  return (
    <Box
      className={`${styles['container']} ${isComplete ? styles['complete'] : ''}`}
      role="timer"
      aria-label="Rest timer"
      data-testid="rest-timer"
    >
      <Flex direction="column" align="center" gap="3">
        <Flex align="baseline" gap="2">
          <Text size="7" weight="bold" className={styles['elapsed']}>
            {formatTime(elapsedSeconds)}
          </Text>
          <Text size="4" color="gray">
            /
          </Text>
          <Text size="4" color="gray">
            {formatTargetTime(targetSeconds)}
          </Text>
        </Flex>

        <Box
          className={styles['progressContainer']}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <Box
            className={`${styles['progressBar']} ${isComplete ? styles['progressComplete'] : ''}`}
            style={{ width: `${progress}%` }}
          />
        </Box>

        {isComplete && (
          <Text
            size="3"
            weight="medium"
            className={styles['completeText']}
            data-testid="rest-complete-indicator"
          >
            Rest Complete
          </Text>
        )}

        <Flex gap="2">
          {showReset && (
            <Button
              variant="soft"
              color="gray"
              onClick={handleReset}
              aria-label="Reset timer"
              data-testid="reset-timer-button"
            >
              Reset
            </Button>
          )}
          <Button
            variant="solid"
            onClick={handleDismiss}
            aria-label="Dismiss timer"
            data-testid="dismiss-timer-button"
          >
            Dismiss
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
