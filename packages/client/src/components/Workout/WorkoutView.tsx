import { useState, useEffect, useCallback } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Box, Button, Flex, Heading, Text, Badge, Card } from '@radix-ui/themes';
import type { LogWorkoutSetInput } from '@lifting/shared';
import type { WorkoutWithExercises } from '../../api/workoutApi';
import { ExerciseCard } from './ExerciseCard';
import { RestTimer } from '../RestTimer';
import {
  saveTimerState,
  loadTimerState,
  clearTimerState,
  calculateElapsedSeconds,
  type TimerState,
} from '../../utils/timerStorage';

interface WorkoutViewProps {
  workout: WorkoutWithExercises;
  onSetLogged: (setId: number, data: LogWorkoutSetInput) => void;
  onSetSkipped: (setId: number) => void;
  onWorkoutStarted: () => void;
  onWorkoutCompleted: () => void;
  onWorkoutSkipped: () => void;
  isStarting?: boolean;
  isCompleting?: boolean;
  isSkipping?: boolean;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusBadge(status: string): JSX.Element {
  switch (status) {
    case 'pending':
      return (
        <Badge color="blue" data-testid="workout-status">
          Scheduled
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge color="orange" data-testid="workout-status">
          In Progress
        </Badge>
      );
    case 'completed':
      return (
        <Badge color="green" data-testid="workout-status">
          Completed
        </Badge>
      );
    case 'skipped':
      return (
        <Badge color="gray" data-testid="workout-status">
          Skipped
        </Badge>
      );
    default:
      return (
        <Badge color="gray" data-testid="workout-status">
          {status}
        </Badge>
      );
  }
}

export function WorkoutView({
  workout,
  onSetLogged,
  onSetSkipped,
  onWorkoutStarted,
  onWorkoutCompleted,
  onWorkoutSkipped,
  isStarting = false,
  isCompleting = false,
  isSkipping = false,
}: WorkoutViewProps): JSX.Element {
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  // Rest timer state
  const [activeTimer, setActiveTimer] = useState<{
    exerciseId: number;
    setIndex: number;
    targetSeconds: number;
    initialElapsed: number;
  } | null>(null);

  const isDisabled =
    workout.status === 'completed' || workout.status === 'skipped';
  const canStart = workout.status === 'pending';
  const canComplete = workout.status === 'in_progress';

  // Count pending sets for confirmation dialog
  const pendingSetsCount = workout.exercises.reduce(
    (count, ex) => count + ex.sets.filter((s) => s.status === 'pending').length,
    0
  );

  // Restore timer state from localStorage on mount
  useEffect(() => {
    const savedState = loadTimerState();
    if (savedState) {
      const elapsed = calculateElapsedSeconds(savedState.startedAt);
      if (elapsed < savedState.targetSeconds) {
        setActiveTimer({
          exerciseId: savedState.exerciseId,
          setIndex: savedState.setIndex,
          targetSeconds: savedState.targetSeconds,
          initialElapsed: elapsed,
        });
      } else {
        // Timer has expired, clear it
        clearTimerState();
      }
    }
  }, []);

  // Clear timer when workout is completed or skipped
  useEffect(() => {
    if (isDisabled) {
      clearTimerState();
      setActiveTimer(null);
    }
  }, [isDisabled]);

  // Handler for timer dismiss
  const handleTimerDismiss = useCallback((): void => {
    clearTimerState();
    setActiveTimer(null);
  }, []);

  // Wrapper for onSetLogged that starts the timer
  const handleSetLogged = useCallback(
    (setId: number, data: LogWorkoutSetInput): void => {
      // Find the exercise that contains this set
      const exercise = workout.exercises.find((ex) =>
        ex.sets.some((s) => s.id === setId)
      );

      if (exercise) {
        const setIndex = exercise.sets.findIndex((s) => s.id === setId);
        const targetSeconds = exercise.rest_seconds || 60; // Default to 60s if not set

        const timerState: TimerState = {
          startedAt: Date.now(),
          targetSeconds,
          exerciseId: exercise.exercise_id,
          setIndex,
        };

        saveTimerState(timerState);
        setActiveTimer({
          exerciseId: exercise.exercise_id,
          setIndex,
          targetSeconds,
          initialElapsed: 0,
        });
      }

      // Call the original handler
      onSetLogged(setId, data);
    },
    [workout.exercises, onSetLogged]
  );

  const handleCompleteClick = (): void => {
    if (pendingSetsCount > 0) {
      setShowCompleteConfirm(true);
    } else {
      onWorkoutCompleted();
    }
  };

  const handleSkipClick = (): void => {
    setShowSkipConfirm(true);
  };

  return (
    <Flex direction="column" gap="4">
      {/* Header */}
      <Card>
        <Flex justify="between" align="center">
          <Box>
            <Heading size="5">{workout.plan_day_name}</Heading>
            <Text size="2" color="gray">
              {formatDate(workout.scheduled_date)}
            </Text>
          </Box>
          {getStatusBadge(workout.status)}
        </Flex>
      </Card>

      {/* Action buttons */}
      {!isDisabled && (
        <Flex gap="3">
          {canStart && (
            <Button
              size="3"
              onClick={onWorkoutStarted}
              disabled={isStarting}
              data-testid="start-workout"
              style={{ flex: 1 }}
            >
              {isStarting ? 'Starting...' : 'Start Workout'}
            </Button>
          )}

          {canComplete && (
            <Button
              size="3"
              color="green"
              onClick={handleCompleteClick}
              disabled={isCompleting}
              data-testid="complete-workout"
              style={{ flex: 1 }}
            >
              {isCompleting ? 'Completing...' : 'Complete Workout'}
            </Button>
          )}

          <Button
            size="3"
            variant="soft"
            color="gray"
            onClick={handleSkipClick}
            disabled={isSkipping}
            data-testid="skip-workout"
          >
            {isSkipping ? 'Skipping...' : 'Skip'}
          </Button>
        </Flex>
      )}

      {/* Rest Timer */}
      {activeTimer && (
        <RestTimer
          targetSeconds={activeTimer.targetSeconds}
          isActive={true}
          initialElapsed={activeTimer.initialElapsed}
          showReset={true}
          onDismiss={handleTimerDismiss}
        />
      )}

      {/* Exercises */}
      <Flex direction="column" gap="4">
        {workout.exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.exercise_id}
            exercise={exercise}
            workoutStatus={workout.status}
            onSetLogged={handleSetLogged}
            onSetSkipped={onSetSkipped}
          />
        ))}
      </Flex>

      {/* Complete confirmation dialog */}
      <AlertDialog.Root open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              position: 'fixed',
              inset: 0,
            }}
          />
          <AlertDialog.Content
            data-testid="confirm-dialog"
            style={{
              backgroundColor: 'var(--color-background)',
              borderRadius: 'var(--radius-3)',
              padding: '24px',
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90vw',
              maxWidth: '400px',
            }}
          >
            <AlertDialog.Title asChild>
              <Text size="5" weight="bold" mb="2" as="h2">
                Complete Workout?
              </Text>
            </AlertDialog.Title>
            <AlertDialog.Description asChild>
              <Text size="3" color="gray" as="p" mb="4">
                You have {pendingSetsCount} set{pendingSetsCount !== 1 ? 's' : ''} not
                logged. They will remain as pending. Are you sure you want to
                complete this workout?
              </Text>
            </AlertDialog.Description>
            <Flex gap="3" justify="end">
              <AlertDialog.Cancel asChild>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  color="green"
                  onClick={onWorkoutCompleted}
                  data-testid="confirm-button"
                >
                  Complete Anyway
                </Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Skip confirmation dialog */}
      <AlertDialog.Root open={showSkipConfirm} onOpenChange={setShowSkipConfirm}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              position: 'fixed',
              inset: 0,
            }}
          />
          <AlertDialog.Content
            data-testid="confirm-dialog"
            style={{
              backgroundColor: 'var(--color-background)',
              borderRadius: 'var(--radius-3)',
              padding: '24px',
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90vw',
              maxWidth: '400px',
            }}
          >
            <AlertDialog.Title asChild>
              <Text size="5" weight="bold" mb="2" as="h2">
                Skip Workout?
              </Text>
            </AlertDialog.Title>
            <AlertDialog.Description asChild>
              <Text size="3" color="gray" as="p" mb="4">
                Are you sure you want to skip this workout? All pending sets will
                be marked as skipped. Any logged sets will be preserved.
              </Text>
            </AlertDialog.Description>
            <Flex gap="3" justify="end">
              <AlertDialog.Cancel asChild>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  color="red"
                  onClick={onWorkoutSkipped}
                  data-testid="confirm-button"
                >
                  Skip Workout
                </Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Flex>
  );
}
