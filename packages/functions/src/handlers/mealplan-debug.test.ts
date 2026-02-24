import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { mealplanDebugApp } from './mealplan-debug.js';

describe('Meal Plan Debug Handler', () => {
  describe('GET /mealplan-debug', () => {
    it('should serve the debug UI HTML page', async () => {
      const response = await request(mealplanDebugApp).get('/');

      expect(response.status).toBe(200);
      expect(response.type).toBe('text/html');
      expect(response.text).toContain('Meal Plan Debug UI');
    });

    it('should include the generate, critique, and finalize controls', async () => {
      const response = await request(mealplanDebugApp).get('/');

      expect(response.text).toContain('generatePlan()');
      expect(response.text).toContain('sendCritique()');
      expect(response.text).toContain('finalizePlan()');
    });

    it('should include the plan table structure', async () => {
      const response = await request(mealplanDebugApp).get('/');

      expect(response.text).toContain('<th>Day</th>');
      expect(response.text).toContain('<th>Breakfast</th>');
      expect(response.text).toContain('<th>Lunch</th>');
      expect(response.text).toContain('<th>Dinner</th>');
    });
  });
});
