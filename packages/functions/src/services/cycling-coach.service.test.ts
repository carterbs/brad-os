import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildScheduleGenerationPrompt } from './cycling-coach.service.js';

describe('CyclingCoachService', () => {
  describe('buildSystemPrompt', () => {
    it('should include training philosophy in system prompt', () => {
      const philosophy = 'Test philosophy content';
      const prompt = buildSystemPrompt(philosophy);

      expect(prompt).toContain('Test philosophy content');
      expect(prompt).toContain('cycling coach');
    });

    it('should reference Peloton class types', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Power Zone Max');
      expect(prompt).toContain('HIIT & Hills');
      expect(prompt).toContain('Sweat Steady');
      expect(prompt).toContain('Power Zone Endurance');
      expect(prompt).toContain('Recovery Ride');
    });

    it('should include expanded session types in response format', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('"vo2max"');
      expect(prompt).toContain('"threshold"');
      expect(prompt).toContain('"endurance"');
      expect(prompt).toContain('"tempo"');
      expect(prompt).toContain('"fun"');
      expect(prompt).toContain('"recovery"');
      expect(prompt).toContain('"off"');
    });

    it('should include Peloton-aware response format', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('pelotonClassTypes');
      expect(prompt).toContain('pelotonTip');
      expect(prompt).not.toContain('"intervals"');
    });

    it('should include decision framework', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Decision Framework');
      expect(prompt).toContain('next session');
      expect(prompt).toContain('recovery state');
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

    it('should include recovery-based Peloton adjustments', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('Recovery-Based Adjustments');
      expect(prompt).toContain('Low Impact');
      expect(prompt).toContain('Recovery Ride');
    });

    it('should not reference specific interval protocols', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).not.toContain('30/30 Billat');
      expect(prompt).not.toContain('30/120 intervals');
      expect(prompt).not.toContain('40/20 intervals');
    });

    it('should reference lifting interference with Peloton class swaps', () => {
      const prompt = buildSystemPrompt('');

      expect(prompt).toContain('lifting');
      expect(prompt).toContain('Low Impact');
    });
  });

  describe('buildScheduleGenerationPrompt', () => {
    it('should return a non-empty string', () => {
      const prompt = buildScheduleGenerationPrompt();
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should reference Peloton class types', () => {
      const prompt = buildScheduleGenerationPrompt();

      expect(prompt).toContain('Power Zone Max');
      expect(prompt).toContain('Peloton');
      expect(prompt).toContain('sessions');
    });

    it('should include response format with required fields', () => {
      const prompt = buildScheduleGenerationPrompt();

      expect(prompt).toContain('sessionType');
      expect(prompt).toContain('pelotonClassTypes');
      expect(prompt).toContain('suggestedDurationMinutes');
      expect(prompt).toContain('rationale');
    });
  });
});
