/**
 * Session Recovery Prompt Component
 *
 * Displayed when a saved session state is found in localStorage
 * (less than 1 hour old). Prompts user to resume or discard.
 */

import { Box, Flex, Text, Heading, Button, Card } from '@radix-ui/themes';

interface SessionRecoveryPromptProps {
  onResume: () => void;
  onDiscard: () => void;
}

export function SessionRecoveryPrompt({
  onResume,
  onDiscard,
}: SessionRecoveryPromptProps): JSX.Element {
  return (
    <Box style={{ padding: '16px' }}>
      <Flex direction="column" align="center" gap="4">
        <Heading size="6">Unfinished Session</Heading>

        <Card size="3" style={{ maxWidth: '320px', textAlign: 'center' }}>
          <Text as="p" size="2" color="gray" mb="4">
            You have an unfinished stretching session. Would you like to resume
            where you left off?
          </Text>

          <Flex gap="3" justify="center">
            <Button variant="soft" color="gray" onClick={onDiscard}>
              Start Over
            </Button>
            <Button onClick={onResume}>Resume</Button>
          </Flex>
        </Card>
      </Flex>
    </Box>
  );
}
