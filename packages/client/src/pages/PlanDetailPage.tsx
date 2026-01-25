import { useState } from 'react';
import {
  Container,
  Flex,
  Heading,
  Text,
  Button,
  Box,
  Badge,
  Separator,
} from '@radix-ui/themes';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlan, usePlanDays, usePlanDayExercises } from '../hooks/usePlans';
import { useExercises } from '../hooks/useExercises';
import { DeletePlanDialog, DAY_NAMES } from '../components/Plans';
import type { Plan, DayOfWeek } from '@brad-os/shared';

export function PlanDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const planId = parseInt(id ?? '', 10);

  const { data: plan, isLoading: planLoading, error: planError } = usePlan(planId);
  const { data: days, isLoading: daysLoading } = usePlanDays(planId);
  const { data: exercises } = useExercises();
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);

  const handleEdit = (): void => {
    void navigate(`/lifting/plans/${planId}/edit`);
  };

  const handleDelete = (): void => {
    if (plan) {
      setPlanToDelete(plan);
    }
  };

  const handleCloseDeleteDialog = (): void => {
    setPlanToDelete(null);
  };

  const handleDeleteSuccess = (): void => {
    setPlanToDelete(null);
    void navigate('/lifting/plans');
  };

  if (planLoading || daysLoading) {
    return (
      <Container size="2" p="4">
        <Text color="gray">Loading plan...</Text>
      </Container>
    );
  }

  if (planError) {
    return (
      <Container size="2" p="4">
        <Text color="red">Failed to load plan: {planError.message}</Text>
      </Container>
    );
  }

  if (!plan) {
    return (
      <Container size="2" p="4">
        <Text color="red">Plan not found</Text>
      </Container>
    );
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Create a map of exercise names for display
  const exerciseMap = new Map(exercises?.map((e) => [e.id, e.name]) ?? []);

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4" data-testid="plan-detail">
        {/* Header */}
        <Flex justify="between" align="start">
          <Flex direction="column" gap="2">
            <Heading size="6" data-testid="plan-name">
              {plan.name}
            </Heading>
            <Flex gap="2">
              <Badge color="blue" variant="soft" data-testid="plan-duration">
                {plan.duration_weeks} {plan.duration_weeks === 1 ? 'week' : 'weeks'}
              </Badge>
              {days && days.length > 0 && (
                <Badge color="gray" variant="soft">
                  {days.length} {days.length === 1 ? 'day' : 'days'}
                </Badge>
              )}
            </Flex>
            <Text size="2" color="gray">
              Created {formatDate(plan.created_at)}
            </Text>
          </Flex>

          <Flex gap="2">
            <Button variant="soft" onClick={handleEdit} data-testid="edit-plan-button">
              Edit
            </Button>
            <Button
              variant="soft"
              color="red"
              onClick={handleDelete}
              data-testid="delete-plan-button"
            >
              Delete
            </Button>
          </Flex>
        </Flex>

        <Separator size="4" />

        {/* Days and Exercises */}
        <Flex direction="column" gap="4">
          <Heading size="4">Workout Days</Heading>

          {(!days || days.length === 0) && (
            <Box
              p="4"
              style={{
                backgroundColor: 'var(--gray-2)',
                borderRadius: 'var(--radius-3)',
              }}
            >
              <Text color="gray">No workout days configured.</Text>
            </Box>
          )}

          {days?.map((day) => (
            <DaySection
              key={day.id}
              planId={planId}
              dayId={day.id}
              dayOfWeek={day.day_of_week}
              dayName={day.name}
              exerciseMap={exerciseMap}
            />
          ))}
        </Flex>

        {/* Back Button */}
        <Box mt="4">
          <Button variant="soft" color="gray" onClick={() => void navigate('/lifting/plans')}>
            Back to Plans
          </Button>
        </Box>
      </Flex>

      <DeletePlanDialog
        plan={planToDelete}
        onClose={planToDelete ? handleDeleteSuccess : handleCloseDeleteDialog}
      />
    </Container>
  );
}

function DaySection({
  planId,
  dayId,
  dayOfWeek,
  dayName,
  exerciseMap,
}: {
  planId: number;
  dayId: number;
  dayOfWeek: DayOfWeek;
  dayName: string;
  exerciseMap: Map<number, string>;
}): JSX.Element {
  const { data: dayExercises } = usePlanDayExercises(planId, dayId);

  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-4)',
      }}
      data-testid={`day-section-${dayOfWeek}`}
    >
      <Heading size="3" mb="3">
        {dayName || DAY_NAMES[dayOfWeek]}
      </Heading>

      {(!dayExercises || dayExercises.length === 0) && (
        <Text color="gray" size="2">
          No exercises configured for this day.
        </Text>
      )}

      {dayExercises && dayExercises.length > 0 && (
        <Flex direction="column" gap="2">
          {dayExercises.map((exercise) => (
            <Flex
              key={exercise.id}
              justify="between"
              align="center"
              p="2"
              style={{
                backgroundColor: 'var(--gray-1)',
                borderRadius: 'var(--radius-2)',
              }}
            >
              <Text weight="medium">
                {exerciseMap.get(exercise.exercise_id) ?? 'Unknown Exercise'}
              </Text>
              <Flex gap="3">
                <Text size="2" color="gray">
                  {exercise.sets} sets
                </Text>
                <Text size="2" color="gray">
                  {exercise.reps} reps
                </Text>
                <Text size="2" color="gray">
                  {exercise.weight} lbs
                </Text>
                <Text size="2" color="gray">
                  {exercise.rest_seconds}s rest
                </Text>
              </Flex>
            </Flex>
          ))}
        </Flex>
      )}
    </Box>
  );
}
