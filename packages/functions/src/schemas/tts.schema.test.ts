import { describe, expect, it } from 'vitest';
import { synthesizeSchema } from './tts.schema.js';

describe('tts.schema', () => {
  it('accepts text payload within size limits', () => {
    const result = synthesizeSchema.safeParse({ text: 'hello world' });
    expect(result.success).toBe(true);
  });

  it('rejects empty text and missing text', () => {
    const empty = synthesizeSchema.safeParse({ text: '' });
    const missing = synthesizeSchema.safeParse({});

    expect(empty.success).toBe(false);
    expect(missing.success).toBe(false);
  });

  it('accepts exactly 5000 chars and rejects 5001 chars', () => {
    const atLimit = synthesizeSchema.safeParse({ text: 'a'.repeat(5000) });
    const overLimit = synthesizeSchema.safeParse({ text: 'a'.repeat(5001) });

    expect(atLimit.success).toBe(true);
    expect(overLimit.success).toBe(false);
  });
});
