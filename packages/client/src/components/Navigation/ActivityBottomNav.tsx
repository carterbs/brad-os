import { useNavigate } from 'react-router-dom';
import { Flex, Text } from '@radix-ui/themes';

interface ActivityBottomNavProps {
  backPath: string;
  activityName: string;
}

export function ActivityBottomNav({
  backPath,
  activityName,
}: ActivityBottomNavProps): JSX.Element {
  const navigate = useNavigate();

  const handleBackClick = (): void => {
    void navigate(backPath);
  };

  return (
    <Flex
      asChild
      justify="start"
      align="center"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '64px',
        backgroundColor: 'var(--gray-1)',
        borderTop: '1px solid var(--gray-5)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: '16px',
      }}
    >
      <nav aria-label={`${activityName} navigation`}>
        <button
          onClick={handleBackClick}
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            color: 'var(--gray-11)',
            padding: '8px 16px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
          aria-label="Back to Activities"
        >
          <ArrowLeftIcon />
          <Text size="2">Back</Text>
        </button>
      </nav>
    </Flex>
  );
}

function ArrowLeftIcon(): JSX.Element {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}
