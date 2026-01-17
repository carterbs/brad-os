import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { playBeep, playRestCompleteBeep, createBeepSound } from '../audio';

describe('audio utilities', () => {
  interface MockOscillator {
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
    type: OscillatorType;
  }

  interface MockGainNode {
    connect: ReturnType<typeof vi.fn>;
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
  }

  interface MockAudioContext {
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    destination: object;
    currentTime: number;
    state: AudioContextState;
    resume: ReturnType<typeof vi.fn>;
  }

  let mockOscillator: MockOscillator;
  let mockGainNode: MockGainNode;
  let mockAudioContext: MockAudioContext;

  beforeEach(() => {
    mockOscillator = {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: { setValueAtTime: vi.fn() },
      type: 'sine',
    };

    mockGainNode = {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    };

    mockAudioContext = {
      createOscillator: vi.fn().mockReturnValue(mockOscillator) as MockAudioContext['createOscillator'],
      createGain: vi.fn().mockReturnValue(mockGainNode) as MockAudioContext['createGain'],
      destination: {},
      currentTime: 0,
      state: 'running',
      resume: vi.fn().mockResolvedValue(undefined) as MockAudioContext['resume'],
    };

    // Mock the AudioContext constructor
    vi.stubGlobal(
      'AudioContext',
      vi.fn().mockReturnValue(mockAudioContext)
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createBeepSound', () => {
    it('should create an AudioContext', () => {
      createBeepSound();
      expect(global.AudioContext).toHaveBeenCalled();
    });

    it('should create an oscillator with correct frequency', () => {
      createBeepSound({ frequency: 880 });
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(
        880,
        0
      );
    });

    it('should use default frequency of 440Hz', () => {
      createBeepSound();
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(
        440,
        0
      );
    });

    it('should set oscillator type to sine by default', () => {
      createBeepSound();
      expect(mockOscillator.type).toBe('sine');
    });

    it('should return null when AudioContext is not available', () => {
      vi.stubGlobal('AudioContext', undefined);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = createBeepSound();

      expect(result).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('playBeep', () => {
    it('should start and stop the oscillator', async () => {
      await playBeep();
      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalled();
    });

    it('should connect oscillator to gain node', async () => {
      await playBeep();
      expect(mockOscillator.connect).toHaveBeenCalledWith(mockGainNode);
    });

    it('should connect gain node to destination', async () => {
      await playBeep();
      expect(mockGainNode.connect).toHaveBeenCalledWith(
        mockAudioContext.destination
      );
    });

    it('should use custom frequency when provided', async () => {
      await playBeep({ frequency: 660 });
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(
        660,
        0
      );
    });

    it('should handle missing AudioContext gracefully', async () => {
      vi.stubGlobal('AudioContext', undefined);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Should not throw
      await expect(playBeep()).resolves.toBeUndefined();

      warnSpy.mockRestore();
    });

    it('should resume suspended AudioContext', async () => {
      mockAudioContext.state = 'suspended';
      await playBeep();
      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('should set gain values for fade out', async () => {
      await playBeep({ volume: 0.5, duration: 200 });
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
      expect(
        mockGainNode.gain.exponentialRampToValueAtTime
      ).toHaveBeenCalledWith(0.001, 0.2);
    });
  });

  describe('playRestCompleteBeep', () => {
    it('should play a dual-tone beep', async () => {
      // playRestCompleteBeep plays two beeps in sequence
      await playRestCompleteBeep();

      // Should create two oscillators (two beeps)
      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    });

    it('should play the first tone at C5 frequency', async () => {
      await playRestCompleteBeep();

      // First call should be with C5 (523.25 Hz)
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenNthCalledWith(
        1,
        523.25,
        0
      );
    });

    it('should play the second tone at E5 frequency', async () => {
      await playRestCompleteBeep();

      // Second call should be with E5 (659.25 Hz)
      expect(mockOscillator.frequency.setValueAtTime).toHaveBeenNthCalledWith(
        2,
        659.25,
        0
      );
    });
  });
});
