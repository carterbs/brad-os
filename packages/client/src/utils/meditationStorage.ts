/**
 * Meditation Session Storage Utilities
 *
 * Handles localStorage persistence for meditation session state and configuration.
 */

import type { MeditationSessionState, MeditationDuration } from '@brad-os/shared';
import { MEDITATION_SESSION_STALE_THRESHOLD_MS } from '@brad-os/shared';

const SESSION_STATE_KEY = 'meditation-session-state';
const CONFIG_KEY = 'meditation-config';

const DEFAULT_DURATION: MeditationDuration = 10;

/**
 * Save the current session state to localStorage.
 */
export function saveMeditationState(state: MeditationSessionState): void {
  try {
    localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save meditation session state:', error);
  }
}

/**
 * Load the session state from localStorage.
 * Returns null if no saved state exists.
 */
export function loadMeditationState(): MeditationSessionState | null {
  try {
    const saved = localStorage.getItem(SESSION_STATE_KEY);
    if (saved === null) {
      return null;
    }
    return JSON.parse(saved) as MeditationSessionState;
  } catch (error) {
    console.warn('Failed to load meditation session state:', error);
    return null;
  }
}

/**
 * Check if a saved session state is stale (older than 1 hour).
 * A stale session should be silently discarded.
 */
export function isMeditationSessionStale(state: MeditationSessionState): boolean {
  const now = Date.now();

  // Check the relevant timestamp based on status
  const relevantTimestamp =
    state.status === 'paused' ? state.pausedAt : state.sessionStartedAt;

  if (relevantTimestamp === null) {
    // No timestamp means the session never really started
    return true;
  }

  return now - relevantTimestamp > MEDITATION_SESSION_STALE_THRESHOLD_MS;
}

/**
 * Clear the saved session state.
 */
export function clearMeditationState(): void {
  try {
    localStorage.removeItem(SESSION_STATE_KEY);
  } catch (error) {
    console.warn('Failed to clear meditation session state:', error);
  }
}

/**
 * Save the user's preferred duration to localStorage.
 */
export function saveMeditationConfig(duration: MeditationDuration): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ duration }));
  } catch (error) {
    console.warn('Failed to save meditation config:', error);
  }
}

/**
 * Load the user's preferred duration from localStorage.
 * Returns default (10 minutes) if no saved config exists.
 */
export function loadMeditationConfig(): MeditationDuration {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved === null) {
      return DEFAULT_DURATION;
    }
    const parsed = JSON.parse(saved) as { duration: MeditationDuration };
    // Validate the duration is one of the allowed values
    if (parsed.duration === 5 || parsed.duration === 10 || parsed.duration === 20) {
      return parsed.duration;
    }
    return DEFAULT_DURATION;
  } catch (error) {
    console.warn('Failed to load meditation config:', error);
    return DEFAULT_DURATION;
  }
}
