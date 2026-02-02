/**
 * Guided Meditation Types
 *
 * Types for guided meditation scripts with timed segments,
 * interjections during silence periods, and category grouping.
 */

export interface GuidedMeditationSegment {
  id: string;
  startSeconds: number;
  text: string;
  phase: 'opening' | 'teachings' | 'closing';
}

export interface GuidedMeditationInterjection {
  windowStartSeconds: number;
  windowEndSeconds: number;
  textOptions: string[];
}

export interface GuidedMeditationScript {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  orderIndex: number;
  durationSeconds: number;
  segments: GuidedMeditationSegment[];
  interjections: GuidedMeditationInterjection[];
  created_at: string;
  updated_at: string;
}

export interface GuidedMeditationCategory {
  id: string;
  name: string;
  scriptCount: number;
}

// DTOs

export interface CreateGuidedMeditationScriptDTO {
  category: string;
  title: string;
  subtitle: string;
  orderIndex: number;
  durationSeconds: number;
  segments: Omit<GuidedMeditationSegment, 'id'>[];
  interjections: GuidedMeditationInterjection[];
}
