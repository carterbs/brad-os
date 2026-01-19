import { useState, useMemo } from 'react';
import {
  Flex,
  Box,
  Button,
  Text,
  Heading,
  TextField,
  Select,
  Tabs,
} from '@radix-ui/themes';
import type { Exercise, DayOfWeek } from '@lifting/shared';
import { DaySelector } from './DaySelector';
import { ExerciseConfigRow } from './ExerciseConfigRow';
import {
  type PlanFormState,
  type PlanExerciseFormState,
  DURATION_WEEKS_OPTIONS,
  DAY_NAMES,
  DEFAULT_DURATION_WEEKS,
  createDayFormState,
  createEmptyExerciseFormState,
} from './types';

interface PlanFormProps {
  initialData?: PlanFormState;
  availableExercises: Exercise[];
  onSubmit: (data: PlanFormState) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

type Step = 1 | 2 | 3;

const INITIAL_FORM_STATE: PlanFormState = {
  name: '',
  durationWeeks: DEFAULT_DURATION_WEEKS,
  days: [],
};

export function PlanForm({
  initialData,
  availableExercises,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: PlanFormProps): JSX.Element {
  const [step, setStep] = useState<Step>(1);
  const [formState, setFormState] = useState<PlanFormState>(
    initialData ?? INITIAL_FORM_STATE
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);

  const selectedDays = useMemo(
    () => formState.days.map((d) => d.dayOfWeek),
    [formState.days]
  );

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setFormState((prev) => ({ ...prev, name: e.target.value }));
    if (nameError !== null) setNameError(null);
  };

  const handleDurationChange = (value: string): void => {
    setFormState((prev) => ({ ...prev, durationWeeks: parseInt(value, 10) }));
  };

  const handleDaysChange = (days: DayOfWeek[]): void => {
    if (daysError !== null) setDaysError(null);
    setFormState((prev) => {
      // Keep existing day data for days that are still selected
      const existingDayMap = new Map(prev.days.map((d) => [d.dayOfWeek, d]));

      // Create new days array, preserving existing data or creating new
      const newDays = days.map(
        (dayOfWeek) => existingDayMap.get(dayOfWeek) ?? createDayFormState(dayOfWeek)
      );

      // Sort by day of week
      newDays.sort((a, b) => a.dayOfWeek - b.dayOfWeek);

      return { ...prev, days: newDays };
    });
  };

  const handleAddExercise = (dayIndex: number): void => {
    setFormState((prev) => {
      const newDays = [...prev.days];
      const existingDay = newDays[dayIndex];
      if (existingDay) {
        newDays[dayIndex] = {
          ...existingDay,
          exercises: [...existingDay.exercises, createEmptyExerciseFormState()],
        };
      }
      return { ...prev, days: newDays };
    });
  };

  const handleExerciseChange = (
    dayIndex: number,
    exerciseIndex: number,
    exercise: PlanExerciseFormState
  ): void => {
    setFormState((prev) => {
      const newDays = [...prev.days];
      const existingDay = newDays[dayIndex];
      if (existingDay) {
        const newExercises = [...existingDay.exercises];
        newExercises[exerciseIndex] = exercise;
        newDays[dayIndex] = { ...existingDay, exercises: newExercises };
      }
      return { ...prev, days: newDays };
    });
  };

  const handleRemoveExercise = (dayIndex: number, exerciseIndex: number): void => {
    setFormState((prev) => {
      const newDays = [...prev.days];
      const existingDay = newDays[dayIndex];
      if (existingDay) {
        const newExercises = existingDay.exercises.filter(
          (_, i) => i !== exerciseIndex
        );
        newDays[dayIndex] = { ...existingDay, exercises: newExercises };
      }
      return { ...prev, days: newDays };
    });
  };

  const handleNext = (): void => {
    if (step === 1) {
      if (!formState.name.trim()) {
        setNameError('Plan name is required');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (formState.days.length === 0) {
        setDaysError('Select at least one workout day');
        return;
      }
      setStep(3);
    }
  };

  const handleBack = (): void => {
    if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    }
  };

  const handleSubmit = (): void => {
    onSubmit(formState);
  };

  const isStep3Valid =
    formState.days.length > 0 &&
    formState.days.every((day) =>
      day.exercises.every((ex) => ex.exerciseId !== null)
    );

  return (
    <Flex direction="column" gap="4">
      {/* Step Indicator */}
      <Flex gap="2" align="center" justify="center" mb="2">
        <StepIndicator step={1} currentStep={step} label="Basics" />
        <StepDivider />
        <StepIndicator step={2} currentStep={step} label="Days" />
        <StepDivider />
        <StepIndicator step={3} currentStep={step} label="Exercises" />
      </Flex>

      {/* Step 1: Name and Duration */}
      {step === 1 && (
        <Box data-testid="step-1">
          <Flex direction="column" gap="4">
            <Box>
              <Text as="label" size="2" weight="medium" mb="1">
                Plan Name
              </Text>
              <TextField.Root
                value={formState.name}
                onChange={handleNameChange}
                placeholder="e.g., Push Pull Legs"
                data-testid="plan-name-input"
              />
              {nameError !== null && (
                <Text color="red" size="1" mt="1">
                  {nameError}
                </Text>
              )}
            </Box>

            <Box>
              <Text as="label" size="2" weight="medium" mb="1">
                Duration
              </Text>
              <Select.Root
                value={formState.durationWeeks.toString()}
                onValueChange={handleDurationChange}
              >
                <Select.Trigger
                  placeholder="Select duration..."
                  data-testid="duration-select"
                />
                <Select.Content>
                  {DURATION_WEEKS_OPTIONS.map((option) => (
                    <Select.Item
                      key={option.value}
                      value={option.value}
                      data-testid={`duration-option-${option.value}`}
                    >
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
          </Flex>
        </Box>
      )}

      {/* Step 2: Day Selection */}
      {step === 2 && (
        <Box data-testid="step-2">
          <Text as="p" color="gray" size="2" mb="3">
            Select the days you want to work out.
          </Text>
          <DaySelector selectedDays={selectedDays} onChange={handleDaysChange} />
          {daysError !== null && (
            <Text color="red" size="1" mt="2">
              {daysError}
            </Text>
          )}
        </Box>
      )}

      {/* Step 3: Exercise Configuration */}
      {step === 3 && (
        <Box data-testid="step-3">
          {formState.days.length === 0 ? (
            <Box
              p="4"
              style={{
                backgroundColor: 'var(--gray-2)',
                borderRadius: 'var(--radius-3)',
                textAlign: 'center',
              }}
            >
              <Text color="gray">
                No days selected. Go back to select workout days.
              </Text>
            </Box>
          ) : (
            <Tabs.Root defaultValue={formState.days[0]?.dayOfWeek.toString() ?? '0'}>
              <Tabs.List>
                {formState.days.map((day) => (
                  <Tabs.Trigger
                    key={day.tempId}
                    value={day.dayOfWeek.toString()}
                    data-testid={`day-tab-${day.dayOfWeek}`}
                  >
                    {DAY_NAMES[day.dayOfWeek]}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {formState.days.map((day, dayIndex) => (
                <Tabs.Content
                  key={day.tempId}
                  value={day.dayOfWeek.toString()}
                  data-testid={`day-content-${day.dayOfWeek}`}
                >
                  <Flex direction="column" gap="3" mt="3">
                    <Heading size="3">{DAY_NAMES[day.dayOfWeek]}</Heading>

                    {day.exercises.map((exercise, exerciseIndex) => (
                      <ExerciseConfigRow
                        key={exercise.tempId}
                        exercise={exercise}
                        availableExercises={availableExercises}
                        onChange={(ex) =>
                          handleExerciseChange(dayIndex, exerciseIndex, ex)
                        }
                        onRemove={() => handleRemoveExercise(dayIndex, exerciseIndex)}
                        index={exerciseIndex}
                        disabled={isSubmitting}
                      />
                    ))}

                    <Button
                      variant="soft"
                      onClick={() => handleAddExercise(dayIndex)}
                      disabled={isSubmitting}
                      data-testid={`add-exercise-day-${day.dayOfWeek}`}
                    >
                      + Add Exercise
                    </Button>
                  </Flex>
                </Tabs.Content>
              ))}
            </Tabs.Root>
          )}
        </Box>
      )}

      {/* Navigation Buttons */}
      <Flex gap="3" justify="between" mt="4">
        <Button
          variant="soft"
          color="gray"
          onClick={step === 1 ? onCancel : handleBack}
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>

        {step < 3 ? (
          <Button onClick={handleNext} data-testid="next-button">
            Next
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !isStep3Valid}
            data-testid="submit-button"
          >
            {isSubmitting ? 'Saving...' : 'Create Plan'}
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

function StepIndicator({
  step,
  currentStep,
  label,
}: {
  step: Step;
  currentStep: Step;
  label: string;
}): JSX.Element {
  const isActive = step === currentStep;
  const isCompleted = step < currentStep;

  return (
    <Flex direction="column" align="center" gap="1">
      <Box
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isActive
            ? 'var(--accent-9)'
            : isCompleted
              ? 'var(--accent-6)'
              : 'var(--gray-4)',
          color: isActive || isCompleted ? 'white' : 'var(--gray-11)',
          fontWeight: 'bold',
          fontSize: '12px',
        }}
      >
        {isCompleted ? <CheckIcon /> : step}
      </Box>
      <Text size="1" color={isActive ? undefined : 'gray'}>
        {label}
      </Text>
    </Flex>
  );
}

function StepDivider(): JSX.Element {
  return (
    <Box
      style={{
        width: '40px',
        height: '2px',
        backgroundColor: 'var(--gray-4)',
        marginTop: '-16px',
      }}
    />
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3355 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.55529 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
