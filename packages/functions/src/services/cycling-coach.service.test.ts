import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './cycling-coach.service.js';

describe('CyclingCoachService', () => {
  describe('buildSystemPrompt', () => {
    it('should include training philosophy in system prompt', () => {
      const philosophy = 'Test philosophy content';
      const prompt = buildSystemPrompt(philosophy);

      expect(prompt).toContain('Test philosophy content');
      expect(prompt).toContain('AI cycling coach');
    });

    it('should include power zones in system prompt', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Z1 Active Recovery');
      expect(prompt).toContain('Z5 VO2max');
      expect(prompt).toContain('106-120%');
    });

    it('should include session types in response format', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('"vo2max"');
      expect(prompt).toContain('"threshold"');
      expect(prompt).toContain('"fun"');
      expect(prompt).toContain('"recovery"');
      expect(prompt).toContain('"off"');
    });

    it('should include decision framework', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Decision Framework');
      expect(prompt).toContain('Check session type');
      expect(prompt).toContain('Assess recovery state');
    });

    it('should include JSON response format instructions', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('session');
      expect(prompt).toContain('reasoning');
      expect(prompt).toContain('coachingTips');
      expect(prompt).toContain('warnings');
      expect(prompt).toContain('suggestFTPTest');
    });

    it('should mention specific days for session types', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Tuesday');
      expect(prompt).toContain('Thursday');
      expect(prompt).toContain('Saturday');
      expect(prompt).toContain('VO2max intervals');
      expect(prompt).toContain('Threshold');
      expect(prompt).toContain('fun');
    });
  });
});
