import { Link } from 'react-router-dom';
import { Box, Flex, Text, IconButton } from '@radix-ui/themes';
import type { Exercise } from '@brad-os/shared';

interface ExerciseListItemProps {
  exercise: Exercise;
  onDelete?: ((exercise: Exercise) => void) | undefined;
}

export function ExerciseListItem({
  exercise,
  onDelete,
}: ExerciseListItemProps): JSX.Element {
  return (
    <Box
      p="3"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-4)',
      }}
      data-testid="exercise-item"
    >
      <Flex justify="between" align="center">
        <Link
          to={`/lifting/exercises/${exercise.id}/history`}
          style={{
            textDecoration: 'none',
            color: 'inherit',
            cursor: 'pointer',
            flex: 1,
          }}
          data-testid="exercise-link"
        >
          <Flex direction="column" gap="1">
            <Text weight="medium">{exercise.name}</Text>
            <Text size="1" color="gray">
              +{exercise.weight_increment} lbs per progression
            </Text>
          </Flex>
        </Link>

        <Flex gap="3">
          <IconButton
            size="3"
            variant="ghost"
            color="gray"
            aria-label="Delete exercise"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(exercise);
            }}
          >
            <TrashIcon />
          </IconButton>
        </Flex>
      </Flex>
    </Box>
  );
}


function TrashIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
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

