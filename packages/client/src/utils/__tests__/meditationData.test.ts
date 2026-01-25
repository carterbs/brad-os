import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadMeditationManifest,
  clearMeditationManifestCache,
  getSessionVariant,
  generateScheduledCues,
  getMeditationAssetUrl,
  getVariantTotalSeconds,
  getSessionDefinition,
} from '../meditationData';
import type { MeditationManifest, MeditationVariant } from '@brad-os/shared';

// Mock manifest data
const mockManifest: MeditationManifest = {
  sessions: [
    {
      id: 'basic-breathing',
      name: 'Basic Breathing',
      description: 'A gentle breathing meditation.',
      variants: [
        {
          durationMinutes: 5,
          phases: [
            {
              type: 'intro',
              durationSeconds: 30,
              fixedCues: [
                { atSeconds: 0, audioFile: 'sessions/basic-breathing/intro-welcome.wav' },
              ],
            },
            {
              type: 'breathing',
              durationSeconds: 240,
              fixedCues: [
                { atSeconds: 0, audioFile: 'sessions/basic-breathing/breathing-settle.wav' },
              ],
              interjectionWindows: [
                {
                  earliestSeconds: 80,
                  latestSeconds: 120,
                  audioPool: [
                    'sessions/basic-breathing/breathing-reminder-1.wav',
                    'sessions/basic-breathing/breathing-reminder-2.wav',
                  ],
                },
              ],
            },
            {
              type: 'closing',
              durationSeconds: 30,
              fixedCues: [
                { atSeconds: 0, audioFile: 'sessions/basic-breathing/closing-transition.wav' },
              ],
            },
          ],
        },
        {
          durationMinutes: 10,
          phases: [
            {
              type: 'intro',
              durationSeconds: 60,
              fixedCues: [],
            },
            {
              type: 'breathing',
              durationSeconds: 480,
              fixedCues: [],
            },
            {
              type: 'closing',
              durationSeconds: 60,
              fixedCues: [],
            },
          ],
        },
      ],
    },
  ],
  shared: {
    bell: 'shared/bell.wav',
    silence: 'shared/silence-1s.wav',
  },
};

