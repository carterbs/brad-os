/**
 * Audio utilities for the rest timer feature.
 * Uses the Web Audio API to generate beep sounds.
 */

interface BeepOptions {
  frequency?: number;
  duration?: number;
  volume?: number;
  type?: OscillatorType;
}

const DEFAULT_OPTIONS: Required<BeepOptions> = {
  frequency: 440, // A4 note
  duration: 200, // milliseconds
  volume: 0.5,
  type: 'sine',
};

// Extend Window interface for webkit prefix
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

/**
 * Gets the AudioContext constructor if available.
 * Falls back to webkitAudioContext for older Safari versions.
 */
function getAudioContextClass(): typeof AudioContext | null {
  if (typeof AudioContext !== 'undefined') {
    return AudioContext;
  }
  if (typeof window !== 'undefined' && typeof window.webkitAudioContext !== 'undefined') {
    return window.webkitAudioContext;
  }
  return null;
}

/**
 * Creates an AudioContext and configures an oscillator for a beep sound.
 * Useful for testing or when you need manual control over the audio context.
 *
 * @param options - Configuration for the beep sound
 * @returns The AudioContext or null if Web Audio API is not supported
 */
export function createBeepSound(options: BeepOptions = {}): AudioContext | null {
  const AudioContextClass = getAudioContextClass();

  if (!AudioContextClass) {
    console.warn('Web Audio API is not supported in this browser');
    return null;
  }

  const audioContext = new AudioContextClass();
  const { frequency, type } = { ...DEFAULT_OPTIONS, ...options };

  const oscillator = audioContext.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

  return audioContext;
}

/**
 * Plays a beep sound using the Web Audio API.
 * The sound fades out naturally over the specified duration.
 *
 * @param options - Configuration for the beep sound
 */
export async function playBeep(options: BeepOptions = {}): Promise<void> {
  const AudioContextClass = getAudioContextClass();

  if (!AudioContextClass) {
    console.warn('Web Audio API is not supported in this browser');
    return;
  }

  const { frequency, duration, volume, type } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const audioContext = new AudioContextClass();

  // Resume context if suspended (browser autoplay policy)
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + duration / 1000
  );

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration / 1000);
}

/**
 * Plays a pleasant dual-tone beep for rest timer completion.
 * Plays a C5 note followed by an E5 note for a pleasing ascending sound.
 */
export async function playRestCompleteBeep(): Promise<void> {
  // First tone: C5 (523.25 Hz)
  await playBeep({ frequency: 523.25, duration: 150, volume: 0.4 });

  // Small delay between tones
  await new Promise<void>((resolve) => setTimeout(resolve, 100));

  // Second tone: E5 (659.25 Hz)
  await playBeep({ frequency: 659.25, duration: 200, volume: 0.4 });
}
