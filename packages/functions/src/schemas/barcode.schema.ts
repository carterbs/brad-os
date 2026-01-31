import { z } from 'zod';

export const createBarcodeSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(200),
  barcode_type: z.enum(['code128', 'code39', 'qr']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex color like #FF00FF'),
  sort_order: z.number().int().nonnegative().default(0),
});

export const updateBarcodeSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  value: z.string().min(1).max(200).optional(),
  barcode_type: z.enum(['code128', 'code39', 'qr']).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export type CreateBarcodeInput = z.infer<typeof createBarcodeSchema>;
export type UpdateBarcodeInput = z.infer<typeof updateBarcodeSchema>;
