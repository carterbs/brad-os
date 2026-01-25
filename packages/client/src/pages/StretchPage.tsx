/**
 * Stretch Page
 *
 * Main page for the stretching feature. Handles the full session lifecycle:
 * - Setup screen (configure regions, duration, Spotify)
 * - Active session (timer, skip controls)
 * - Session complete (summary)
 * - Session recovery prompt (for interrupted sessions)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Box, Flex, Text, Spinner } from '@radix-ui/themes';
import type { StretchSessionConfig, StretchManifest } from '@lifting/shared';
import {
  StretchSetup,
  StretchSession,
  StretchComplete,
  SessionRecoveryPrompt,
} from '../components/Stretching';
import { useStretchSession } from '../hooks/useStretchSession';
import { useLatestStretchSession } from '../hooks/useStretchHistory';
import { loadStretchManifest } from '../utils/stretchData';
import { loadStretchConfig, saveStretchConfig } from '../utils/stretchStorage';
import { initStretchAudio } from '../utils/stretchAudio';

/**
 * Format a date as a relative time string.
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 14) {
    return '1 week ago';
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function StretchPage(): JSX.Element | null {
  const [manifest, setManifest] = useState<StretchManifest | null>(null);
  const [config, setConfig] = useState<StretchSessionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch latest stretch session from server
  const { data: latestSession } = useLatestStretchSession();

  // Format the last stretched date for display
  const lastStretchedAt = useMemo(() => {
    if (latestSession?.completedAt === undefined) {
      return null;
    }
    return formatRelativeTime(latestSession.completedAt);
  }, [latestSession]);

  // Load manifest and config on mount
  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const [loadedManifest, loadedConfig] = await Promise.all([
          loadStretchManifest(),
          Promise.resolve(loadStretchConfig()),
        ]);
        setManifest(loadedManifest);
        setConfig(loadedConfig);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : 'Failed to load stretch data'
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  const session = useStretchSession({
    config: config ?? { regions: [], spotifyPlaylistUrl: null },
    manifest,
  });

  const handleConfigChange = useCallback((newConfig: StretchSessionConfig) => {
    setConfig(newConfig);
    saveStretchConfig(newConfig);
  }, []);

  // Ref to track if we're waiting for user to return from Spotify
  const waitingForSpotifyReturnRef = useRef(false);

  // Handle visibility change for Spotify return
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (
        document.visibilityState === 'visible' &&
        waitingForSpotifyReturnRef.current
      ) {
        waitingForSpotifyReturnRef.current = false;
        // User returned from Spotify, start the session
        void session.start();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return (): void => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session]);

  const handleStart = useCallback(async () => {
    if (!config) return;

    // Initialize audio on user gesture
    initStretchAudio();

    // Open Spotify if configured
    if (config.spotifyPlaylistUrl !== null) {
      // Convert web URL to deep link format
      const url = config.spotifyPlaylistUrl;
      const playlistMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);
      if (playlistMatch) {
        const playlistId = playlistMatch[1];
        // Mark that we're waiting for return from Spotify
        waitingForSpotifyReturnRef.current = true;
        // Try deep link first, which opens Spotify app
        window.open(`spotify:playlist:${playlistId}`, '_blank');
        // Session will start when user returns (visibilitychange handler)
        return;
      }
    }

    // No Spotify configured, start immediately
    await session.start();
  }, [config, session]);

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
          Loading stretches...
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

  // Config not loaded (shouldn't happen, but type safety)
  if (config === null) {
    return null;
  }

  // Show recovery prompt if there's a saved session
  if (session.hasSavedSession && session.status === 'idle') {
    return (
      <SessionRecoveryPrompt
        onResume={session.resumeSavedSession}
        onDiscard={session.discardSavedSession}
      />
    );
  }

  // Show completion screen
  if (session.status === 'complete') {
    return (
      <StretchComplete
        completedStretches={session.completedStretches}
        sessionStartedAt={session.sessionStartedAt}
        onDone={handleDone}
      />
    );
  }

  // Show active session
  if (
    (session.status === 'active' || session.status === 'paused') &&
    session.currentStretch !== null
  ) {
    return (
      <StretchSession
        currentStretch={session.currentStretch}
        currentStretchIndex={session.currentStretchIndex}
        totalStretches={session.totalStretches}
        currentSegment={session.currentSegment}
        segmentRemaining={session.segmentRemaining}
        isPaused={session.status === 'paused'}
        audioError={session.audioError}
        onPause={session.pause}
        onResume={session.resume}
        onSkipSegment={session.skipSegment}
        onSkipStretch={session.skipStretch}
        onEnd={session.end}
        onRetryAudio={session.retryAudio}
        onSkipAudio={session.skipAudio}
      />
    );
  }

  // Default: Show setup screen
  return (
    <StretchSetup
      config={config}
      onConfigChange={handleConfigChange}
      onStart={() => void handleStart()}
      lastStretchedAt={lastStretchedAt}
    />
  );
}
