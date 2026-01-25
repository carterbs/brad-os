import { Container, Flex, Heading, Button, Text } from '@radix-ui/themes';
import { useNavigate } from 'react-router-dom';
import { usePlans } from '../hooks/usePlans';
import { PlanList } from '../components/Plans';

export function PlansPage(): JSX.Element {
  const navigate = useNavigate();
  const { data: plans, isLoading, error } = usePlans();

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center">
          <Heading size="6">My Plans</Heading>
          <Button onClick={() => void navigate('/lifting/plans/new')} data-testid="create-plan-button">
            Create Plan
          </Button>
        </Flex>

        {error && (
          <Text color="red" as="p">
            Failed to load plans: {error.message}
          </Text>
        )}

        <PlanList plans={plans ?? []} isLoading={isLoading} />
      </Flex>
    </Container>
  );
}
