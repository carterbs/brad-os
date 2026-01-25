/**
 * Meditation Page
 *
 * Main page for the meditation feature. Handles the full session lifecycle:
 * - Setup screen (configure duration)
 * - Active session (breathing animation, timer, controls)
 * - Session complete (summary)
 * - Session recovery prompt (for interrupted sessions)
 */

import { useState, useEffect, useCallback } from 'react';
import { Box, Flex, Text, Heading, Button, Card, Spinner } from '@radix-ui/themes';
import type { MeditationManifest, MeditationDuration } from '@brad-os/shared';
import { useMeditationSession } from '../hooks/useMeditationSession';
import { loadMeditationManifest } from '../utils/meditationData';
import { initMeditationAudio } from '../utils/meditationAudio';
import { loadMeditationConfig, saveMeditationConfig } from '../utils/meditationStorage';
import {
  MeditationSetup,
  MeditationSession,
  MeditationComplete,
} from '../components/Meditation';

/**
 * Session Recovery Prompt Component
 *
 * Displayed when a saved meditation session state is found in localStorage.
 * Prompts user to resume or discard.
 */
function MeditationRecoveryPrompt({
  onResume,
  onDiscard,
}: {
  onResume: () => void;
  onDiscard: () => void;
}): JSX.Element {
  return (
    <Box style={{ padding: '16px' }}>
      <Flex direction="column" align="center" gap="4">
        <Heading size="6">Unfinished Session</Heading>

        <Card size="3" style={{ maxWidth: '320px', textAlign: 'center' }}>
          <Text as="p" size="2" color="gray" mb="4">
            You have an unfinished meditation session. Would you like to resume
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

export function MeditationPage(): JSX.Element | null {
  const [manifest, setManifest] = useState<MeditationManifest | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<MeditationDuration>(() =>
    loadMeditationConfig()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load manifest on mount
  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const loadedManifest = await loadMeditationManifest();
        setManifest(loadedManifest);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : 'Failed to load meditation data'
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  const session = useMeditationSession({
    manifest,
  });

  const handleDurationChange = useCallback((duration: MeditationDuration) => {
    setSelectedDuration(duration);
    saveMeditationConfig(duration);
  }, []);

  const handleStart = useCallback(() => {
    // Initialize audio on user gesture
    initMeditationAudio();

    // Start the session with selected duration
    session.start(selectedDuration);
  }, [session, selectedDuration]);

  const handleDone = useCallback(() => {
    session.end();
  }, [session]);

  // Loading state
  if (isLoading) {
    return (
      <Flex
        direction="column"
        align="center"
        justify="center"
        style={{ minHeight: '50vh' }}
      >
        <Spinner size="3" />
        <Text size="2" color="gray" mt="3">
          Loading meditation...
        </Text>
      </Flex>
    );
  }

  // Error state
  if (loadError !== null) {
    return (
      <Box style={{ padding: '16px' }}>
        <Text color="red">Error: {loadError}</Text>
      </Box>
    );
  }

  // Show recovery prompt if there's a saved session
  if (session.hasSavedSession && session.status === 'idle') {
    return (
      <MeditationRecoveryPrompt
        onResume={session.resumeSavedSession}
        onDiscard={session.discardSavedSession}
      />
    );
  }

  // Show completion screen
  if (session.status === 'complete') {
    return (
      <MeditationComplete
        plannedDurationMinutes={session.durationMinutes}
        actualDurationSeconds={session.elapsedSeconds}
        completedFully={session.completedFully}
        onDone={handleDone}
      />
    );
  }

  // Show active session
  if (session.status === 'active' || session.status === 'paused') {
    return (
      <MeditationSession
        sessionName={session.sessionName}
        remainingSeconds={session.remainingSeconds}
        totalSeconds={session.totalSeconds}
        currentPhase={session.currentPhase}
        isPaused={session.status === 'paused'}
        audioError={session.audioError}
        onPause={session.pause}
        onResume={session.resume}
        onEnd={session.end}
        onRetryAudio={session.retryAudio}
        onSkipAudio={session.skipAudio}
      />
    );
  }

  // Default: Show setup screen
  return (
    <MeditationSetup
      selectedDuration={selectedDuration}
      onDurationChange={handleDurationChange}
      onStart={() => void handleStart()}
    />
  );
}
