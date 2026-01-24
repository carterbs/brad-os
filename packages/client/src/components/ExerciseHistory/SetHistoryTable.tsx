import { Flex, Text, Box, Heading } from '@radix-ui/themes';
import type { ExerciseHistoryEntry } from '@lifting/shared';

interface Props {
  entries: ExerciseHistoryEntry[];
}

export function SetHistoryTable({ entries }: Props): JSX.Element {
  const reversedEntries = [...entries].reverse();

  return (
    <Flex direction="column" gap="3" data-testid="set-history-table">
      <Heading size="4">Set History</Heading>

      {/* Header row */}
      <Flex
        px="3"
        py="1"
        justify="between"
        align="center"
      >
        <Text size="1" color="gray" weight="bold" style={{ flex: '1 1 0' }}>Date</Text>
        <Text size="1" color="gray" weight="bold" style={{ flex: '1 1 0', textAlign: 'right' }}>Weight</Text>
        <Text size="1" color="gray" weight="bold" style={{ flex: '0.6 1 0', textAlign: 'right' }}>Reps</Text>
        <Text size="1" color="gray" weight="bold" style={{ flex: '0.5 1 0', textAlign: 'right' }}>Sets</Text>
      </Flex>

      {/* Data rows */}
      <Flex direction="column" gap="1">
        {reversedEntries.map(entry => (
          <Box
            key={entry.workout_id}
            px="3"
            py="2"
            style={{
              backgroundColor: 'var(--gray-2)',
              borderRadius: 'var(--radius-2)',
            }}
          >
            <Flex justify="between" align="center">
              <Text size="2" style={{ flex: '1 1 0' }}>
                {new Date(entry.date).toLocaleDateString()}
              </Text>
              <Text size="2" weight="medium" style={{ flex: '1 1 0', textAlign: 'right' }}>
                {entry.best_weight} lbs
              </Text>
              <Text size="2" color="gray" style={{ flex: '0.6 1 0', textAlign: 'right' }}>
                {entry.best_set_reps}
              </Text>
              <Text size="2" color="gray" style={{ flex: '0.5 1 0', textAlign: 'right' }}>
                {entry.sets.length}
              </Text>
            </Flex>
          </Box>
        ))}
      </Flex>
    </Flex>
  );
}
