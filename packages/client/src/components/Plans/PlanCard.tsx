import { Box, Flex, Text, Heading, Badge, IconButton, DropdownMenu } from '@radix-ui/themes';
import type { Plan } from '@lifting/shared';
import { useNavigate } from 'react-router-dom';

interface PlanCardProps {
  plan: Plan;
  daysCount?: number;
  exercisesCount?: number;
  onEdit?: (plan: Plan) => void;
  onDelete?: (plan: Plan) => void;
}

export function PlanCard({
  plan,
  daysCount = 0,
  exercisesCount = 0,
  onEdit,
  onDelete,
}: PlanCardProps): JSX.Element {
  const navigate = useNavigate();

  const handleClick = (): void => {
    navigate(`/plans/${plan.id}`);
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-5)',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      }}
      onClick={handleClick}
      data-testid="plan-card"
    >
      <Flex justify="between" align="start" gap="3">
        <Flex direction="column" gap="2" style={{ flex: 1 }}>
          <Flex gap="2" align="center">
            <Heading size="3" data-testid="plan-name">
              {plan.name}
            </Heading>
          </Flex>

          <Flex gap="3" wrap="wrap">
            <Badge color="blue" variant="soft" size="1" data-testid="plan-duration">
              {plan.duration_weeks} {plan.duration_weeks === 1 ? 'week' : 'weeks'}
            </Badge>
            {daysCount > 0 && (
              <Badge color="gray" variant="soft" size="1">
                {daysCount} {daysCount === 1 ? 'day' : 'days'}
              </Badge>
            )}
            {exercisesCount > 0 && (
              <Badge color="gray" variant="soft" size="1">
                {exercisesCount} {exercisesCount === 1 ? 'exercise' : 'exercises'}
              </Badge>
            )}
          </Flex>

          <Text size="1" color="gray">
            Created {formatDate(plan.created_at)}
          </Text>
        </Flex>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              data-testid={`plan-menu-${plan.id}`}
              aria-label="Plan options"
            >
              <DotsVerticalIcon />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item
              onSelect={(e) => {
                e.preventDefault();
                onEdit?.(plan);
              }}
              data-testid={`edit-plan-${plan.id}`}
            >
              Edit
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item
              color="red"
              onSelect={(e) => {
                e.preventDefault();
                onDelete?.(plan);
              }}
              data-testid={`delete-plan-${plan.id}`}
            >
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    </Box>
  );
}

function DotsVerticalIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.625 2.5C8.625 3.12132 8.12132 3.625 7.5 3.625C6.87868 3.625 6.375 3.12132 6.375 2.5C6.375 1.87868 6.87868 1.375 7.5 1.375C8.12132 1.375 8.625 1.87868 8.625 2.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM7.5 13.625C8.12132 13.625 8.625 13.1213 8.625 12.5C8.625 11.8787 8.12132 11.375 7.5 11.375C6.87868 11.375 6.375 11.8787 6.375 12.5C6.375 13.1213 6.87868 13.625 7.5 13.625Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}
