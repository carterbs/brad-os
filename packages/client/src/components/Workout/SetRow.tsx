import { useState, useEffect, useRef } from 'react';
import { Flex, Text, TextField, Checkbox, IconButton } from '@radix-ui/themes';
import { TrashIcon } from '@radix-ui/react-icons';
import type { WorkoutSet, WorkoutStatus, LogWorkoutSetInput } from '@brad-os/shared';
import type { PendingSetEdit } from '../../hooks/useLocalStorage';

interface SetRowProps {
  set: WorkoutSet;
  workoutStatus: WorkoutStatus;
  isActive: boolean;
  canRemove?: boolean | undefined;
  weightOverride?: string | undefined;
  repsOverride?: string | undefined;
  pendingEdit?: PendingSetEdit | undefined;
  onLog: (data: LogWorkoutSetInput) => void;
  onUnlog: () => void;
  onRemove?: (() => void) | undefined;
  onWeightChange?: ((weight: string) => void) | undefined;
  onRepsChange?: ((reps: string) => void) | undefined;
  onPendingEdit?: ((data: PendingSetEdit) => void) | undefined;
}

function validateWeight(value: string): string | null {
  const num = parseFloat(value);
  if (isNaN(num)) return 'Enter a valid number';
  if (num < 0) return 'Weight cannot be negative';
  return null;
}

function validateReps(value: string): string | null {
  const num = parseInt(value, 10);
  if (isNaN(num)) return 'Enter a valid number';
  if (num < 0) return 'Reps cannot be negative';
  if (!Number.isInteger(parseFloat(value))) return 'Reps must be a whole number';
  return null;
}

