/**
 * Meditation Types
 *
 * Types for the guided meditation feature including session definitions,
 * phases, interjection windows, scheduled cues, and session tracking.
 */

export type MeditationDuration = 5 | 10 | 20; // minutes

/**
 * A time window during which a random interjection can occur.
 * Used only in the breathing phase.
 */
export interface InterjectionWindow {
  earliestSeconds: number;
  latestSeconds: number;
  audioPool: string[]; // Relative paths to audio files
}

/**
 * A cue that plays at a fixed time within a phase.
 */
export interface FixedCue {
  atSeconds: number; // Seconds from phase start
  audioFile: string; // Relative path to audio file
}

/**
 * A phase within a meditation session (intro, breathing, or closing).
 */
export interface MeditationPhase {
  type: 'intro' | 'breathing' | 'closing';
  durationSeconds: number;
  fixedCues: FixedCue[];
  interjectionWindows?: InterjectionWindow[]; // Only for breathing phase
}

/**
 * A cue scheduled for playback at a specific time.
 * Created at session start by randomizing interjection windows.
 */
export interface ScheduledCue {
  atSeconds: number; // Absolute seconds from session start
  audioFile: string;
  played: boolean;
}

/**
 * A duration variant of a meditation session.
 * Each session type (e.g., basic-breathing) has 5, 10, and 20 minute variants.
 */
export interface MeditationVariant {
  durationMinutes: MeditationDuration;
  phases: MeditationPhase[];
}

/**
 * A meditation session type definition.
 */
export interface MeditationSessionDefinition {
  id: string; // e.g., 'basic-breathing'
  name: string; // e.g., 'Basic Breathing'
  description: string;
  variants: MeditationVariant[];
}

/**
 * The meditation manifest loaded from meditation.json.
 * Contains all session definitions and shared assets.
 */
export interface MeditationManifest {
  sessions: MeditationSessionDefinition[];
  shared: {
    bell: string;
    silence: string;
  };
}

/**
 * State of an active meditation session.
 */
export interface MeditationSessionState {
  status: 'idle' | 'active' | 'paused' | 'complete';
  sessionType: string;
  durationMinutes: MeditationDuration;
  sessionStartedAt: number | null; // Unix timestamp
  pausedAt: number | null;
  pausedElapsed: number;
  scheduledCues: ScheduledCue[]; // Pre-randomized at start
  currentPhaseIndex: number;
}

// --- Session History (persisted to server) ---

/**
 * A completed meditation session record for tracking.
 */
export interface MeditationSessionRecord {
  id?: string; // Server-generated UUID
  completedAt: string; // ISO 8601 timestamp
  sessionType: string; // e.g., 'basic-breathing'
  plannedDurationSeconds: number; // 300, 600, or 1200
  actualDurationSeconds: number; // Wall-clock time
  completedFully: boolean; // Finished vs ended early
}

/**
 * API request body for creating a meditation session record.
 */
export type CreateMeditationSessionRequest = Omit<MeditationSessionRecord, 'id'>;

// --- Storage Constants ---

export const MEDITATION_SESSION_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
export const MEDITATION_PAUSE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// --- Duration configuration ---

export const MEDITATION_DURATIONS: MeditationDuration[] = [5, 10, 20];

export const MEDITATION_DURATION_LABELS: Record<MeditationDuration, string> = {
  5: '5 minutes',
  10: '10 minutes',
  20: '20 minutes',
};
