import { Outlet } from 'react-router-dom';
import { Box } from '@radix-ui/themes';
import { GlobalBottomNav } from '../Navigation';

export function GlobalLayout(): JSX.Element {
  return (
    <>
      <Box style={{ paddingBottom: '80px' }}>
        <Outlet />
      </Box>
      <GlobalBottomNav />
    </>
  );
}
