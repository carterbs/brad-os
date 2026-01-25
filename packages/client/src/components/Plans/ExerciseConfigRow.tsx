import { Flex, Select, IconButton, Text } from '@radix-ui/themes';
import type { Exercise } from '@brad-os/shared';
import type { PlanExerciseFormState } from './types';
import {
  SETS_OPTIONS,
  REPS_OPTIONS,
  WEIGHT_OPTIONS,
  REST_OPTIONS,
  WEIGHT_INCREMENT_OPTIONS,
} from './types';

interface ExerciseConfigRowProps {
  exercise: PlanExerciseFormState;
  availableExercises: Exercise[];
  onChange: (exercise: PlanExerciseFormState) => void;
  onRemove: () => void;
  disabled?: boolean;
  index: number;
}

export function ExerciseConfigRow({
  exercise,
  availableExercises,
  onChange,
  onRemove,
  disabled = false,
  index,
}: ExerciseConfigRowProps): JSX.Element {
  const handleExerciseChange = (value: string): void => {
    onChange({
      ...exercise,
      exerciseId: value ? parseInt(value, 10) : null,
    });
  };

  const handleSetsChange = (value: string): void => {
    onChange({
      ...exercise,
      sets: parseInt(value, 10),
    });
  };

  const handleRepsChange = (value: string): void => {
    onChange({
      ...exercise,
      reps: parseInt(value, 10),
    });
  };

  const handleWeightChange = (value: string): void => {
    onChange({
      ...exercise,
      weight: parseInt(value, 10),
    });
  };

  const handleRestChange = (value: string): void => {
    onChange({
      ...exercise,
      restSeconds: parseInt(value, 10),
    });
  };

  const handleWeightIncrementChange = (value: string): void => {
    onChange({
      ...exercise,
      weightIncrement: parseInt(value, 10),
    });
  };

  return (
    <Flex
      gap="2"
      align="start"
      wrap="wrap"
      p="3"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-2)',
        border: '1px solid var(--gray-4)',
      }}
      data-testid={`exercise-config-row-${index}`}
    >
      <Flex direction="column" gap="1" style={{ flex: '1 1 200px', minWidth: '150px' }}>
        <Text size="1" color="gray" weight="medium">
          Exercise
        </Text>
        <Select.Root
          value={exercise.exerciseId?.toString() ?? ''}
          onValueChange={handleExerciseChange}
          disabled={disabled}
        >
          <Select.Trigger
            placeholder="Select exercise..."
            data-testid={`exercise-select-${index}`}
          />
          <Select.Content>
            {availableExercises.map((ex) => (
              <Select.Item
                key={ex.id}
                value={ex.id.toString()}
                data-testid={`exercise-option-${ex.id}`}
              >
                {ex.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      <Flex direction="column" gap="1" style={{ minWidth: '80px' }}>
        <Text size="1" color="gray" weight="medium">
          Sets
        </Text>
        <Select.Root
          value={exercise.sets.toString()}
          onValueChange={handleSetsChange}
          disabled={disabled}
        >
          <Select.Trigger data-testid={`sets-select-${index}`} />
          <Select.Content>
            {SETS_OPTIONS.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                data-testid={`sets-option-${option.value}`}
              >
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      <Flex direction="column" gap="1" style={{ minWidth: '80px' }}>
        <Text size="1" color="gray" weight="medium">
          Reps
        </Text>
        <Select.Root
          value={exercise.reps.toString()}
          onValueChange={handleRepsChange}
          disabled={disabled}
        >
          <Select.Trigger data-testid={`reps-select-${index}`} />
          <Select.Content>
            {REPS_OPTIONS.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                data-testid={`reps-option-${option.value}`}
              >
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      <Flex direction="column" gap="1" style={{ minWidth: '90px' }}>
        <Text size="1" color="gray" weight="medium">
          Weight
        </Text>
        <Select.Root
          value={exercise.weight.toString()}
          onValueChange={handleWeightChange}
          disabled={disabled}
        >
          <Select.Trigger data-testid={`weight-select-${index}`} />
          <Select.Content>
            {WEIGHT_OPTIONS.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                data-testid={`weight-option-${option.value}`}
              >
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      <Flex direction="column" gap="1" style={{ minWidth: '80px' }}>
        <Text size="1" color="gray" weight="medium">
          Rest
        </Text>
        <Select.Root
          value={exercise.restSeconds.toString()}
          onValueChange={handleRestChange}
          disabled={disabled}
        >
          <Select.Trigger data-testid={`rest-select-${index}`} />
          <Select.Content>
            {REST_OPTIONS.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                data-testid={`rest-option-${option.value}`}
              >
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      <Flex direction="column" gap="1" style={{ minWidth: '90px' }}>
        <Text size="1" color="gray" weight="medium">
          Increment
        </Text>
        <Select.Root
          value={exercise.weightIncrement.toString()}
          onValueChange={handleWeightIncrementChange}
          disabled={disabled}
        >
          <Select.Trigger data-testid={`increment-select-${index}`} />
          <Select.Content>
            {WEIGHT_INCREMENT_OPTIONS.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                data-testid={`increment-option-${option.value}`}
              >
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      <Flex direction="column" gap="1" align="center" justify="end" style={{ minHeight: '52px' }}>
        <IconButton
          size="1"
          variant="ghost"
          color="red"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove exercise"
          data-testid={`remove-exercise-${index}`}
          style={{ marginTop: 'auto' }}
        >
          <TrashIcon />
        </IconButton>
      </Flex>
    </Flex>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2H9.5C9.77614 2 10 1.77614 10 1.5C10 1.22386 9.77614 1 9.5 1H5.5ZM3 3.5C3 3.22386 3.22386 3 3.5 3H5H10H11.5C11.7761 3 12 3.22386 12 3.5C12 3.77614 11.7761 4 11.5 4H11V12C11 12.5523 10.5523 13 10 13H5C4.44772 13 4 12.5523 4 12V4H3.5C3.22386 4 3 3.77614 3 3.5ZM5 4H10V12H5V4Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
