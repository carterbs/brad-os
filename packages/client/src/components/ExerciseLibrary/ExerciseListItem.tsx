import { Link } from 'react-router-dom';
import { Box, Flex, Text, IconButton } from '@radix-ui/themes';
import type { Exercise } from '@lifting/shared';

interface ExerciseListItemProps {
  exercise: Exercise;
  onEdit?: ((exercise: Exercise) => void) | undefined;
  onDelete?: ((exercise: Exercise) => void) | undefined;
}

export function ExerciseListItem({
  exercise,
  onEdit,
  onDelete,
}: ExerciseListItemProps): JSX.Element {
  return (
    <Box
      p="3"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-5)',
      }}
      data-testid="exercise-item"
    >
      <Flex justify="between" align="center">
        <Flex direction="column" gap="1">
          <Text weight="medium">{exercise.name}</Text>
          <Text size="1" color="gray">
            +{exercise.weight_increment} lbs per progression
          </Text>
        </Flex>

        <Flex gap="2">
          <Link to={`/exercises/${exercise.id}/history`} aria-label="View history">
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              asChild
            >
              <span><HistoryIcon /></span>
            </IconButton>
          </Link>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label="Edit exercise"
            onClick={() => onEdit?.(exercise)}
          >
            <EditIcon />
          </IconButton>
          <IconButton
            size="1"
            variant="ghost"
            color="red"
            aria-label="Delete exercise"
            onClick={() => onDelete?.(exercise)}
          >
            <TrashIcon />
          </IconButton>
        </Flex>
      </Flex>
    </Box>
  );
}

function EditIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.8536 1.14645C11.6583 0.951184 11.3417 0.951184 11.1465 1.14645L3.71455 8.57836C3.62459 8.66832 3.55263 8.77461 3.50251 8.89155L2.04044 12.303C1.9599 12.491 2.00189 12.709 2.14646 12.8536C2.29103 12.9981 2.50905 13.0401 2.69697 12.9596L6.10847 11.4975C6.2254 11.4474 6.3317 11.3754 6.42166 11.2855L13.8536 3.85355C14.0488 3.65829 14.0488 3.34171 13.8536 3.14645L11.8536 1.14645ZM4.42166 9.28547L11.5 2.20711L12.7929 3.5L5.71455 10.5784L4.21924 11.2192L3.78081 10.7808L4.42166 9.28547Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
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

function HistoryIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.5 0.875C3.83152 0.875 0.875 3.83152 0.875 7.5C0.875 11.1685 3.83152 14.125 7.5 14.125C11.1685 14.125 14.125 11.1685 14.125 7.5C14.125 3.83152 11.1685 0.875 7.5 0.875ZM1.875 7.5C1.875 4.38388 4.38388 1.875 7.5 1.875C10.6161 1.875 13.125 4.38388 13.125 7.5C13.125 10.6161 10.6161 13.125 7.5 13.125C4.38388 13.125 1.875 10.6161 1.875 7.5ZM8 4.5C8 4.22386 7.77614 4 7.5 4C7.22386 4 7 4.22386 7 4.5V7.5C7 7.63261 7.05268 7.75979 7.14645 7.85355L9.14645 9.85355C9.34171 10.0488 9.65829 10.0488 9.85355 9.85355C10.0488 9.65829 10.0488 9.34171 9.85355 9.14645L8 7.29289V4.5Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
