/**
 * Stretch Audio Playback Engine
 *
 * Handles audio playback for narrated stretching sessions using <audio> elements.
 * Integrates with MediaSession API for lock screen controls.
 *
 * Uses <audio> elements instead of Web Audio API because:
 * 1. <audio> integrates with OS media session for background playback
 * 2. Web Audio API AudioContext gets suspended when app is backgrounded on mobile
 * 3. We need lock screen controls (play/pause, next) via MediaSession
 */

import { getAssetUrl } from './stretchData';

// Singleton audio elements
let narrationAudio: HTMLAudioElement | null = null;
let keepaliveAudio: HTMLAudioElement | null = null;
let isInitialized = false;
let isKeepaliveRunning = false;

// Callbacks for MediaSession actions
let onPauseCallback: (() => void) | null = null;
let onPlayCallback: (() => void) | null = null;
let onNextCallback: (() => void) | null = null;

/**
 * Error thrown when audio playback fails.
 */
export class AudioPlaybackError extends Error {
  constructor(
    message: string,
    public readonly clipPath: string
  ) {
    super(message);
    this.name = 'AudioPlaybackError';
  }
}

/**
 * Initialize the stretch audio system.
 * MUST be called during a user gesture (click, touch) to work on iOS.
 *
 * This creates the audio elements and unlocks playback. Safe to call multiple times.
 */
export function initStretchAudio(): void {
  if (isInitialized) {
    return;
  }

  // Create narration audio element
  narrationAudio = new Audio();
  narrationAudio.preload = 'auto';

  // Create keepalive audio element for silent loop
  keepaliveAudio = new Audio();
  keepaliveAudio.preload = 'auto';
  keepaliveAudio.loop = true;
  keepaliveAudio.volume = 0.01; // Nearly silent but maintains audio session

  // Set up MediaSession handlers if available
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('pause', () => {
      onPauseCallback?.();
    });

    navigator.mediaSession.setActionHandler('play', () => {
      onPlayCallback?.();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      onNextCallback?.();
    });
  }

  isInitialized = true;
}

/**
 * Check if the audio system is initialized.
 */
export function isAudioInitialized(): boolean {
  return isInitialized;
}

/**
 * Set callbacks for MediaSession actions.
 * These are called when the user interacts with lock screen controls.
 */
export function setMediaSessionCallbacks(callbacks: {
  onPause?: () => void;
  onPlay?: () => void;
  onNext?: () => void;
}): void {
  onPauseCallback = callbacks.onPause ?? null;
  onPlayCallback = callbacks.onPlay ?? null;
  onNextCallback = callbacks.onNext ?? null;
}

/**
 * Play a narration audio clip.
 *
 * Plays narration while keeping the keepalive loop running in the background.
 * The keepalive continues at 1% volume to maintain the audio session, which is
 * essential for:
 * 1. Background playback when screen is locked (iOS/Android)
 * 2. Allowing external music apps (Spotify) to continue playing
 *
 * Resolves when the clip finishes playing.
 * Rejects with AudioPlaybackError if the clip fails to load.
 *
 * @param clipPath - Relative path to the audio clip (e.g., "neck/neck-forward-tilt-begin.wav")
 * @returns Promise that resolves when playback completes
 */
export async function playNarration(clipPath: string): Promise<void> {
  if (!narrationAudio) {
    throw new Error('Audio not initialized. Call initStretchAudio() first.');
  }

  // Note: We intentionally do NOT pause keepalive during narration.
  // Keeping it running at 1% volume maintains the audio session,
  // which prevents iOS/Android from suspending audio when the screen is locked
  // and allows Spotify to continue playing without interruption.

  const url = getAssetUrl(clipPath);

  return new Promise((resolve, reject) => {
    if (!narrationAudio) {
      reject(new Error('Audio element not available'));
      return;
    }

    const cleanup = (): void => {
      if (narrationAudio) {
        narrationAudio.onended = null;
        narrationAudio.onerror = null;
        narrationAudio.oncanplaythrough = null;
      }
    };

    narrationAudio.onended = (): void => {
      cleanup();
      resolve();
    };

    narrationAudio.onerror = (): void => {
      cleanup();
      reject(new AudioPlaybackError(`Failed to load audio: ${url}`, clipPath));
    };

    narrationAudio.src = url;
    narrationAudio.load();

    // Start playback
    const playPromise = narrationAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch((error: Error) => {
        cleanup();
        reject(new AudioPlaybackError(`Playback failed: ${error.message}`, clipPath));
      });
    }
  });
}

/**
 * Start the silent keepalive loop.
 * This maintains the audio session and keeps the PWA alive on lock screen.
 */
export function startKeepalive(): void {
  if (!keepaliveAudio || isKeepaliveRunning) {
    return;
  }

  const silenceUrl = getAssetUrl('shared/silence-1s.wav');
  keepaliveAudio.src = silenceUrl;
  keepaliveAudio.load();

  const playPromise = keepaliveAudio.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        isKeepaliveRunning = true;
      })
      .catch((error: Error) => {
        console.warn('Failed to start keepalive audio:', error.message);
      });
  }
}

/**
 * Stop the keepalive loop completely.
 * Call this when ending a session.
 */
export function stopKeepalive(): void {
  if (!keepaliveAudio) {
    return;
  }
  keepaliveAudio.pause();
  keepaliveAudio.currentTime = 0;
  isKeepaliveRunning = false;
}

/**
 * Check if keepalive is currently running.
 */
export function isKeepaliveActive(): boolean {
  return isKeepaliveRunning;
}

/**
 * Update MediaSession metadata for lock screen display.
 *
 * @param stretchName - Name of the current stretch
 * @param regionLabel - Human-readable label for the body region
 * @param segment - Current segment number (1 or 2)
 */
export function setMediaSessionMetadata(
  stretchName: string,
  regionLabel: string,
  segment: 1 | 2
): void {
  if (!('mediaSession' in navigator)) {
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: stretchName,
    artist: `${regionLabel} - Segment ${segment}/2`,
    album: 'Stretching Session',
  });
}

/**
 * Update MediaSession playback state.
 *
 * @param state - The playback state ('playing', 'paused', or 'none')
 */
export function setMediaSessionPlaybackState(
  state: 'playing' | 'paused' | 'none'
): void {
  if (!('mediaSession' in navigator)) {
    return;
  }

  navigator.mediaSession.playbackState = state;
}

/**
 * Stop the current narration audio.
 * Call this when skipping a stretch or segment to interrupt the narration.
 */
export function stopNarration(): void {
  if (narrationAudio) {
    narrationAudio.pause();
    narrationAudio.currentTime = 0;
    narrationAudio.onended = null;
    narrationAudio.onerror = null;
  }
}

/**
 * Stop all audio and clean up.
 * Call this when ending a session or unmounting.
 */
export function stopAllAudio(): void {
  stopNarration();

  stopKeepalive();

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  }
}

/**
 * Reset the audio system.
 * Primarily for testing purposes.
 */
export function resetStretchAudio(): void {
  stopAllAudio();
  narrationAudio = null;
  keepaliveAudio = null;
  isInitialized = false;
  isKeepaliveRunning = false;
  onPauseCallback = null;
  onPlayCallback = null;
  onNextCallback = null;
}
