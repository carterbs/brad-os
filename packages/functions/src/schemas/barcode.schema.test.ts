import { describe, expect, it } from 'vitest';
import { createBarcodeSchema, updateBarcodeSchema } from './barcode.schema.js';

describe('createBarcodeSchema', () => {
  const validPayload = {
    label: 'Breakfast',
    value: '12345',
    barcode_type: 'code128' as const,
    color: '#A1B2C3',
    sort_order: 7,
  };

  it('accepts a valid payload', () => {
    const result = createBarcodeSchema.safeParse(validPayload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe('Breakfast');
      expect(result.data.barcode_type).toBe('code128');
    }
  });

  it('accepts all enum values', () => {
    const values = ['code128', 'code39', 'qr'] as const;

    for (const value of values) {
      const result = createBarcodeSchema.safeParse({
        ...validPayload,
        barcode_type: value,
        sort_order: 0,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts label length boundaries and rejects over-maximum', () => {
    const min = createBarcodeSchema.safeParse({
      ...validPayload,
      label: 'A',
      sort_order: 0,
    });
    const max = createBarcodeSchema.safeParse({
      ...validPayload,
      label: 'A'.repeat(100),
      sort_order: 0,
    });
    const tooLong = createBarcodeSchema.safeParse({
      ...validPayload,
      label: 'A'.repeat(101),
      sort_order: 0,
    });

    expect(min.success).toBe(true);
    expect(max.success).toBe(true);
    expect(tooLong.success).toBe(false);
  });

  it('accepts value length boundaries and rejects over-maximum', () => {
    const min = createBarcodeSchema.safeParse({
      ...validPayload,
      value: 'A',
      sort_order: 0,
    });
    const max = createBarcodeSchema.safeParse({
      ...validPayload,
      value: 'A'.repeat(200),
      sort_order: 0,
    });
    const tooLong = createBarcodeSchema.safeParse({
      ...validPayload,
      value: 'A'.repeat(201),
      sort_order: 0,
    });

    expect(min.success).toBe(true);
    expect(max.success).toBe(true);
    expect(tooLong.success).toBe(false);
  });

  it('accepts valid hex color and rejects malformed colors', () => {
    const valid = createBarcodeSchema.safeParse({
      ...validPayload,
      sort_order: 0,
    });
    const missingHash = createBarcodeSchema.safeParse({
      ...validPayload,
      color: 'A1B2C3',
      sort_order: 0,
    });
    const short = createBarcodeSchema.safeParse({
      ...validPayload,
      color: '#FFF',
      sort_order: 0,
    });
    const invalidChars = createBarcodeSchema.safeParse({
      ...validPayload,
      color: '#A1B2CG',
      sort_order: 0,
    });

    expect(valid.success).toBe(true);
    expect(missingHash.success).toBe(false);
    expect(short.success).toBe(false);
    expect(invalidChars.success).toBe(false);
  });

  it('defaults sort_order to 0 when omitted', () => {
    const result = createBarcodeSchema.safeParse({
      label: validPayload.label,
      value: validPayload.value,
      barcode_type: 'qr',
      color: '#123456',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_order).toBe(0);
    }
  });

  it('rejects negative and non-integer sort_order', () => {
    const negative = createBarcodeSchema.safeParse({
      ...validPayload,
      sort_order: -1,
    });
    const fractional = createBarcodeSchema.safeParse({
      ...validPayload,
      sort_order: 3.5,
    });

    expect(negative.success).toBe(false);
    expect(fractional.success).toBe(false);
  });
});

describe('updateBarcodeSchema', () => {
  it('accepts empty object and partial updates', () => {
    const empty = updateBarcodeSchema.safeParse({});
    const partial = updateBarcodeSchema.safeParse({
      label: 'New Label',
    });

    expect(empty.success).toBe(true);
    expect(partial.success).toBe(true);
  });

  it('rejects invalid enum and invalid color values', () => {
    const invalidEnum = updateBarcodeSchema.safeParse({
      barcode_type: 'ean',
    });
    const invalidColor = updateBarcodeSchema.safeParse({
      color: 'A1B2C3',
    });
    const shortColor = updateBarcodeSchema.safeParse({
      color: '#FFF',
    });

    expect(invalidEnum.success).toBe(false);
    expect(invalidColor.success).toBe(false);
    expect(shortColor.success).toBe(false);
  });

  it('rejects invalid string lengths and invalid sort_order values', () => {
    const labelTooLong = updateBarcodeSchema.safeParse({
      label: 'A'.repeat(101),
    });
    const valueTooLong = updateBarcodeSchema.safeParse({
      value: 'A'.repeat(201),
    });
    const negative = updateBarcodeSchema.safeParse({
      sort_order: -1,
    });
    const fractional = updateBarcodeSchema.safeParse({
      sort_order: 2.75,
    });

    expect(labelTooLong.success).toBe(false);
    expect(valueTooLong.success).toBe(false);
    expect(negative.success).toBe(false);
    expect(fractional.success).toBe(false);
  });
});
