import { describe, expect, it } from 'vitest';
import {
  createGuidedMeditationScriptSchema,
  guidedMeditationSegmentSchema,
  guidedMeditationInterjectionSchema,
  guidedMeditationScriptSchema,
} from './guided-meditation.schema.js';

describe('guided meditation segment schema', () => {
  const validSegment = {
    id: 'segment-1',
    startSeconds: 0,
    text: 'Open your mind and relax.',
    phase: 'opening',
  };

  it('accepts a valid segment', () => {
    const result = guidedMeditationSegmentSchema.safeParse(validSegment);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phase).toBe('opening');
    }
  });

  it('rejects invalid phase enum on segment', () => {
    const result = guidedMeditationSegmentSchema.safeParse({
      ...validSegment,
      phase: 'invalid',
    });

    expect(result.success).toBe(false);
  });
});

describe('guided meditation interjection schema', () => {
  const validInterjection = {
    windowStartSeconds: 30,
    windowEndSeconds: 60,
    textOptions: ['inhale', 'exhale'],
  };

  it('accepts a valid interjection', () => {
    const result = guidedMeditationInterjectionSchema.safeParse(validInterjection);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.textOptions).toHaveLength(2);
    }
  });

  it('rejects nullable window values and non-array options', () => {
    const invalidTextOptions = guidedMeditationInterjectionSchema.safeParse({
      ...validInterjection,
      textOptions: null,
    });
    const invalidWindow = guidedMeditationInterjectionSchema.safeParse({
      ...validInterjection,
      windowStartSeconds: null,
    });

    expect(invalidTextOptions.success).toBe(false);
    expect(invalidWindow.success).toBe(false);
  });
});

describe('guided meditation script schemas', () => {
  const basePayload = {
    category: 'Stress Relief',
    title: 'Evening Body Scan',
    subtitle: 'Slow your day down',
    orderIndex: 1,
    durationSeconds: 600,
    segments: [
      {
        startSeconds: 0,
        text: 'Settle in.',
        phase: 'opening',
      },
      {
        startSeconds: 120,
        text: 'Breathe.',
        phase: 'teachings',
      },
    ],
    interjections: [
      {
        windowStartSeconds: 30,
        windowEndSeconds: 45,
        textOptions: ['1', '2'],
      },
    ],
  };

  it('accepts a valid guided meditation create payload', () => {
    const result = createGuidedMeditationScriptSchema.safeParse(basePayload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orderIndex).toBe(1);
      expect(result.data.durationSeconds).toBe(600);
    }
  });

  it('rejects create payloads that include segment IDs', () => {
    const invalidPayload = {
      ...basePayload,
      segments: [
        {
          id: 'segment-1',
          startSeconds: 0,
          text: 'Settle in.',
          phase: 'opening',
        },
      ],
    };

    const result = createGuidedMeditationScriptSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('accepts a full persisted script payload with IDs and timestamps', () => {
    const result = guidedMeditationScriptSchema.safeParse({
      id: 'script-1',
      created_at: '2026-02-26T00:00:00.000Z',
      updated_at: '2026-02-26T00:00:00.000Z',
      category: 'Focus',
      title: 'Morning Centering',
      subtitle: 'Start calm',
      orderIndex: 0,
      durationSeconds: 900,
      segments: [
        {
          id: 'segment-1',
          startSeconds: 0,
          text: 'Welcome',
          phase: 'opening',
        },
      ],
      interjections: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('script-1');
    }
  });

  it('rejects missing script nested arrays', () => {
    const result = guidedMeditationScriptSchema.safeParse({
      id: 'script-1',
      created_at: '2026-02-26T00:00:00.000Z',
      updated_at: '2026-02-26T00:00:00.000Z',
      category: 'Focus',
      title: 'Morning Centering',
      subtitle: 'Start calm',
      orderIndex: 0,
      durationSeconds: 900,
      segments: null,
      interjections: [],
    });

    expect(result.success).toBe(false);
  });
});
