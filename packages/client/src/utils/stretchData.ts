/**
 * Stretch Data Loader
 *
 * Loads the stretch manifest JSON and provides utilities for
 * random stretch selection and asset URL resolution.
 */

import type {
  BodyRegion,
  Stretch,
  StretchManifest,
  StretchSessionConfig,
  SelectedStretch,
} from '@brad-os/shared';

const AUDIO_BASE_PATH = '/audio/stretching';

// Cached manifest after first load
let cachedManifest: StretchManifest | null = null;

/**
 * Loads the stretch manifest from the server.
 * Caches the result in memory for subsequent calls.
 */
export async function loadStretchManifest(): Promise<StretchManifest> {
  if (cachedManifest !== null) {
    return cachedManifest;
  }

  const response = await fetch(`${AUDIO_BASE_PATH}/stretches.json`);
  if (!response.ok) {
    throw new Error(`Failed to load stretch manifest: ${response.status}`);
  }

  const manifest = (await response.json()) as StretchManifest;
  cachedManifest = manifest;
  return manifest;
}

/**
 * Clears the cached manifest.
 * Primarily for testing purposes.
 */
export function clearManifestCache(): void {
  cachedManifest = null;
}

/**
 * Selects one random stretch per enabled region.
 *
 * @param config - The session configuration with enabled regions and durations
 * @param manifest - The loaded stretch manifest
 * @returns Array of selected stretches in the order specified by config
 */
export function selectRandomStretches(
  config: StretchSessionConfig,
  manifest: StretchManifest
): SelectedStretch[] {
  const selected: SelectedStretch[] = [];

  for (const regionConfig of config.regions) {
    if (!regionConfig.enabled) {
      continue;
    }

    const regionData = manifest.regions[regionConfig.region];
    if (regionData === undefined || regionData.stretches.length === 0) {
      console.warn(`No stretches found for region: ${regionConfig.region}`);
      continue;
    }

    // Pick a random stretch from this region
    const randomIndex = Math.floor(Math.random() * regionData.stretches.length);
    // We've verified stretches.length > 0 above, so this index is always valid
    const stretch = regionData.stretches[randomIndex];
    if (stretch === undefined) {
      // This should never happen since we checked length > 0, but satisfy TypeScript
      continue;
    }

    selected.push({
      region: regionConfig.region,
      stretch,
      durationSeconds: regionConfig.durationSeconds,
      segmentDuration: regionConfig.durationSeconds / 2,
    });
  }

  return selected;
}

/**
 * Resolves a relative asset path to a full URL.
 * Works for both audio files (.wav) and images (.png).
 *
 * @param relativePath - Relative path from manifest (e.g., "neck/neck-forward-tilt-begin.wav")
 * @returns Full URL path (e.g., "/audio/stretching/neck/neck-forward-tilt-begin.wav")
 */
export function getAssetUrl(relativePath: string): string {
  return `${AUDIO_BASE_PATH}/${relativePath}`;
}

/**
 * Gets the full URL for a stretch image, or null if no image is available.
 *
 * @param stretch - The stretch object from the manifest
 * @returns Full URL path to the image, or null if no image
 */
export function getStretchImageUrl(stretch: Stretch): string | null {
  if (stretch.image === null) {
    return null;
  }
  return getAssetUrl(stretch.image);
}

/**
 * Gets all body regions from the manifest in their defined order.
 *
 * @param manifest - The loaded stretch manifest
 * @returns Array of body region keys
 */
export function getRegions(manifest: StretchManifest): BodyRegion[] {
  return Object.keys(manifest.regions) as BodyRegion[];
}

/**
 * Gets all stretches for a specific region.
 *
 * @param manifest - The loaded stretch manifest
 * @param region - The body region to get stretches for
 * @returns Array of stretches for the region
 */
export function getStretchesForRegion(
  manifest: StretchManifest,
  region: BodyRegion
): Stretch[] {
  return manifest.regions[region]?.stretches ?? [];
}
