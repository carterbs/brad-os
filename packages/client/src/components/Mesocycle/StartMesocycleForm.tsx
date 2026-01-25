import { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Heading,
  Button,
  Select,
  TextField,
} from '@radix-ui/themes';
import type { Plan } from '@brad-os/shared';

interface StartMesocycleFormProps {
  plans: Plan[];
  onSubmit: (planId: number, startDate: string) => void;
  isSubmitting?: boolean;
  error?: string | null;
}

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function StartMesocycleForm({
  plans,
  onSubmit,
  isSubmitting = false,
  error = null,
}: StartMesocycleFormProps): JSX.Element {
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(getTodayDateString());

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (selectedPlanId && startDate) {
      onSubmit(parseInt(selectedPlanId, 10), startDate);
    }
  };

  const isValid = selectedPlanId !== '' && startDate !== '';

  if (plans.length === 0) {
    return (
      <Box
        p="4"
        style={{
          backgroundColor: 'var(--gray-2)',
          borderRadius: 'var(--radius-3)',
          border: '1px solid var(--gray-5)',
        }}
        data-testid="no-plans-message"
      >
        <Flex direction="column" gap="2" align="center">
          <Text color="gray">No plans available.</Text>
          <Text size="1" color="gray">
            Create a plan first to start a mesocycle.
          </Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box
      p="4"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-5)',
      }}
      data-testid="start-mesocycle-form"
    >
      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="4">
          <Heading size="4">Start New Mesocycle</Heading>

          {error != null && error !== '' && (
            <Text color="red" size="2" data-testid="form-error">
              {error}
            </Text>
          )}

          <Flex direction="column" gap="2">
            <Text as="label" size="2" weight="medium" htmlFor="plan-select">
              Select a Plan
            </Text>
            <Select.Root
              value={selectedPlanId}
              onValueChange={setSelectedPlanId}
              disabled={isSubmitting}
            >
              <Select.Trigger
                placeholder="Choose a plan..."
                data-testid="plan-select"
                id="plan-select"
              />
              <Select.Content>
                {plans.map((plan) => (
                  <Select.Item
                    key={plan.id}
                    value={String(plan.id)}
                    data-testid={`plan-option-${plan.id}`}
                  >
                    {plan.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Flex>

          <Flex direction="column" gap="2">
            <Text as="label" size="2" weight="medium" htmlFor="start-date">
              Start Date
            </Text>
            <TextField.Root
              type="date"
              id="start-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={isSubmitting}
              data-testid="start-date-input"
            />
          </Flex>

          <Button
            type="submit"
            disabled={!isValid || isSubmitting}
            data-testid="start-mesocycle-button"
          >
            {isSubmitting ? 'Starting...' : 'Start Mesocycle'}
          </Button>
        </Flex>
      </form>
    </Box>
  );
}
