/**
 * Stretch Session Storage Utilities
 *
 * Handles localStorage persistence for stretch session state and configuration.
 */

import type { StretchSessionState, StretchSessionConfig } from '@brad-os/shared';
import { DEFAULT_STRETCH_REGIONS, SESSION_STALE_THRESHOLD_MS } from '@brad-os/shared';

const SESSION_STATE_KEY = 'stretch-session-state';
const CONFIG_KEY = 'stretch-config';

/**
 * Default session configuration.
 */
export function getDefaultConfig(): StretchSessionConfig {
  return {
    regions: [...DEFAULT_STRETCH_REGIONS],
    spotifyPlaylistUrl: null,
  };
}

/**
 * Save the current session state to localStorage.
 */
export function saveStretchState(state: StretchSessionState): void {
  try {
    localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save stretch session state:', error);
  }
}

/**
 * Load the session state from localStorage.
 * Returns null if no saved state exists.
 */
export function loadStretchState(): StretchSessionState | null {
  try {
    const saved = localStorage.getItem(SESSION_STATE_KEY);
    if (saved === null) {
      return null;
    }
    return JSON.parse(saved) as StretchSessionState;
  } catch (error) {
    console.warn('Failed to load stretch session state:', error);
    return null;
  }
}

/**
 * Check if a saved session state is stale (older than 1 hour).
 * A stale session should be silently discarded.
 */
export function isSessionStale(state: StretchSessionState): boolean {
  const now = Date.now();

  // Check the relevant timestamp based on status
  const relevantTimestamp =
    state.status === 'paused' ? state.pausedAt : state.segmentStartedAt;

  if (relevantTimestamp === null) {
    // No timestamp means the session never really started
    return true;
  }

  return now - relevantTimestamp > SESSION_STALE_THRESHOLD_MS;
}

/**
 * Clear the saved session state.
 */
export function clearStretchState(): void {
  try {
    localStorage.removeItem(SESSION_STATE_KEY);
  } catch (error) {
    console.warn('Failed to clear stretch session state:', error);
  }
}

/**
 * Save the session configuration to localStorage.
 */
export function saveStretchConfig(config: StretchSessionConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('Failed to save stretch config:', error);
  }
}

/**
 * Load the session configuration from localStorage.
 * Returns default configuration if no saved config exists.
 */
export function loadStretchConfig(): StretchSessionConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved === null) {
      return getDefaultConfig();
    }
    const parsed = JSON.parse(saved) as StretchSessionConfig;

    // Validate that all expected regions exist (in case we add new ones later)
    const defaultConfig = getDefaultConfig();
    const existingRegions = new Set(parsed.regions.map((r) => r.region));
    const missingRegions = defaultConfig.regions.filter(
      (r) => !existingRegions.has(r.region)
    );

    if (missingRegions.length > 0) {
      // Add any missing regions at the end
      return {
        ...parsed,
        regions: [...parsed.regions, ...missingRegions],
      };
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to load stretch config:', error);
    return getDefaultConfig();
  }
}
