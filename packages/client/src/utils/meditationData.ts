/**
 * Meditation Data Loader
 *
 * Loads the meditation manifest JSON and provides utilities for
 * session variant selection and randomized cue scheduling.
 */

import type {
  MeditationDuration,
  MeditationManifest,
  MeditationVariant,
  ScheduledCue,
} from '@brad-os/shared';

const AUDIO_BASE_PATH = '/audio/meditation';

// Cached manifest after first load
let cachedManifest: MeditationManifest | null = null;

/**
 * Loads the meditation manifest from the server.
 * Caches the result in memory for subsequent calls.
 */
export async function loadMeditationManifest(): Promise<MeditationManifest> {
  if (cachedManifest !== null) {
    return cachedManifest;
  }

  const response = await fetch(`${AUDIO_BASE_PATH}/meditation.json`);
  if (!response.ok) {
    throw new Error(`Failed to load meditation manifest: ${response.status}`);
  }

  const manifest = (await response.json()) as MeditationManifest;
  cachedManifest = manifest;
  return manifest;
}

/**
 * Clears the cached manifest.
 * Primarily for testing purposes.
 */
export function clearMeditationManifestCache(): void {
  cachedManifest = null;
}

/**
 * Gets a session variant for the given session type and duration.
 *
 * @param manifest - The loaded meditation manifest
 * @param sessionType - The session type ID (e.g., 'basic-breathing')
 * @param duration - The desired duration in minutes (5, 10, or 20)
 * @returns The matching variant, or undefined if not found
 */
export function getSessionVariant(
  manifest: MeditationManifest,
  sessionType: string,
  duration: MeditationDuration
): MeditationVariant | undefined {
  const session = manifest.sessions.find((s) => s.id === sessionType);
  if (!session) {
    return undefined;
  }

  return session.variants.find((v) => v.durationMinutes === duration);
}

/**
 * Generates a schedule of cues for a meditation session.
 *
 * Fixed cues are added at their specified times.
 * Interjection windows are randomized - a random time within the window
 * is selected, and a random audio file from the pool is chosen.
 *
 * @param variant - The meditation variant to generate cues for
 * @returns Array of scheduled cues, sorted by time
 */
export function generateScheduledCues(variant: MeditationVariant): ScheduledCue[] {
  const cues: ScheduledCue[] = [];
  let phaseStartSeconds = 0;

  for (const phase of variant.phases) {
    // Add fixed cues at their absolute times
    for (const fixed of phase.fixedCues) {
      cues.push({
        atSeconds: phaseStartSeconds + fixed.atSeconds,
        audioFile: fixed.audioFile,
        played: false,
      });
    }

    // Add randomized interjection cues (breathing phase only)
    if (phase.interjectionWindows) {
      for (const window of phase.interjectionWindows) {
        // Random time within the window
        const randomTime =
          window.earliestSeconds +
          Math.random() * (window.latestSeconds - window.earliestSeconds);

        // Random audio file from the pool
        const randomAudio =
          window.audioPool[Math.floor(Math.random() * window.audioPool.length)];

        if (randomAudio !== undefined) {
          cues.push({
            atSeconds: phaseStartSeconds + randomTime,
            audioFile: randomAudio,
            played: false,
          });
        }
      }
    }

    phaseStartSeconds += phase.durationSeconds;
  }

  // Sort by time
  return cues.sort((a, b) => a.atSeconds - b.atSeconds);
}

/**
 * Resolves a relative asset path to a full URL.
 *
 * @param relativePath - Relative path from manifest (e.g., "sessions/basic-breathing/intro-welcome.wav")
 * @returns Full URL path (e.g., "/audio/meditation/sessions/basic-breathing/intro-welcome.wav")
 */
export function getMeditationAssetUrl(relativePath: string): string {
  return `${AUDIO_BASE_PATH}/${relativePath}`;
}

/**
 * Gets the total duration of a session variant in seconds.
 *
 * @param variant - The meditation variant
 * @returns Total duration in seconds
 */
export function getVariantTotalSeconds(variant: MeditationVariant): number {
  return variant.phases.reduce((sum, phase) => sum + phase.durationSeconds, 0);
}

/**
 * Gets the session definition by ID.
 *
 * @param manifest - The loaded meditation manifest
 * @param sessionType - The session type ID (e.g., 'basic-breathing')
 * @returns The session definition, or undefined if not found
 */
export function getSessionDefinition(
  manifest: MeditationManifest,
  sessionType: string
): MeditationManifest['sessions'][number] | undefined {
  return manifest.sessions.find((s) => s.id === sessionType);
}
