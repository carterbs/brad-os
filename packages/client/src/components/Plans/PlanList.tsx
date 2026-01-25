import { useState } from 'react';
import { Flex, Text, Box } from '@radix-ui/themes';
import { useNavigate } from 'react-router-dom';
import type { Plan } from '@brad-os/shared';
import { PlanCard } from './PlanCard';
import { DeletePlanDialog } from './DeletePlanDialog';

interface PlanListProps {
  plans: Plan[];
  isLoading?: boolean;
}

export function PlanList({
  plans,
  isLoading = false,
}: PlanListProps): JSX.Element {
  const navigate = useNavigate();
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);

  const handleEdit = (plan: Plan): void => {
    void navigate(`/plans/${plan.id}/edit`);
  };

  const handleDelete = (plan: Plan): void => {
    setPlanToDelete(plan);
  };

  const handleCloseDeleteDialog = (): void => {
    setPlanToDelete(null);
  };

  if (isLoading) {
    return (
      <Flex direction="column" gap="3" data-testid="plan-list-loading">
        {[1, 2, 3].map((i) => (
          <PlanCardSkeleton key={i} />
        ))}
      </Flex>
    );
  }

  if (plans.length === 0) {
    return (
      <Box
        p="6"
        style={{
          backgroundColor: 'var(--gray-2)',
          borderRadius: 'var(--radius-3)',
          textAlign: 'center',
        }}
        data-testid="empty-plans-message"
      >
        <Text color="gray" as="p">
          You have not created any workout plans yet.
        </Text>
      </Box>
    );
  }

  return (
    <>
      <Flex direction="column" gap="3" data-testid="plan-list">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </Flex>

      <DeletePlanDialog plan={planToDelete} onClose={handleCloseDeleteDialog} />
    </>
  );
}

function PlanCardSkeleton(): JSX.Element {
  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-5)',
      }}
    >
      <Flex direction="column" gap="2">
        <Box
          style={{
            height: '20px',
            width: '150px',
            backgroundColor: 'var(--gray-4)',
            borderRadius: 'var(--radius-2)',
          }}
        />
        <Box
          style={{
            height: '16px',
            width: '100px',
            backgroundColor: 'var(--gray-4)',
            borderRadius: 'var(--radius-2)',
          }}
        />
        <Box
          style={{
            height: '14px',
            width: '120px',
            backgroundColor: 'var(--gray-4)',
            borderRadius: 'var(--radius-2)',
          }}
        />
      </Flex>
    </Box>
  );
}
