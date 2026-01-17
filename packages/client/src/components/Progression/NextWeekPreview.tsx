import { Box, Flex, Text, Heading } from '@radix-ui/themes';
import type { NextWeekResponse } from '@lifting/shared';
import { ProgressionIndicator } from './ProgressionIndicator';
import { DeloadBadge } from './DeloadBadge';

interface NextWeekPreviewProps {
  data: NextWeekResponse;
}

/**
 * Displays a preview of next week's exercise targets including
 * weight, reps, sets, and progression status.
 */
export function NextWeekPreview({ data }: NextWeekPreviewProps): JSX.Element {
  return (
    <Box
      p="4"
      data-testid="next-week-preview"
      style={{
        backgroundColor: 'var(--gray-2)',
        borderRadius: 'var(--radius-3)',
        border: '1px solid var(--gray-5)',
      }}
    >
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center">
          <Heading size="4">Week {data.weekNumber} Preview</Heading>
          {data.isDeload && <DeloadBadge />}
        </Flex>

        {data.exercises.length > 0 ? (
          <Flex direction="column" gap="3">
            {data.exercises.map((exercise) => (
              <Box
                key={exercise.exerciseId}
                p="3"
                style={{
                  backgroundColor: 'var(--gray-1)',
                  borderRadius: 'var(--radius-2)',
                  border: '1px solid var(--gray-4)',
                }}
              >
                <Flex justify="between" align="center" wrap="wrap" gap="2">
                  <Flex direction="column" gap="1" style={{ flex: 1 }}>
                    <Text size="2" weight="medium">
                      {exercise.exerciseName}
                    </Text>
                    <Flex gap="3">
                      <Text size="1" color="gray">
                        {exercise.targetWeight} lbs
                      </Text>
                      <Text size="1" color="gray">
                        {exercise.targetReps} reps
                      </Text>
                      <Text size="1" color="gray">
                        {exercise.targetSets} sets
                      </Text>
                    </Flex>
                  </Flex>
                  <ProgressionIndicator willProgress={exercise.willProgress} />
                </Flex>
              </Box>
            ))}
          </Flex>
        ) : (
          <Text size="2" color="gray">
            No exercises scheduled
          </Text>
        )}
      </Flex>
    </Box>
  );
}
