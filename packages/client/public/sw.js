/**
 * Service Worker for Push Notifications & Stretch Audio Caching
 *
 * Handles:
 * - push: Receive push notification from server and display it
 * - notificationclick: User taps notification to focus/open app
 * - install: Precache stretch audio manifest and shared clips
 * - fetch: Cache-first strategy for stretch audio files
 */

// Cache name for stretch audio files
const STRETCH_AUDIO_CACHE = 'stretch-audio-v1';

// Files to precache on install
const PRECACHE_URLS = [
  '/audio/stretching/stretches.json',
  '/audio/stretching/shared/silence-1s.wav',
  '/audio/stretching/shared/switch-sides.wav',
  '/audio/stretching/shared/halfway.wav',
  '/audio/stretching/shared/session-complete.wav',
];

// Install event: precache essential stretch audio files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STRETCH_AUDIO_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((error) => {
        console.warn('Failed to precache some stretch audio files:', error);
        // Don't fail install if some files are missing
      });
    })
  );
  // Activate immediately without waiting for existing tabs to close
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('stretch-audio-') && name !== STRETCH_AUDIO_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event: cache-first for stretch audio files
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle requests for stretch audio files
  if (!url.pathname.startsWith('/audio/stretching/')) {
    return;
  }

  event.respondWith(
    caches.open(STRETCH_AUDIO_CACHE).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network and cache for next time
        return fetch(event.request).then((networkResponse) => {
          // Only cache successful responses
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});

// Push event: receive notification data and display it
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('Push event received but no data');
    return;
  }

  let notification;
  try {
    notification = event.data.json();
  } catch (error) {
    console.error('Failed to parse push notification data:', error);
    return;
  }

  const { title, body, tag } = notification;

  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: tag || 'rest-timer',
    vibrate: [200, 100, 200],
    // Additional options for better UX
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(title || 'Lifting Tracker', options)
  );
});

// Notification click: focus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url === self.registration.scope && 'focus' in client) {
          return client.focus();
        }
      }
      // No existing window found, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
