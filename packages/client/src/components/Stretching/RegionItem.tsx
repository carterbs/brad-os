/**
 * Region Item Component
 *
 * Individual draggable row for a body region in the stretch setup.
 * Shows drag handle, region name, duration toggle, and enable/disable switch.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Flex, Text, Switch, Badge } from '@radix-ui/themes';
import type { StretchRegionConfig } from '@lifting/shared';
import { BODY_REGION_LABELS } from '@lifting/shared';

interface RegionItemProps {
  config: StretchRegionConfig;
  onToggleEnabled: (region: string, enabled: boolean) => void;
  onToggleDuration: (region: string) => void;
}

export function RegionItem({
  config,
  onToggleEnabled,
  onToggleDuration,
}: RegionItemProps): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.region });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const regionLabel = BODY_REGION_LABELS[config.region];
  const durationLabel = config.durationSeconds === 60 ? '1m' : '2m';

  return (
    <Flex
      ref={setNodeRef}
      style={{
        ...style,
        padding: '12px',
        backgroundColor: 'var(--gray-2)',
        borderRadius: '8px',
        touchAction: 'none',
      }}
      align="center"
      gap="3"
    >
      {/* Drag Handle */}
      <Flex
        {...attributes}
        {...listeners}
        align="center"
        justify="center"
        style={{
          cursor: 'grab',
          padding: '4px',
          color: 'var(--gray-9)',
        }}
        aria-label={`Drag to reorder ${regionLabel}`}
      >
        <DragHandleIcon />
      </Flex>

      {/* Region Name */}
      <Text
        size="2"
        weight="medium"
        style={{
          flex: 1,
          opacity: config.enabled ? 1 : 0.5,
        }}
      >
        {regionLabel}
      </Text>

      {/* Duration Toggle */}
      <Badge
        color={config.enabled ? 'blue' : 'gray'}
        variant="soft"
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          minWidth: '32px',
          textAlign: 'center',
        }}
        onClick={() => onToggleDuration(config.region)}
        role="button"
        aria-label={`Duration: ${durationLabel}. Tap to toggle.`}
      >
        {durationLabel}
      </Badge>

      {/* Enable/Disable Switch */}
      <Switch
        size="2"
        checked={config.enabled}
        onCheckedChange={(checked) => onToggleEnabled(config.region, checked)}
        aria-label={`${config.enabled ? 'Disable' : 'Enable'} ${regionLabel}`}
      />
    </Flex>
  );
}

function DragHandleIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <circle cx="5" cy="4" r="1.5" />
      <circle cx="11" cy="4" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="11" cy="12" r="1.5" />
    </svg>
  );
}
