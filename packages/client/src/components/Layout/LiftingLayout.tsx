import { Outlet } from 'react-router-dom';
import { Box } from '@radix-ui/themes';
import { LiftingBottomNav } from '../Navigation';

export function LiftingLayout(): JSX.Element {
  return (
    <>
      <Box style={{ paddingBottom: '80px' }}>
        <Outlet />
      </Box>
      <LiftingBottomNav />
    </>
  );
}
