import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import {
  initStretchAudio,
  isAudioInitialized,
  playNarration,
  startKeepalive,
  stopKeepalive,
  isKeepaliveActive,
  setMediaSessionMetadata,
  setMediaSessionPlaybackState,
  setMediaSessionCallbacks,
  stopAllAudio,
  resetStretchAudio,
  AudioPlaybackError,
} from '../stretchAudio';

// Mock MediaMetadata (not available in jsdom)
class MockMediaMetadata {
  title: string;
  artist: string;
  album: string;

  constructor(init: { title: string; artist: string; album: string }) {
    this.title = init.title;
    this.artist = init.artist;
    this.album = init.album;
  }
}
(globalThis as unknown as { MediaMetadata: typeof MockMediaMetadata }).MediaMetadata = MockMediaMetadata;

// Mock HTMLAudioElement
class MockAudioElement {
  src = '';
  preload = '';
  loop = false;
  volume = 1;
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  oncanplaythrough: (() => void) | null = null;

  load = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
}

describe('stretchAudio', () => {
  let mockAudioElements: MockAudioElement[];
  let originalAudio: typeof Audio;
  let mockMediaSession: {
    metadata: MockMediaMetadata | null;
    playbackState: string;
    setActionHandler: Mock;
  };

  beforeEach(() => {
    resetStretchAudio();
    mockAudioElements = [];

    // Mock Audio constructor
    originalAudio = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = vi.fn(() => {
      const element = new MockAudioElement();
      mockAudioElements.push(element);
      return element;
    }) as unknown as typeof Audio;

    // Mock MediaSession
    mockMediaSession = {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn(),
    };
    Object.defineProperty(navigator, 'mediaSession', {
      value: mockMediaSession,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    resetStretchAudio();
    globalThis.Audio = originalAudio;
  });

  describe('initStretchAudio', () => {
    it('should create audio elements on first call', () => {
      initStretchAudio();

      expect(mockAudioElements).toHaveLength(2);
      expect(isAudioInitialized()).toBe(true);
    });

    it('should be idempotent', () => {
      initStretchAudio();
      initStretchAudio();
      initStretchAudio();

      expect(mockAudioElements).toHaveLength(2);
    });

    it('should set up MediaSession handlers', () => {
      initStretchAudio();

      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith(
        'pause',
        expect.any(Function)
      );
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith(
        'play',
        expect.any(Function)
      );
      expect(mockMediaSession.setActionHandler).toHaveBeenCalledWith(
        'nexttrack',
        expect.any(Function)
      );
    });
  });

  describe('playNarration', () => {
    it('should throw if not initialized', async () => {
      await expect(playNarration('test.wav')).rejects.toThrow(
        'Audio not initialized'
      );
    });

    it('should play audio and resolve when ended', async () => {
      initStretchAudio();
      expect(mockAudioElements[0]).toBeDefined();
      const narrationAudio = mockAudioElements[0] as MockAudioElement;

      const playPromise = playNarration('neck/test-begin.wav');

      // Simulate audio ended
      setTimeout(() => {
        narrationAudio.onended?.();
      }, 10);

      await playPromise;

      expect(narrationAudio.src).toBe('/audio/stretching/neck/test-begin.wav');
      expect(narrationAudio.load).toHaveBeenCalled();
      expect(narrationAudio.play).toHaveBeenCalled();
    });

    it('should reject with AudioPlaybackError on load failure', async () => {
      initStretchAudio();
      expect(mockAudioElements[0]).toBeDefined();
      const narrationAudio = mockAudioElements[0] as MockAudioElement;

      const playPromise = playNarration('missing.wav');

      // Simulate error
      setTimeout(() => {
        narrationAudio.onerror?.();
      }, 10);

      await expect(playPromise).rejects.toThrow(AudioPlaybackError);
    });

    it('should pause keepalive during playback', async () => {
      initStretchAudio();
      expect(mockAudioElements[0]).toBeDefined();
      expect(mockAudioElements[1]).toBeDefined();
      const narrationAudio = mockAudioElements[0] as MockAudioElement;
      const keepaliveAudio = mockAudioElements[1] as MockAudioElement;

      // Start keepalive first
      startKeepalive();

      // Wait for the play promise to resolve and set isKeepaliveRunning = true
      await vi.waitFor(() => {
        expect(isKeepaliveActive()).toBe(true);
      });

      const playPromise = playNarration('test.wav');

      expect(keepaliveAudio.pause).toHaveBeenCalled();

      // Simulate ended
      setTimeout(() => {
        narrationAudio.onended?.();
      }, 10);

      await playPromise;
    });
  });

  describe('keepalive', () => {
    it('should start keepalive loop', () => {
      initStretchAudio();
      expect(mockAudioElements[1]).toBeDefined();
      const keepaliveAudio = mockAudioElements[1] as MockAudioElement;

      startKeepalive();

      expect(keepaliveAudio.src).toBe('/audio/stretching/shared/silence-1s.wav');
      expect(keepaliveAudio.play).toHaveBeenCalled();
    });

    it('should stop keepalive', () => {
      initStretchAudio();
      expect(mockAudioElements[1]).toBeDefined();
      const keepaliveAudio = mockAudioElements[1] as MockAudioElement;

      startKeepalive();
      stopKeepalive();

      expect(keepaliveAudio.pause).toHaveBeenCalled();
      expect(isKeepaliveActive()).toBe(false);
    });
  });

  describe('MediaSession', () => {
    it('should update metadata', () => {
      setMediaSessionMetadata('Test Stretch', 'Neck', 1);

      expect(mockMediaSession.metadata).not.toBeNull();
      expect(mockMediaSession.metadata?.title).toBe('Test Stretch');
      expect(mockMediaSession.metadata?.artist).toBe('Neck - Segment 1/2');
      expect(mockMediaSession.metadata?.album).toBe('Stretching Session');
    });

    it('should update playback state', () => {
      setMediaSessionPlaybackState('playing');
      expect(mockMediaSession.playbackState).toBe('playing');

      setMediaSessionPlaybackState('paused');
      expect(mockMediaSession.playbackState).toBe('paused');
    });

    it('should call registered callbacks', () => {
      initStretchAudio();

      const onPause = vi.fn();
      const onPlay = vi.fn();
      const onNext = vi.fn();

      setMediaSessionCallbacks({ onPause, onPlay, onNext });

      // Get the handlers that were registered
      type HandlerCall = [string, (() => void) | null];
      const calls = mockMediaSession.setActionHandler.mock.calls as HandlerCall[];
      const pauseHandler = calls.find((call) => call[0] === 'pause')?.[1];
      const playHandler = calls.find((call) => call[0] === 'play')?.[1];
      const nextHandler = calls.find((call) => call[0] === 'nexttrack')?.[1];

      // Call the handlers
      pauseHandler?.();
      playHandler?.();
      nextHandler?.();

      expect(onPause).toHaveBeenCalled();
      expect(onPlay).toHaveBeenCalled();
      expect(onNext).toHaveBeenCalled();
    });
  });

  describe('stopAllAudio', () => {
    it('should stop all audio and clear media session', () => {
      initStretchAudio();
      expect(mockAudioElements[0]).toBeDefined();
      expect(mockAudioElements[1]).toBeDefined();
      const narrationAudio = mockAudioElements[0] as MockAudioElement;
      const keepaliveAudio = mockAudioElements[1] as MockAudioElement;

      setMediaSessionMetadata('Test', 'Test', 1);
      stopAllAudio();

      expect(narrationAudio.pause).toHaveBeenCalled();
      expect(keepaliveAudio.pause).toHaveBeenCalled();
      expect(mockMediaSession.metadata).toBeNull();
      expect(mockMediaSession.playbackState).toBe('none');
    });
  });
});
