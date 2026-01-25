import { useState, useEffect, useMemo } from 'react';
import { Container, Flex, Heading, Text } from '@radix-ui/themes';
import { useParams, useNavigate } from 'react-router-dom';
import { useExercises } from '../hooks/useExercises';
import {
  usePlan,
  usePlanDays,
  useAllPlanDayExercises,
  useUpdatePlan,
  useCreatePlanDay,
  useUpdatePlanDay,
  useDeletePlanDay,
  useCreatePlanDayExercise,
  useUpdatePlanDayExercise,
  useDeletePlanDayExercise,
} from '../hooks/usePlans';
import { useActiveMesocycle } from '../hooks/useMesocycles';
import {
  PlanForm,
  ActivePlanWarningDialog,
  type PlanFormState,
  type PlanExerciseFormState,
  DAY_NAMES,
  DEFAULT_EXERCISE_CONFIG,
} from '../components/Plans';
import type { PlanDay, PlanDayExercise } from '@lifting/shared';

export function EditPlanPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const planId = parseInt(id ?? '', 10);

  const { data: plan, isLoading: planLoading, error: planError } = usePlan(planId);
  const { data: planDays, isLoading: daysLoading } = usePlanDays(planId);
  const { data: dayExercisesMap, isLoading: dayExercisesLoading } = useAllPlanDayExercises(
    planId,
    planDays ?? []
  );
  const { data: exercises, isLoading: exercisesLoading } = useExercises();
  const { data: activeMesocycle } = useActiveMesocycle();

  const updatePlan = useUpdatePlan();
  const createPlanDay = useCreatePlanDay();
  const updatePlanDay = useUpdatePlanDay();
  const deletePlanDay = useDeletePlanDay();
  const createPlanDayExercise = useCreatePlanDayExercise();
  const updatePlanDayExercise = useUpdatePlanDayExercise();
  const deletePlanDayExercise = useDeletePlanDayExercise();

  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [initialFormState, setInitialFormState] = useState<PlanFormState | null>(null);

  // Check if this plan has an active mesocycle
  const hasActiveMesocycle = useMemo(() => {
    return activeMesocycle !== null && activeMesocycle?.plan_id === planId;
  }, [activeMesocycle, planId]);

  // Build initial form state from fetched plan data
  useEffect(() => {
    if (plan && planDays && dayExercisesMap && initialFormState === null) {
      const formState: PlanFormState = {
        name: plan.name,
        durationWeeks: plan.duration_weeks,
        days: planDays.map((day) =>
          convertPlanDayToFormState(day, dayExercisesMap.get(day.id) ?? [])
        ),
      };
      setInitialFormState(formState);
    }
  }, [plan, planDays, dayExercisesMap, initialFormState]);

  // Show warning dialog if plan has active mesocycle and user hasn't acknowledged
  useEffect(() => {
    if (hasActiveMesocycle && !warningAcknowledged && plan !== undefined) {
      setShowWarningDialog(true);
    }
  }, [hasActiveMesocycle, warningAcknowledged, plan]);

  const handleWarningConfirm = (): void => {
    setWarningAcknowledged(true);
    setShowWarningDialog(false);
  };

  const handleWarningCancel = (): void => {
    void navigate(`/lifting/plans/${planId}`);
  };

  const handleSubmit = async (data: PlanFormState): Promise<void> => {
    try {
      // Update the plan name/duration
      await updatePlan.mutateAsync({
        id: planId,
        data: {
          name: data.name,
          duration_weeks: data.durationWeeks,
        },
      });

      // Handle day changes
      const existingDays = planDays ?? [];
      const existingDayMap = new Map(existingDays.map((d) => [d.day_of_week, d]));
      const newDayOfWeeks = new Set(data.days.map((d) => d.dayOfWeek));

      // Delete removed days
      for (const existingDay of existingDays) {
        if (!newDayOfWeeks.has(existingDay.day_of_week)) {
          await deletePlanDay.mutateAsync({
            planId,
            dayId: existingDay.id,
          });
        }
      }

      // Add or update days
      for (let i = 0; i < data.days.length; i++) {
        const dayData = data.days[i];
        if (dayData === undefined) continue;

        const existingDay = existingDayMap.get(dayData.dayOfWeek);

        let dayId: number;

        if (existingDay !== undefined) {
          // Update existing day
          await updatePlanDay.mutateAsync({
            planId,
            dayId: existingDay.id,
            data: {
              name: dayData.name,
              sort_order: i,
            },
          });
          dayId = existingDay.id;
        } else {
          // Create new day
          const newDay = await createPlanDay.mutateAsync({
            planId,
            data: {
              day_of_week: dayData.dayOfWeek,
              name: dayData.name,
              sort_order: i,
            },
          });
          dayId = newDay.id;
        }

        // Handle exercises for this day
        await handleDayExercises(planId, dayId, dayData.exercises);
      }

      void navigate(`/lifting/plans/${planId}`);
    } catch (error) {
      console.error('Failed to update plan:', error);
    }
  };

  const handleDayExercises = async (
    planIdParam: number,
    dayId: number,
    formExercises: PlanExerciseFormState[]
  ): Promise<void> => {
    for (let i = 0; i < formExercises.length; i++) {
      const exerciseData = formExercises[i];
      if (exerciseData?.exerciseId === undefined || exerciseData.exerciseId === null) continue;

      // Check if this is an existing exercise or new
      if (exerciseData.tempId.startsWith('existing-')) {
        // Extract the plan_day_exercise ID from tempId
        const pdeId = parseInt(exerciseData.tempId.replace('existing-', ''), 10);
        if (!isNaN(pdeId)) {
          await updatePlanDayExercise.mutateAsync({
            planId: planIdParam,
            dayId,
            exerciseId: pdeId,
            data: {
              sets: exerciseData.sets,
              reps: exerciseData.reps,
              weight: exerciseData.weight,
              rest_seconds: exerciseData.restSeconds,
              sort_order: i,
            },
          });
        }
      } else {
        // New exercise
        await createPlanDayExercise.mutateAsync({
          planId: planIdParam,
          dayId,
          data: {
            exercise_id: exerciseData.exerciseId,
            sets: exerciseData.sets,
            reps: exerciseData.reps,
            weight: exerciseData.weight,
            rest_seconds: exerciseData.restSeconds,
            sort_order: i,
          },
        });
      }
    }
  };

  const isLoading = planLoading || daysLoading || dayExercisesLoading || exercisesLoading;
  const isSubmitting =
    updatePlan.isPending ||
    createPlanDay.isPending ||
    updatePlanDay.isPending ||
    deletePlanDay.isPending ||
    createPlanDayExercise.isPending ||
    updatePlanDayExercise.isPending ||
    deletePlanDayExercise.isPending;

  if (isLoading) {
    return (
      <Container size="2" p="4">
        <Text color="gray">Loading plan...</Text>
      </Container>
    );
  }

  if (planError !== null) {
    return (
      <Container size="2" p="4">
        <Text color="red">Failed to load plan: {planError.message}</Text>
      </Container>
    );
  }

  if (plan === undefined || initialFormState === null) {
    return (
      <Container size="2" p="4">
        <Text color="red">Plan not found</Text>
      </Container>
    );
  }

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Edit Plan</Heading>

        {hasActiveMesocycle && warningAcknowledged && (
          <Text color="amber" size="2" as="p">
            This plan has an active mesocycle. Changes will only apply to future workouts.
          </Text>
        )}

        {updatePlan.isError && (
          <Text color="red" as="p">
            Failed to update plan: {updatePlan.error.message}
          </Text>
        )}

        <PlanForm
          initialData={initialFormState}
          availableExercises={exercises ?? []}
          onSubmit={(data) => void handleSubmit(data)}
          onCancel={() => void navigate(`/lifting/plans/${planId}`)}
          isSubmitting={isSubmitting}
        />
      </Flex>

      <ActivePlanWarningDialog
        open={showWarningDialog}
        onConfirm={handleWarningConfirm}
        onCancel={handleWarningCancel}
      />
    </Container>
  );
}

// Helper functions
function convertPlanDayToFormState(
  day: PlanDay,
  pdeExercises: PlanDayExercise[]
): {
  tempId: string;
  dayOfWeek: PlanDay['day_of_week'];
  name: string;
  exercises: PlanExerciseFormState[];
} {
  return {
    tempId: `day-${day.id}`,
    dayOfWeek: day.day_of_week,
    name: day.name.length > 0 ? day.name : DAY_NAMES[day.day_of_week],
    exercises: pdeExercises.map((ex) => convertPlanDayExerciseToFormState(ex)),
  };
}

function convertPlanDayExerciseToFormState(
  exercise: PlanDayExercise
): PlanExerciseFormState {
  return {
    tempId: `existing-${exercise.id}`,
    exerciseId: exercise.exercise_id,
    sets: exercise.sets,
    reps: exercise.reps,
    weight: exercise.weight,
    restSeconds: exercise.rest_seconds,
    weightIncrement: DEFAULT_EXERCISE_CONFIG.weightIncrement,
  };
}
