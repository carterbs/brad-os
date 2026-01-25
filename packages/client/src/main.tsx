import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import 'react-calendar/dist/Calendar.css';
import './global.css';
import { App } from './components/App';
import { registerServiceWorker } from './utils/serviceWorker';

// Register service worker for push notifications (don't block rendering)
void registerServiceWorker();

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="medium">
      <App />
    </Theme>
  </StrictMode>
);
