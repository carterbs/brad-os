/**
 * Stretching Types
 *
 * Types for the narrated stretching feature including body regions,
 * stretch definitions, session configuration, and session state.
 */

export type BodyRegion =
  | 'neck'
  | 'shoulders'
  | 'back'
  | 'hip_flexors'
  | 'glutes'
  | 'hamstrings'
  | 'quads'
  | 'calves';

export interface Stretch {
  id: string; // slug: "neck-forward-tilt"
  name: string; // "Neck Forward Tilt"
  description: string; // Full instruction text
  bilateral: boolean;
  image: string | null; // relative path: "neck/neck-forward-tilt.png" or null if unavailable
  audioFiles: {
    begin: string; // relative path: "neck/neck-forward-tilt-begin.wav"
  };
}

export interface StretchRegionData {
  stretches: Stretch[];
}

export interface StretchManifest {
  regions: Record<BodyRegion, StretchRegionData>;
  shared: {
    switchSides: string;
    halfway: string;
    sessionComplete: string;
    silence: string;
  };
}

export interface StretchRegionConfig {
  region: BodyRegion;
  durationSeconds: 60 | 120; // User-configurable: 1 min or 2 min (binary toggle in UI)
  enabled: boolean;
}

export interface StretchSessionConfig {
  regions: StretchRegionConfig[];
  spotifyPlaylistUrl: string | null;
}

// Represents a single stretch chosen for a session
export interface SelectedStretch {
  region: BodyRegion;
  stretch: Stretch;
  durationSeconds: number;
  segmentDuration: number; // durationSeconds / 2
}

export interface StretchSessionState {
  status: 'idle' | 'active' | 'paused' | 'complete';
  currentStretchIndex: number;
  currentSegment: 1 | 2;
  segmentStartedAt: number | null; // Unix timestamp for current segment
  pausedAt: number | null; // Unix timestamp when paused (for 30-min timeout)
  pausedElapsed: number; // Elapsed seconds when paused
  selectedStretches: SelectedStretch[];
}

export const DEFAULT_STRETCH_REGIONS: StretchRegionConfig[] = [
  { region: 'neck', durationSeconds: 60, enabled: true },
  { region: 'shoulders', durationSeconds: 60, enabled: true },
  { region: 'back', durationSeconds: 120, enabled: true },
  { region: 'hip_flexors', durationSeconds: 60, enabled: true },
  { region: 'glutes', durationSeconds: 120, enabled: true },
  { region: 'hamstrings', durationSeconds: 60, enabled: true },
  { region: 'quads', durationSeconds: 60, enabled: true },
  { region: 'calves', durationSeconds: 60, enabled: true },
];

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  neck: 'Neck',
  shoulders: 'Shoulders',
  back: 'Back',
  hip_flexors: 'Hip Flexors',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  quads: 'Quads',
  calves: 'Calves',
};

// --- Session History (persisted to server) ---

// A completed stretch within a session
export interface CompletedStretch {
  region: BodyRegion;
  stretchId: string; // e.g., "neck-forward-tilt"
  stretchName: string; // e.g., "Neck Forward Tilt"
  durationSeconds: number; // configured duration (60 or 120)
  skippedSegments: number; // 0, 1, or 2 (2 = entire stretch skipped)
}

// Full session summary saved to the database on completion
export interface StretchSessionRecord {
  id?: string; // assigned by server (UUID)
  completedAt: string; // ISO 8601 timestamp
  totalDurationSeconds: number; // wall-clock time from start to finish
  regionsCompleted: number; // count of regions with at least 1 segment done
  regionsSkipped: number; // count of regions fully skipped
  stretches: CompletedStretch[]; // ordered list of all stretches in the session
}

// API request body for creating a session record
export type CreateStretchSessionRequest = Omit<StretchSessionRecord, 'id'>;

// --- Storage Constants ---

export const SESSION_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
export const PAUSE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
