import { Outlet } from 'react-router-dom';
import { Box } from '@radix-ui/themes';
import { GlobalBottomNav } from '../Navigation';

export function GlobalLayout(): JSX.Element {
  return (
    <>
      <Box style={{
        minHeight: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'calc(68px + env(safe-area-inset-bottom))',
      }}>
        <Outlet />
      </Box>
      <GlobalBottomNav />
    </>
  );
}
