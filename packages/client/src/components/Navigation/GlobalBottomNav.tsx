import { useLocation, Link } from 'react-router-dom';
import { Flex, Text } from '@radix-ui/themes';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    path: '/',
    label: 'Today',
    icon: <TodayIcon />,
  },
  {
    path: '/activities',
    label: 'Activities',
    icon: <GridIcon />,
  },
  {
    path: '/history',
    label: 'History',
    icon: <HistoryIcon />,
  },
  {
    path: '/profile',
    label: 'Profile',
    icon: <UserIcon />,
  },
];

export function GlobalBottomNav(): JSX.Element {
  const location = useLocation();

  // Determine active state - handle nested routes
  const getIsActive = (path: string): boolean => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
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
        margin: 0,
        minHeight: '52px',
        backgroundColor: 'var(--gray-1)',
        borderTop: '1px solid var(--gray-5)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <nav aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = getIsActive(item.path);
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

function TodayIcon(): JSX.Element {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function GridIcon(): JSX.Element {
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
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function HistoryIcon(): JSX.Element {
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
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <rect x="8" y="14" width="2" height="2" />
      <rect x="14" y="14" width="2" height="2" />
      <rect x="8" y="18" width="2" height="2" />
      <rect x="14" y="18" width="2" height="2" />
    </svg>
  );
}

function UserIcon(): JSX.Element {
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
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
