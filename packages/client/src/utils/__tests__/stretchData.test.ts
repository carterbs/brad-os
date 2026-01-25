import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadStretchManifest,
  clearManifestCache,
  selectRandomStretches,
  getAssetUrl,
  getStretchImageUrl,
  getRegions,
  getStretchesForRegion,
} from '../stretchData';
import type {
  StretchManifest,
  StretchSessionConfig,
  Stretch,
} from '@lifting/shared';

// Mock manifest data
const mockManifest: StretchManifest = {
  regions: {
    neck: {
      stretches: [
        {
          id: 'neck-forward-tilt',
          name: 'Neck Forward Tilt',
          description: 'Gently lower your chin...',
          bilateral: false,
          image: 'neck/neck-forward-tilt.png',
          audioFiles: { begin: 'neck/neck-forward-tilt-begin.wav' },
        },
        {
          id: 'neck-side-tilt',
          name: 'Neck Side Tilt',
          description: 'Tilt your head to one side...',
          bilateral: true,
          image: 'neck/neck-side-tilt.png',
          audioFiles: { begin: 'neck/neck-side-tilt-begin.wav' },
        },
      ],
    },
    shoulders: {
      stretches: [
        {
          id: 'shoulder-cross-body',
          name: 'Cross-Body Shoulder Stretch',
          description: 'Pull your arm across your body...',
          bilateral: true,
          image: null,
          audioFiles: { begin: 'shoulders/shoulder-cross-body-begin.wav' },
        },
      ],
    },
    back: { stretches: [] },
    hip_flexors: { stretches: [] },
    glutes: { stretches: [] },
    hamstrings: { stretches: [] },
    quads: { stretches: [] },
    calves: { stretches: [] },
  },
  shared: {
    switchSides: 'shared/switch-sides.wav',
    halfway: 'shared/halfway.wav',
    sessionComplete: 'shared/session-complete.wav',
    silence: 'shared/silence-1s.wav',
  },
};

describe('stretchData', () => {
  beforeEach(() => {
    clearManifestCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearManifestCache();
  });

  describe('loadStretchManifest', () => {
    it('should fetch and return the manifest', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      } as Response);

      const manifest = await loadStretchManifest();

      expect(fetchSpy).toHaveBeenCalledWith('/audio/stretching/stretches.json');
      expect(manifest).toEqual(mockManifest);
    });

    it('should cache the manifest after first load', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      } as Response);

      await loadStretchManifest();
      await loadStretchManifest();
      await loadStretchManifest();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should throw error on failed fetch', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await expect(loadStretchManifest()).rejects.toThrow(
        'Failed to load stretch manifest: 404'
      );
    });
  });

  describe('selectRandomStretches', () => {
    it('should select one stretch per enabled region', () => {
      const config: StretchSessionConfig = {
        regions: [
          { region: 'neck', durationSeconds: 60, enabled: true },
          { region: 'shoulders', durationSeconds: 120, enabled: true },
        ],
        spotifyPlaylistUrl: null,
      };

      const selected = selectRandomStretches(config, mockManifest);

      expect(selected).toHaveLength(2);
      expect(selected[0]).toBeDefined();
      expect(selected[0]?.region).toBe('neck');
      expect(selected[1]).toBeDefined();
      expect(selected[1]?.region).toBe('shoulders');
    });

    it('should exclude disabled regions', () => {
      const config: StretchSessionConfig = {
        regions: [
          { region: 'neck', durationSeconds: 60, enabled: true },
          { region: 'shoulders', durationSeconds: 120, enabled: false },
        ],
        spotifyPlaylistUrl: null,
      };

      const selected = selectRandomStretches(config, mockManifest);

      expect(selected).toHaveLength(1);
      expect(selected[0]).toBeDefined();
      expect(selected[0]?.region).toBe('neck');
    });

    it('should calculate segment duration correctly', () => {
      const config: StretchSessionConfig = {
        regions: [{ region: 'neck', durationSeconds: 120, enabled: true }],
        spotifyPlaylistUrl: null,
      };

      const selected = selectRandomStretches(config, mockManifest);

      expect(selected[0]).toBeDefined();
      expect(selected[0]?.durationSeconds).toBe(120);
      expect(selected[0]?.segmentDuration).toBe(60);
    });

    it('should skip regions with no stretches', () => {
      const config: StretchSessionConfig = {
        regions: [
          { region: 'neck', durationSeconds: 60, enabled: true },
          { region: 'back', durationSeconds: 60, enabled: true }, // Empty in mock
        ],
        spotifyPlaylistUrl: null,
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const selected = selectRandomStretches(config, mockManifest);

      expect(selected).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('getAssetUrl', () => {
    it('should resolve relative paths to full URLs', () => {
      const url = getAssetUrl('neck/neck-forward-tilt-begin.wav');
      expect(url).toBe('/audio/stretching/neck/neck-forward-tilt-begin.wav');
    });

    it('should work for shared assets', () => {
      const url = getAssetUrl('shared/switch-sides.wav');
      expect(url).toBe('/audio/stretching/shared/switch-sides.wav');
    });

    it('should work for images', () => {
      const url = getAssetUrl('neck/neck-forward-tilt.png');
      expect(url).toBe('/audio/stretching/neck/neck-forward-tilt.png');
    });
  });

  describe('getStretchImageUrl', () => {
    it('should return full URL when image exists', () => {
      const stretch: Stretch = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        bilateral: false,
        image: 'neck/test.png',
        audioFiles: { begin: 'neck/test-begin.wav' },
      };

      const url = getStretchImageUrl(stretch);
      expect(url).toBe('/audio/stretching/neck/test.png');
    });

    it('should return null when no image', () => {
      const stretch: Stretch = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        bilateral: false,
        image: null,
        audioFiles: { begin: 'neck/test-begin.wav' },
      };

      const url = getStretchImageUrl(stretch);
      expect(url).toBeNull();
    });
  });

  describe('getRegions', () => {
    it('should return all region keys', () => {
      const regions = getRegions(mockManifest);
      expect(regions).toContain('neck');
      expect(regions).toContain('shoulders');
    });
  });

  describe('getStretchesForRegion', () => {
    it('should return stretches for a region', () => {
      const stretches = getStretchesForRegion(mockManifest, 'neck');
      expect(stretches).toHaveLength(2);
    });

    it('should return empty array for empty region', () => {
      const stretches = getStretchesForRegion(mockManifest, 'back');
      expect(stretches).toHaveLength(0);
    });
  });
});
