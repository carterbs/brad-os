import { describe, expect, it } from 'vitest';
import { createMesocycleSchema, updateMesocycleSchema } from './mesocycle.schema.js';

describe('mesocycle schema', () => {
  it('accepts a valid create payload', () => {
    const result = createMesocycleSchema.safeParse({
      plan_id: 'plan-1',
      start_date: '2026-02-25',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid plan or date values on create', () => {
    const missingPlanId = createMesocycleSchema.safeParse({
      start_date: '2026-02-25',
    });
    const invalidDate = createMesocycleSchema.safeParse({
      plan_id: 'plan-1',
      start_date: '02/25/2026',
    });

    expect(missingPlanId.success).toBe(false);
    expect(invalidDate.success).toBe(false);
  });

  it('accepts update payloads', () => {
    const result = updateMesocycleSchema.safeParse({
      current_week: 3,
      status: 'active',
    });
    const emptyPayload = updateMesocycleSchema.safeParse({});

    expect(result.success).toBe(true);
    expect(emptyPayload.success).toBe(true);
  });

  it('rejects invalid week and status updates', () => {
    const invalidWeek = updateMesocycleSchema.safeParse({
      current_week: 0,
    });
    const nonIntegerWeek = updateMesocycleSchema.safeParse({
      current_week: 1.5,
    });
    const invalidStatus = updateMesocycleSchema.safeParse({
      status: 'paused',
    });

    expect(invalidWeek.success).toBe(false);
    expect(nonIntegerWeek.success).toBe(false);
    expect(invalidStatus.success).toBe(false);
  });
});
