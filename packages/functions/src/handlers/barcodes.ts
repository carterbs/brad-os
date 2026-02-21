import {
  createBarcodeSchema,
  updateBarcodeSchema,
} from '../shared.js';
import { createResourceRouter } from '../middleware/create-resource-router.js';
import { BarcodeRepository } from '../repositories/barcode.repository.js';

export const barcodesApp = createResourceRouter({
  resourceName: 'barcodes',
  displayName: 'Barcode',
  RepoClass: BarcodeRepository,
  createSchema: createBarcodeSchema,
  updateSchema: updateBarcodeSchema,
});