export function SetRow({
  set,
  workoutStatus,
  isActive,
  canRemove,
  weightOverride,
  repsOverride,
  pendingEdit,
  onLog,
  onUnlog,
  onRemove,
  onWeightChange,
  onRepsChange,
  onPendingEdit,
}: SetRowProps): JSX.Element {
  const isDisabled = workoutStatus === 'completed' || workoutStatus === 'skipped';
  const isLogged = set.status === 'completed';
  const isSkipped = set.status === 'skipped';

  // Initialize input values from pending edit, override, actual, or target values
  // Priority: pendingEdit > override > actual > target
  const [weight, setWeight] = useState<string>(
    pendingEdit?.weight ?? weightOverride ?? String(set.actual_weight ?? set.target_weight)
  );
  const [reps, setReps] = useState<string>(
    pendingEdit?.reps ?? repsOverride ?? String(set.actual_reps ?? set.target_reps)
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  // Track previous values to detect actual changes (not just initial mount)
  const prevTargetWeight = useRef(set.target_weight);
  const prevTargetReps = useRef(set.target_reps);
  const prevWeightOverride = useRef(weightOverride);
  const prevRepsOverride = useRef(repsOverride);

  // Track whether pending edit has been applied (for page refresh restoration)
  const pendingEditApplied = useRef(pendingEdit !== undefined);

  // Update input values when target values or weight override ACTUALLY CHANGE.
  // We skip the initial render to preserve actual values for already-logged sets.
  // We also intentionally exclude actual_weight/actual_reps from dependencies
  // to preserve user input when server errors cause optimistic updates to revert.
  useEffect(() => {
    const targetWeightChanged = set.target_weight !== prevTargetWeight.current;
    const weightOverrideChanged = weightOverride !== prevWeightOverride.current;

    if (targetWeightChanged || weightOverrideChanged) {
      setWeight(weightOverride ?? String(set.target_weight));
    }

    prevTargetWeight.current = set.target_weight;
    prevWeightOverride.current = weightOverride;
  }, [set.target_weight, weightOverride]);

  useEffect(() => {
    const targetRepsChanged = set.target_reps !== prevTargetReps.current;
    const repsOverrideChanged = repsOverride !== prevRepsOverride.current;

    if (targetRepsChanged || repsOverrideChanged) {
      setReps(repsOverride ?? String(set.target_reps));
    }

    prevTargetReps.current = set.target_reps;
    prevRepsOverride.current = repsOverride;
  }, [set.target_reps, repsOverride]);

  // Restore pending edits when they become available after mount (fixes page refresh)
  // This handles the case where pendingEdit wasn't available on initial render
  // but becomes available later due to React rendering order
  useEffect(() => {
    if (pendingEdit !== undefined && !pendingEditApplied.current) {
      if (pendingEdit.weight !== undefined) {
        setWeight(pendingEdit.weight);
      }
      if (pendingEdit.reps !== undefined) {
        setReps(pendingEdit.reps);
      }
      pendingEditApplied.current = true;
    }
  }, [pendingEdit]);

  // Clear validation error when inputs change
  useEffect(() => {
    if (validationError !== null) {
      setValidationError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weight, reps]);

  const handleCheckboxChange = (checked: boolean): void => {
    if (checked) {
      // Validate before logging
      const weightError = validateWeight(weight);
      if (weightError !== null) {
        setValidationError(weightError);
        return;
      }
      const repsError = validateReps(reps);
      if (repsError !== null) {
        setValidationError(repsError);
        return;
      }

      const weightNum = parseFloat(weight);
      const repsNum = parseInt(reps, 10);
      onLog({
        actual_weight: weightNum,
        actual_reps: repsNum,
      });
    } else {
      onUnlog();
    }
  };

  const getStatusClass = (): string => {
    if (isLogged) return 'logged';
    if (isSkipped) return 'skipped';
    return 'pending';
  };

  const hasError = validationError !== null;

  return (
    <Flex
      data-testid={`set-row-${set.id}`}
      className={getStatusClass()}
      direction="column"
      gap="1"
      p="2"
      style={{
        backgroundColor: isLogged
          ? 'var(--gray-4)'
          : isSkipped
            ? 'var(--gray-3)'
            : hasError
              ? 'var(--red-2)'
              : 'var(--gray-2)',
        borderRadius: 'var(--radius-2)',
        opacity: isSkipped ? 0.7 : 1,
        border: isActive
          ? '2px solid var(--accent-9)'
          : hasError
            ? '2px solid var(--red-6)'
            : '2px solid transparent',
      }}
    >
      <Flex align="center" justify="between" gap="2">
      {/* Set number badge */}
      <Flex
        align="center"
        justify="center"
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: isLogged ? 'var(--accent-9)' : 'var(--gray-6)',
          color: 'white',
          flexShrink: 0,
        }}
      >
        <Text size="1" weight="bold">
          {set.set_number}
        </Text>
      </Flex>

      {/* Weight input */}
      <Flex align="center" gap="1">
        <TextField.Root
          data-testid={`weight-input-${set.id}`}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          value={weight}
          onChange={(e) => {
            setWeight(e.target.value);
            onWeightChange?.(e.target.value);
            onPendingEdit?.({ weight: e.target.value });
          }}
          disabled={isDisabled || isSkipped}
          size="1"
          style={{ width: '56px' }}
        />
        <Text size="1" color="gray">lb</Text>
      </Flex>

      {/* Reps input */}
      <Flex align="center" gap="1">
        <TextField.Root
          data-testid={`reps-input-${set.id}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={reps}
          onChange={(e) => {
            setReps(e.target.value);
            onRepsChange?.(e.target.value);
            onPendingEdit?.({ reps: e.target.value });
          }}
          disabled={isDisabled || isSkipped}
          size="1"
          style={{ width: '48px' }}
        />
        <Text size="1" color="gray">reps</Text>
      </Flex>

      {/* Checkbox and remove button grouped together */}
      <Flex align="center" gap="2">
        {/* Remove button container - always rendered to maintain alignment */}
        <Flex style={{ width: '24px', justifyContent: 'center' }}>
          {canRemove === true && set.status === 'pending' && onRemove !== undefined && (
            <IconButton
              data-testid={`remove-set-${set.id}`}
              variant="ghost"
              color="red"
              size="1"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <TrashIcon />
            </IconButton>
          )}
        </Flex>

        {/* Checkbox on the right */}
        <Checkbox
          data-testid={`log-checkbox-${set.id}`}
          checked={isLogged}
          onCheckedChange={handleCheckboxChange}
          disabled={isDisabled || isSkipped}
          size="3"
        />
      </Flex>
      </Flex>

      {/* Validation error message */}
      {validationError !== null && (
        <Text size="1" color="red" data-testid={`validation-error-${set.id}`}>
          {validationError}
        </Text>
      )}
    </Flex>
  );
}
