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
      <Box style={{ paddingBottom: '80px' }}>
        <Outlet />
      </Box>
      <ActivityBottomNav backPath={backPath} activityName={activityName} />
    </>
  );
}
