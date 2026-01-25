import { useNavigate } from 'react-router-dom';
import { Box, Flex, Text } from '@radix-ui/themes';

export type ActivityColor = 'indigo' | 'teal' | 'purple' | 'orange' | 'cyan' | 'gray';

interface ActivityCardProps {
  id: string;
  name: string;
  icon: React.ReactNode;
  path: string;
  color: ActivityColor;
  disabled?: boolean;
  description?: string;
}

function getBackgroundColor(color: ActivityColor, disabled: boolean): string {
  if (disabled) {
    return 'rgba(107, 114, 128, 0.1)';
  }
  switch (color) {
    case 'indigo':
      return 'rgba(99, 102, 241, 0.15)';
    case 'teal':
      return 'rgba(20, 184, 166, 0.15)';
    case 'purple':
      return 'rgba(168, 85, 247, 0.15)';
    case 'orange':
      return 'rgba(249, 115, 22, 0.15)';
    case 'cyan':
      return 'rgba(6, 182, 212, 0.15)';
    case 'gray':
    default:
      return 'rgba(107, 114, 128, 0.15)';
  }
}

function getBorderColor(color: ActivityColor, disabled: boolean): string {
  if (disabled) {
    return 'var(--gray-5)';
  }
  switch (color) {
    case 'indigo':
      return 'var(--indigo-7)';
    case 'teal':
      return 'var(--teal-7)';
    case 'purple':
      return 'var(--purple-7)';
    case 'orange':
      return 'var(--orange-7)';
    case 'cyan':
      return 'var(--cyan-7)';
    case 'gray':
    default:
      return 'var(--gray-7)';
  }
}

function getIconColor(color: ActivityColor, disabled: boolean): string {
  if (disabled) {
    return 'var(--gray-8)';
  }
  switch (color) {
    case 'indigo':
      return 'var(--indigo-9)';
    case 'teal':
      return 'var(--teal-9)';
    case 'purple':
      return 'var(--purple-9)';
    case 'orange':
      return 'var(--orange-9)';
    case 'cyan':
      return 'var(--cyan-9)';
    case 'gray':
    default:
      return 'var(--gray-9)';
  }
}

export function ActivityCard({
  id,
  name,
  icon,
  path,
  color,
  disabled = false,
  description,
}: ActivityCardProps): JSX.Element {
  const navigate = useNavigate();

  const handleClick = (): void => {
    if (!disabled) {
      void navigate(path);
    }
  };

  return (
    <Box
      asChild
      style={{
        backgroundColor: getBackgroundColor(color, disabled),
        border: `1px solid ${getBorderColor(color, disabled)}`,
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={`${name}${disabled ? ' (coming soon)' : ''}`}
        data-testid={`activity-card-${id}`}
        style={{
          display: 'block',
          width: '100%',
          padding: '24px 16px',
          textAlign: 'center',
          background: 'none',
          border: 'none',
          borderRadius: '12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <Flex direction="column" align="center" gap="3">
          <Box style={{ color: getIconColor(color, disabled) }}>{icon}</Box>
          <Text size="3" weight="medium" style={{ color: disabled ? 'var(--gray-9)' : 'var(--gray-12)' }}>
            {name}
          </Text>
          {description !== undefined && description.length > 0 && (
            <Text size="1" style={{ color: 'var(--gray-10)' }}>
              {description}
            </Text>
          )}
          {disabled && (
            <Text size="1" style={{ color: 'var(--gray-9)' }}>
              Coming soon
            </Text>
          )}
        </Flex>
      </button>
    </Box>
  );
}
