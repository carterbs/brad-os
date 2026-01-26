import { Outlet } from 'react-router-dom';
import { Box } from '@radix-ui/themes';
import { ActivityBottomNav } from '../Navigation';

interface ActivityLayoutProps {
  backPath: string;
  activityName: string;
}

export function ActivityLayout({
  backPath,
  activityName,
}: ActivityLayoutProps): JSX.Element {
  return (
    <>
      <Box style={{
        minHeight: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(68px + env(safe-area-inset-bottom))',
      }}>
        <Outlet />
      </Box>
      <ActivityBottomNav backPath={backPath} activityName={activityName} />
    </>
  );
}
