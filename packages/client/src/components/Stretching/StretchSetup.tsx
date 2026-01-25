/**
 * Stretch Setup Component
 *
 * Configuration screen for stretching sessions. Users can:
 * - Reorder body regions via drag-and-drop
 * - Toggle regions on/off
 * - Set duration per region (1 or 2 minutes)
 * - Configure Spotify playlist URL
 * - See total session time
 */

import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Box, Flex, Text, Button, TextField, Heading } from '@radix-ui/themes';
import type { StretchSessionConfig } from '@brad-os/shared';
import { RegionItem } from './RegionItem';
import { saveStretchConfig } from '../../utils/stretchStorage';

interface StretchSetupProps {
  config: StretchSessionConfig;
  onConfigChange: (config: StretchSessionConfig) => void;
  onStart: () => void;
  lastStretchedAt?: string | null;
}

export function StretchSetup({
  config,
  onConfigChange,
  onStart,
  lastStretchedAt,
}: StretchSetupProps): JSX.Element {
  const [spotifyUrl, setSpotifyUrl] = useState(config.spotifyPlaylistUrl ?? '');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Calculate total session time
  const totalSeconds = useMemo(() => {
    return config.regions
      .filter((r) => r.enabled)
      .reduce((sum, r) => sum + r.durationSeconds, 0);
  }, [config.regions]);

  const enabledCount = useMemo(() => {
    return config.regions.filter((r) => r.enabled).length;
  }, [config.regions]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = config.regions.findIndex((r) => r.region === active.id);
        const newIndex = config.regions.findIndex((r) => r.region === over.id);

        const newRegions = arrayMove(config.regions, oldIndex, newIndex);
        const newConfig = { ...config, regions: newRegions };
        onConfigChange(newConfig);
        saveStretchConfig(newConfig);
      }
    },
    [config, onConfigChange]
  );

  const handleToggleEnabled = useCallback(
    (region: string, enabled: boolean) => {
      const newRegions = config.regions.map((r) =>
        r.region === region ? { ...r, enabled } : r
      );
      const newConfig = { ...config, regions: newRegions };
      onConfigChange(newConfig);
      saveStretchConfig(newConfig);
    },
    [config, onConfigChange]
  );

  const handleToggleDuration = useCallback(
    (region: string) => {
      const newRegions = config.regions.map((r) => {
        if (r.region !== region) return r;
        const newDuration: 60 | 120 = r.durationSeconds === 60 ? 120 : 60;
        return { ...r, durationSeconds: newDuration };
      });
      const newConfig = { ...config, regions: newRegions };
      onConfigChange(newConfig);
      saveStretchConfig(newConfig);
    },
    [config, onConfigChange]
  );

  const handleSpotifyUrlBlur = useCallback(() => {
    const newConfig = {
      ...config,
      spotifyPlaylistUrl: spotifyUrl.trim() || null,
    };
    onConfigChange(newConfig);
    saveStretchConfig(newConfig);
  }, [config, spotifyUrl, onConfigChange]);

  return (
    <Box style={{ padding: '16px', paddingBottom: '100px' }}>
      <Heading size="6" mb="4">
        Stretching
      </Heading>

      {lastStretchedAt !== undefined && lastStretchedAt !== null && (
        <Text size="2" color="gray" style={{ display: 'block', marginBottom: '16px' }}>
          Last stretched: {lastStretchedAt}
        </Text>
      )}

      <Box mb="4">
        <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
          Body Regions
        </Text>
        <Text size="1" color="gray" mb="3" style={{ display: 'block' }}>
          Drag to reorder. Tap duration to toggle between 1 and 2 minutes.
        </Text>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={config.regions.map((r) => r.region)}
            strategy={verticalListSortingStrategy}
          >
            <Flex direction="column" gap="2">
              {config.regions.map((regionConfig) => (
                <RegionItem
                  key={regionConfig.region}
                  config={regionConfig}
                  onToggleEnabled={handleToggleEnabled}
                  onToggleDuration={handleToggleDuration}
                />
              ))}
            </Flex>
          </SortableContext>
        </DndContext>
      </Box>

      <Box mb="4">
        <Text size="2" weight="medium" mb="2" style={{ display: 'block' }}>
          Spotify Playlist (optional)
        </Text>
        <TextField.Root
          placeholder="https://open.spotify.com/playlist/..."
          value={spotifyUrl}
          onChange={(e) => setSpotifyUrl(e.target.value)}
          onBlur={handleSpotifyUrlBlur}
        />
        <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
          Opens Spotify before starting. Music plays during stretches.
        </Text>
      </Box>

      <Flex
        justify="between"
        align="center"
        style={{
          position: 'fixed',
          bottom: '64px', // Above bottom nav
          left: 0,
          right: 0,
          padding: '16px',
          backgroundColor: 'var(--gray-1)',
          borderTop: '1px solid var(--gray-5)',
        }}
      >
        <Flex direction="column">
          <Text size="2" weight="medium">
            Total: {formatDuration(totalSeconds)}
          </Text>
          <Text size="1" color="gray">
            {enabledCount} regions
          </Text>
        </Flex>

        <Button
          size="3"
          onClick={onStart}
          disabled={enabledCount === 0}
          style={{ minWidth: '140px' }}
        >
          Start Stretching
        </Button>
      </Flex>
    </Box>
  );
}