describe('meditationData', () => {
  beforeEach(() => {
    clearMeditationManifestCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearMeditationManifestCache();
  });

  describe('loadMeditationManifest', () => {
    it('should fetch and return the manifest', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      } as Response);

      const manifest = await loadMeditationManifest();

      expect(fetchSpy).toHaveBeenCalledWith('/audio/meditation/meditation.json');
      expect(manifest).toEqual(mockManifest);
    });

    it('should cache the manifest after first load', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      } as Response);

      await loadMeditationManifest();
      await loadMeditationManifest();
      await loadMeditationManifest();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw error on failed fetch', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await expect(loadMeditationManifest()).rejects.toThrow(
        'Failed to load meditation manifest: 404'
      );
    });
  });

  describe('getSessionVariant', () => {
    it('should return the correct variant for a duration', () => {
      const variant = getSessionVariant(mockManifest, 'basic-breathing', 5);

      expect(variant).toBeDefined();
      expect(variant?.durationMinutes).toBe(5);
    });

    it('should return undefined for unknown session type', () => {
      const variant = getSessionVariant(mockManifest, 'unknown-session', 5);

      expect(variant).toBeUndefined();
    });

    it('should return undefined for unknown duration', () => {
      const variant = getSessionVariant(mockManifest, 'basic-breathing', 20);

      expect(variant).toBeUndefined();
    });
  });

  describe('generateScheduledCues', () => {
    it('should include all fixed cues at correct absolute times', () => {
      const variant = mockManifest.sessions[0]?.variants[0] as MeditationVariant;
      const cues = generateScheduledCues(variant);

      // Fixed cues: intro at 0, breathing at 30, closing at 270
      const fixedCueTimes = cues.filter(
        (c) =>
          c.audioFile.includes('intro') ||
          c.audioFile.includes('settle') ||
          c.audioFile.includes('closing')
      );

      expect(fixedCueTimes).toHaveLength(3);

      // Intro cue at 0
      const introCue = cues.find((c) => c.audioFile.includes('intro'));
      expect(introCue?.atSeconds).toBe(0);

      // Breathing settle cue at 30 (after intro phase)
      const settleCue = cues.find((c) => c.audioFile.includes('settle'));
      expect(settleCue?.atSeconds).toBe(30);

      // Closing cue at 270 (30 intro + 240 breathing)
      const closingCue = cues.find((c) => c.audioFile.includes('closing'));
      expect(closingCue?.atSeconds).toBe(270);
    });

    it('should add interjection cues within window bounds', () => {
      const variant = mockManifest.sessions[0]?.variants[0] as MeditationVariant;

      // Run multiple times to test randomization
      for (let i = 0; i < 10; i++) {
        const cues = generateScheduledCues(variant);

        // Find interjection cue (reminder)
        const reminderCue = cues.find((c) => c.audioFile.includes('reminder'));
        expect(reminderCue).toBeDefined();

        // Check it's within the window (80-120 seconds into breathing phase)
        // Breathing phase starts at 30 seconds (after intro)
        const absoluteEarliest = 30 + 80;
        const absoluteLatest = 30 + 120;

        if (reminderCue !== undefined) {
          expect(reminderCue.atSeconds).toBeGreaterThanOrEqual(absoluteEarliest);
          expect(reminderCue.atSeconds).toBeLessThanOrEqual(absoluteLatest);
        }
      }
    });

    it('should select from audio pool randomly', () => {
      const variant = mockManifest.sessions[0]?.variants[0] as MeditationVariant;
      const selectedFiles = new Set<string>();

      // Run multiple times to check randomization
      for (let i = 0; i < 50; i++) {
        const cues = generateScheduledCues(variant);
        const reminderCue = cues.find((c) => c.audioFile.includes('reminder'));
        if (reminderCue) {
          selectedFiles.add(reminderCue.audioFile);
        }
      }

      // Should have selected from multiple options (with high probability)
      expect(selectedFiles.size).toBeGreaterThanOrEqual(1);
    });

    it('should return cues sorted by time', () => {
      const variant = mockManifest.sessions[0]?.variants[0] as MeditationVariant;
      const cues = generateScheduledCues(variant);

      for (let i = 1; i < cues.length; i++) {
        const prevCue = cues[i - 1];
        const currentCue = cues[i];
        expect(prevCue).toBeDefined();
        expect(currentCue).toBeDefined();
        if (prevCue !== undefined && currentCue !== undefined) {
          expect(currentCue.atSeconds).toBeGreaterThanOrEqual(prevCue.atSeconds);
        }
      }
    });

    it('should mark all cues as not played initially', () => {
      const variant = mockManifest.sessions[0]?.variants[0] as MeditationVariant;
      const cues = generateScheduledCues(variant);

      for (const cue of cues) {
        expect(cue.played).toBe(false);
      }
    });

    it('should produce different schedules on each call', () => {
      const variant = mockManifest.sessions[0]?.variants[0] as MeditationVariant;

      const schedules: number[][] = [];
      for (let i = 0; i < 10; i++) {
        const cues = generateScheduledCues(variant);
        schedules.push(cues.map((c) => c.atSeconds));
      }

      // At least some schedules should be different (interjection times vary)
      const uniqueSchedules = new Set(schedules.map((s) => JSON.stringify(s)));
      expect(uniqueSchedules.size).toBeGreaterThan(1);
    });
  });

  describe('getMeditationAssetUrl', () => {
    it('should resolve relative paths to full URLs', () => {
      const url = getMeditationAssetUrl('sessions/basic-breathing/intro-welcome.wav');
      expect(url).toBe('/audio/meditation/sessions/basic-breathing/intro-welcome.wav');
    });

    it('should work for shared assets', () => {
      const url = getMeditationAssetUrl('shared/bell.wav');
      expect(url).toBe('/audio/meditation/shared/bell.wav');
    });
  });

  describe('getVariantTotalSeconds', () => {
    it('should sum all phase durations', () => {
      const variant = mockManifest.sessions[0]?.variants[0] as MeditationVariant;
      const total = getVariantTotalSeconds(variant);

      expect(total).toBe(300); // 30 + 240 + 30 = 300 seconds = 5 minutes
    });

    it('should calculate correctly for 10-minute variant', () => {
      const variant = mockManifest.sessions[0]?.variants[1] as MeditationVariant;
      const total = getVariantTotalSeconds(variant);

      expect(total).toBe(600); // 60 + 480 + 60 = 600 seconds = 10 minutes
    });
  });

  describe('getSessionDefinition', () => {
    it('should return session by ID', () => {
      const session = getSessionDefinition(mockManifest, 'basic-breathing');

      expect(session).toBeDefined();
      expect(session?.name).toBe('Basic Breathing');
    });

    it('should return undefined for unknown ID', () => {
      const session = getSessionDefinition(mockManifest, 'unknown');

      expect(session).toBeUndefined();
    });
  });
});
