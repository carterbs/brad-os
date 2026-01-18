import { useState, useEffect } from 'react';
import { Flex, Text, TextField, Checkbox } from '@radix-ui/themes';
import type { WorkoutSet, WorkoutStatus, LogWorkoutSetInput } from '@lifting/shared';

interface SetRowProps {
  set: WorkoutSet;
  workoutStatus: WorkoutStatus;
  isActive: boolean;
  onLog: (data: LogWorkoutSetInput) => void;
  onUnlog: () => void;
}

export function SetRow({
  set,
  workoutStatus,
  isActive,
  onLog,
  onUnlog,
}: SetRowProps): JSX.Element {
  const isDisabled = workoutStatus === 'completed' || workoutStatus === 'skipped';
  const isLogged = set.status === 'completed';
  const isSkipped = set.status === 'skipped';

  // Initialize input values from target or actual values
  const [weight, setWeight] = useState<string>(
    String(set.actual_weight ?? set.target_weight)
  );
  const [reps, setReps] = useState<string>(
    String(set.actual_reps ?? set.target_reps)
  );

  // Update input values when set changes (e.g., after unlog)
  useEffect(() => {
    setWeight(String(set.actual_weight ?? set.target_weight));
    setReps(String(set.actual_reps ?? set.target_reps));
  }, [set.actual_weight, set.actual_reps, set.target_weight, set.target_reps]);

  const handleCheckboxChange = (checked: boolean): void => {
    if (checked) {
      const weightNum = parseFloat(weight) || 0;
      const repsNum = parseInt(reps, 10) || 0;
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

  return (
    <Flex
      data-testid={`set-row-${set.id}`}
      className={getStatusClass()}
      align="center"
      gap="2"
      p="2"
      style={{
        backgroundColor: isLogged
          ? 'var(--green-2)'
          : isSkipped
            ? 'var(--gray-3)'
            : 'var(--gray-2)',
        borderRadius: 'var(--radius-2)',
        opacity: isSkipped ? 0.7 : 1,
        border: isActive ? '2px solid var(--accent-9)' : '2px solid transparent',
      }}
    >
      {/* Set number badge */}
      <Flex
        align="center"
        justify="center"
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          backgroundColor: isLogged ? 'var(--green-9)' : 'var(--gray-6)',
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
          type="number"
          inputMode="decimal"
          min="0"
          step="0.5"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
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
          type="number"
          inputMode="numeric"
          min="0"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          disabled={isDisabled || isSkipped}
          size="1"
          style={{ width: '48px' }}
        />
        <Text size="1" color="gray">reps</Text>
      </Flex>

      {/* Checkbox */}
      <Checkbox
        data-testid={`log-checkbox-${set.id}`}
        checked={isLogged}
        onCheckedChange={handleCheckboxChange}
        disabled={isDisabled || isSkipped}
        size="2"
      />
    </Flex>
  );
}
