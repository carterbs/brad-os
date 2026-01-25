import { Container, Flex, Heading, Box, Text, Separator } from '@radix-ui/themes';
import { NotificationSettings } from '../components/Settings';
import { useMeditationStats } from '../hooks/useMeditationHistory';
import { useMesocycles } from '../hooks/useMesocycles';

export function ProfilePage(): JSX.Element {
  const { data: meditationStats } = useMeditationStats();
  const { data: mesocycles } = useMesocycles();

  // Calculate workout stats from mesocycles
  const completedMesocycles = mesocycles?.filter((m) => m.status === 'completed').length ?? 0;
  const totalMesocycles = mesocycles?.length ?? 0;

  return (
    <Container size="2" p="4">
      <Flex direction="column" gap="5">
        <Heading size="6">Profile</Heading>

        {/* Stats Overview */}
        <Box>
          <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
            Activity Stats
          </Text>
          <Flex direction="column" gap="3">
            <StatCard
              icon={<TrophyIcon />}
              label="Mesocycles Completed"
              value={completedMesocycles}
              color="indigo"
            />
            <StatCard
              icon={<DumbbellIcon />}
              label="Total Mesocycles"
              value={totalMesocycles}
              color="indigo"
            />
            <StatCard
              icon={<MeditationIcon />}
              label="Meditation Sessions"
              value={meditationStats?.totalSessions ?? 0}
              color="purple"
            />
            <StatCard
              icon={<ClockIcon />}
              label="Total Meditation Time"
              value={`${meditationStats?.totalMinutes ?? 0} min`}
              color="purple"
            />
          </Flex>
        </Box>

        <Separator size="4" />

        {/* Settings */}
        <Box>
          <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
            Settings
          </Text>
          <NotificationSettings />
        </Box>

        <Separator size="4" />

        {/* About */}
        <Box>
          <Text size="3" weight="medium" mb="3" style={{ display: 'block' }}>
            About
          </Text>
          <Flex direction="column" gap="2">
            <Text size="2" color="gray">Version 1.0.0</Text>
            <Text size="2" color="gray">
              A personal fitness tracking app for lifting, stretching, and meditation.
            </Text>
          </Flex>
        </Box>
      </Flex>
    </Container>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: 'indigo' | 'teal' | 'purple';
}

function StatCard({ icon, label, value, color }: StatCardProps): JSX.Element {
  const bgColors = {
    indigo: 'rgba(99, 102, 241, 0.1)',
    teal: 'rgba(20, 184, 166, 0.1)',
    purple: 'rgba(168, 85, 247, 0.1)',
  };

  const borderColors = {
    indigo: 'var(--indigo-6)',
    teal: 'var(--teal-6)',
    purple: 'var(--purple-6)',
  };

  return (
    <Box
      p="3"
      style={{
        backgroundColor: bgColors[color],
        border: `1px solid ${borderColors[color]}`,
        borderRadius: '8px',
      }}
    >
      <Flex justify="between" align="center">
        <Flex align="center" gap="2">
          {icon}
          <Text size="2">{label}</Text>
        </Flex>
        <Text size="4" weight="medium">{value}</Text>
      </Flex>
    </Box>
  );
}

function DumbbellIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--indigo-9)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6.5 6.5 11 11" />
      <path d="m21 21-1-1" />
      <path d="m3 3 1 1" />
      <path d="m18 22 4-4" />
      <path d="m2 6 4-4" />
      <path d="m3 10 7-7" />
      <path d="m14 21 7-7" />
    </svg>
  );
}

function TrophyIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--indigo-9)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function MeditationIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--purple-9)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function ClockIcon(): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--purple-9)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
