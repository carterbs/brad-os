import { useNavigate } from 'react-router-dom';
import { Box, Flex, Text, Button, Badge } from '@radix-ui/themes';
import type { WorkoutWithExercises } from '../../api/workoutApi';

interface WorkoutCardProps {
  workout: WorkoutWithExercises | null | undefined;
  isLoading: boolean;
}

function getStatusBadge(status: string): { label: string; color: 'gray' | 'yellow' | 'green' } {
  switch (status) {
    case 'pending':
      return { label: 'Ready', color: 'gray' };
    case 'in_progress':
      return { label: 'In Progress', color: 'yellow' };
    case 'completed':
      return { label: 'Completed', color: 'green' };
    default:
      return { label: status, color: 'gray' };
  }
}

export function WorkoutCard({ workout, isLoading }: WorkoutCardProps): JSX.Element {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Box
        p="4"
        style={{
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid var(--indigo-6)',
          borderRadius: '12px',
        }}
      >
        <Text size="2" color="gray">Loading workout...</Text>
      </Box>
    );
  }

  if (!workout) {
    return (
      <Box
        p="4"
        style={{
          backgroundColor: 'var(--gray-2)',
          border: '1px solid var(--gray-5)',
          borderRadius: '12px',
        }}
      >
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2">
            <DumbbellIcon />
            <Text size="3" weight="medium">Lifting</Text>
          </Flex>
          <Text size="2" color="gray">No workout scheduled for today.</Text>
        </Flex>
      </Box>
    );
  }

  const { label, color } = getStatusBadge(workout.status);
  const completedSets = workout.exercises.reduce(
    (sum: number, ex) => sum + ex.sets.filter((s) => s.status === 'completed').length,
    0
  );
  const totalSets = workout.exercises.reduce((sum: number, ex) => sum + ex.sets.length, 0);

  const handleClick = (): void => {
    void navigate(`/lifting/workouts/${workout.id}`);
  };

  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid var(--indigo-6)',
        borderRadius: '12px',
      }}
    >
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Flex align="center" gap="2">
            <DumbbellIcon />
            <Text size="3" weight="medium">Lifting</Text>
          </Flex>
          <Badge color={color}>{label}</Badge>
        </Flex>

        <Box>
          <Text size="4" weight="medium">{workout.plan_day_name}</Text>
          <Text size="2" color="gray" style={{ display: 'block' }}>
            Week {workout.week_number} · {workout.exercises.length} exercises
          </Text>
        </Box>

        {workout.status === 'in_progress' && (
          <Text size="2" color="gray">
            Progress: {completedSets}/{totalSets} sets
          </Text>
        )}

        <Button
          size="2"
          variant={workout.status === 'pending' ? 'solid' : 'soft'}
          onClick={handleClick}
          style={{ marginTop: '4px' }}
        >
          {workout.status === 'pending' ? 'Start Workout' : 'Continue'}
        </Button>
      </Flex>
    </Box>
  );
}

function DumbbellIcon(): JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--indigo-9)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6.5 6.5 11 11" />
      <path d="m21 21-1-1" />
      <path d="m3 3 1 1" />
      <path d="m18 22 4-4" />
      <path d="m2 6 4-4" />
      <path d="m3 10 7-7" />
      <path d="m14 21 7-7" />
    </svg>
  );
}
