import { useState, useEffect, useCallback } from 'react';
import { AlertDialog, Box, Button, Flex, Heading, Text, Badge, Card } from '@radix-ui/themes';
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
  onSetUnlogged: (setId: number) => void;
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

function formatCompletedAt(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
  onSetUnlogged,
  onWorkoutStarted,
  onWorkoutCompleted,
  onWorkoutSkipped,
  isStarting = false,
  isCompleting = false,
  isSkipping = false,
}: WorkoutViewProps): JSX.Element {
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  // Track the active exercise (the one the user is currently working on)
  // Defaults to the first exercise, updates when user logs a set
  const [activeExerciseId, setActiveExerciseId] = useState<number | null>(
    workout.exercises[0]?.exercise_id ?? null
  );

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

  // Find the active set: first pending set in the active exercise
  const activeSetId = ((): number | null => {
    const activeExercise = workout.exercises.find(
      (ex) => ex.exercise_id === activeExerciseId
    );
    if (activeExercise) {
      const pendingSet = activeExercise.sets.find((s) => s.status === 'pending');
      if (pendingSet) {
        return pendingSet.id;
      }
    }
    return null;
  })();

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

  // Wrapper for onSetLogged that starts the timer and updates active exercise
  const handleSetLogged = useCallback(
    (setId: number, data: LogWorkoutSetInput): void => {
      // Find the exercise that contains this set
      const exercise = workout.exercises.find((ex) =>
        ex.sets.some((s) => s.id === setId)
      );

      if (exercise) {
        // Update active exercise to the one where the set was logged
        setActiveExerciseId(exercise.exercise_id);

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
            {workout.status === 'completed' && workout.completed_at !== null ? (
              <Text size="2" color="gray" data-testid="completed-at">
                Completed {formatCompletedAt(workout.completed_at)}
              </Text>
            ) : (
              <Text size="2" color="gray">
                {formatDate(workout.scheduled_date)}
              </Text>
            )}
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
            activeSetId={activeSetId}
            onSetLogged={handleSetLogged}
            onSetUnlogged={onSetUnlogged}
          />
        ))}
      </Flex>

      {/* Complete confirmation dialog */}
      <AlertDialog.Root open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
        <AlertDialog.Content maxWidth="400px" data-testid="confirm-dialog">
          <AlertDialog.Title>Complete Workout?</AlertDialog.Title>
          <AlertDialog.Description>
            <Text size="3" color="gray" as="p">
              You have {pendingSetsCount} set{pendingSetsCount !== 1 ? 's' : ''} not
              logged. They will remain as pending. Are you sure you want to
              complete this workout?
            </Text>
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
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
      </AlertDialog.Root>

      {/* Skip confirmation dialog */}
      <AlertDialog.Root open={showSkipConfirm} onOpenChange={setShowSkipConfirm}>
        <AlertDialog.Content maxWidth="400px" data-testid="confirm-dialog">
          <AlertDialog.Title>Skip Workout?</AlertDialog.Title>
          <AlertDialog.Description>
            <Text size="3" color="gray" as="p">
              Are you sure you want to skip this workout? All pending sets will
              be marked as skipped. Any logged sets will be preserved.
            </Text>
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
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
      </AlertDialog.Root>
    </Flex>
  );
}
