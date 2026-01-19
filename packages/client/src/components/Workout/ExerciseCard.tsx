import { useState } from 'react';
import { Card, Flex, Text, Badge, Box, Button } from '@radix-ui/themes';
import { PlusIcon } from '@radix-ui/react-icons';
import type { WorkoutStatus, LogWorkoutSetInput } from '@lifting/shared';
import type { WorkoutExerciseWithSets } from '../../api/workoutApi';
import type { PendingSetEdit } from '../../hooks/useLocalStorage';
import { SetRow } from './SetRow';

interface ExerciseCardProps {
  exercise: WorkoutExerciseWithSets;
  workoutStatus: WorkoutStatus;
  activeSetId: number | null;
  pendingEdits?: Record<number, PendingSetEdit> | undefined;
  onSetLogged: (setId: number, data: LogWorkoutSetInput) => void;
  onSetUnlogged: (setId: number) => void;
  onAddSet?: (() => void) | undefined;
  onRemoveSet?: (() => void) | undefined;
  onActivate: () => void;
  onPendingEdit?: ((setId: number, data: PendingSetEdit) => void) | undefined;
}

function formatRestTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

export function ExerciseCard({
  exercise,
  workoutStatus,
  activeSetId,
  pendingEdits,
  onSetLogged,
  onSetUnlogged,
  onAddSet,
  onRemoveSet,
  onActivate,
  onPendingEdit,
}: ExerciseCardProps): JSX.Element {
  const completedSets = exercise.sets.filter(
    (s) => s.status === 'completed'
  ).length;
  const totalSets = exercise.sets.length;
  const allComplete = completedSets === totalSets;
  const isWorkoutModifiable =
    workoutStatus === 'pending' || workoutStatus === 'in_progress';

  // Determine which set (if any) can be removed
  // Only the last pending set can be removed, and only if there's more than 1 set total
  const pendingSets = exercise.sets.filter((s) => s.status === 'pending');
  const lastPendingSet = pendingSets[pendingSets.length - 1];
  const canRemoveAnySet = totalSets > 1 && pendingSets.length > 0;

  // Track weight overrides for cascading weight changes to subsequent sets
  const [weightOverrides, setWeightOverrides] = useState<Record<number, string>>({});

  // When a set's weight changes, cascade the new weight to all subsequent sets
  const handleWeightChange = (setIndex: number, newWeight: string): void => {
    setWeightOverrides((prev) => {
      const updated = { ...prev };
      // Update all sets after the current one
      for (let i = setIndex + 1; i < exercise.sets.length; i++) {
        const set = exercise.sets[i];
        if (set !== undefined) {
          updated[set.id] = newWeight;
        }
      }
      return updated;
    });
  };

  return (
    <Card
      data-testid={`exercise-card-${exercise.exercise_id}`}
      onClick={onActivate}
      style={{ cursor: 'pointer' }}
    >
      {/* Exercise header */}
      <Flex justify="between" align="center" mb="3">
        <Box>
          <Text size="4" weight="bold">
            {exercise.exercise_name}
          </Text>
          <Text size="2" color="gray" as="p">
            Rest: {formatRestTime(exercise.rest_seconds)}
          </Text>
        </Box>
        <Badge
          color={allComplete ? 'green' : 'gray'}
          size="2"
          data-testid="progress-badge"
        >
          {completedSets}/{totalSets} sets
        </Badge>
      </Flex>

      {/* Sets list */}
      <Flex direction="column" gap="2">
        {exercise.sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            workoutStatus={workoutStatus}
            isActive={set.id === activeSetId}
            canRemove={canRemoveAnySet && set.id === lastPendingSet?.id}
            weightOverride={weightOverrides[set.id]}
            pendingEdit={pendingEdits?.[set.id]}
            onLog={(data) => onSetLogged(set.id, data)}
            onUnlog={() => onSetUnlogged(set.id)}
            onRemove={onRemoveSet}
            onWeightChange={(weight) => handleWeightChange(index, weight)}
            onPendingEdit={onPendingEdit !== undefined ? (data): void => onPendingEdit(set.id, data) : undefined}
          />
        ))}
      </Flex>

      {/* Add Set button */}
      {isWorkoutModifiable && onAddSet && (
        <Button
          data-testid={`add-set-${exercise.exercise_id}`}
          variant="ghost"
          size="1"
          mt="2"
          onClick={(e) => {
            e.stopPropagation();
            onAddSet();
          }}
        >
          <PlusIcon />
          Add Set
        </Button>
      )}
    </Card>
  );
}
