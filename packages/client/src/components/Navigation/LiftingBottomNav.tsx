import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Flex, Text } from '@radix-ui/themes';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  isBack?: boolean;
}

const navItems: NavItem[] = [
  {
    path: '/activities',
    label: 'Back',
    icon: <ArrowLeftIcon />,
    isBack: true,
  },
  {
    path: '/lifting',
    label: 'Meso',
    icon: <ListIcon />,
  },
  {
    path: '/lifting/plans',
    label: 'Plans',
    icon: <ClipboardIcon />,
  },
  {
    path: '/lifting/exercises',
    label: 'Exercises',
    icon: <DumbbellIcon />,
  },
];

export function LiftingBottomNav(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active state - handle nested routes
  const getIsActive = (path: string): boolean => {
    if (path === '/lifting') {
      return location.pathname === '/lifting';
    }
    if (path === '/lifting/plans') {
      return location.pathname.startsWith('/lifting/plans');
    }
    if (path === '/lifting/exercises') {
      return location.pathname.startsWith('/lifting/exercises');
    }
    return location.pathname === path;
  };

  const handleBackClick = (e: React.MouseEvent): void => {
    e.preventDefault();
    void navigate('/activities');
  };

  return (
    <Flex
      asChild
      justify="between"
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
      }}
    >
      <nav aria-label="Lifting navigation">
        {navItems.map((item) => {
          const isActive = item.isBack !== true && getIsActive(item.path);

          if (item.isBack === true) {
            return (
              <button
                key={item.path}
                onClick={handleBackClick}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                  color: 'var(--gray-11)',
                  padding: '8px 16px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label="Back to Activities"
              >
                {item.icon}
                <Text size="1">{item.label}</Text>
              </button>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                textDecoration: 'none',
                color: isActive ? 'var(--accent-9)' : 'var(--gray-11)',
                padding: '8px 16px',
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.icon}
              <Text size="1" weight={isActive ? 'medium' : 'regular'}>
                {item.label}
              </Text>
            </Link>
          );
        })}
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

function ListIcon(): JSX.Element {
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
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ClipboardIcon(): JSX.Element {
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
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function DumbbellIcon(): JSX.Element {
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
