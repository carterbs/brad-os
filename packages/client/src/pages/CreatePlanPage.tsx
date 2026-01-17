import { Container, Flex, Heading, Text } from '@radix-ui/themes';
import { useNavigate } from 'react-router-dom';
import { useExercises } from '../hooks/useExercises';
import { useCreatePlan, useCreatePlanDay, useCreatePlanDayExercise } from '../hooks/usePlans';
import { PlanForm, type PlanFormState } from '../components/Plans';

export function CreatePlanPage(): JSX.Element {
  const navigate = useNavigate();
  const { data: exercises, isLoading: exercisesLoading } = useExercises();
  const createPlan = useCreatePlan();
  const createPlanDay = useCreatePlanDay();
  const createPlanDayExercise = useCreatePlanDayExercise();

  const handleSubmit = async (data: PlanFormState): Promise<void> => {
    try {
      // Create the plan first
      const plan = await createPlan.mutateAsync({
        name: data.name,
        duration_weeks: data.durationWeeks,
      });

      // Create days and exercises
      for (const dayData of data.days) {
        const planDay = await createPlanDay.mutateAsync({
          planId: plan.id,
          data: {
            day_of_week: dayData.dayOfWeek,
            name: dayData.name,
            sort_order: dayData.dayOfWeek,
          },
        });

        // Create exercises for this day
        for (let i = 0; i < dayData.exercises.length; i++) {
          const exerciseData = dayData.exercises[i];
          if (exerciseData?.exerciseId) {
            await createPlanDayExercise.mutateAsync({
              planId: plan.id,
              dayId: planDay.id,
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
      }

      navigate(`/plans/${plan.id}`);
    } catch (error) {
      // Error is handled by React Query
      console.error('Failed to create plan:', error);
    }
  };

  const isSubmitting =
    createPlan.isPending ||
    createPlanDay.isPending ||
    createPlanDayExercise.isPending;

  if (exercisesLoading) {
    return (
      <Container size="2" p="4">
        <Text color="gray">Loading exercises...</Text>
      </Container>
    );
  }

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Create New Plan</Heading>

        {createPlan.isError && (
          <Text color="red" as="p">
            Failed to create plan: {createPlan.error.message}
          </Text>
        )}

        <PlanForm
          availableExercises={exercises ?? []}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/plans')}
          isSubmitting={isSubmitting}
        />
      </Flex>
    </Container>
  );
}
