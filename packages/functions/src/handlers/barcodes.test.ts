import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import {
  type ApiResponse,
  createBarcode,
  createMockBarcodeRepository,
} from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock the repository
const mockBarcodeRepo = createMockBarcodeRepository();

vi.mock('../repositories/barcode.repository.js', () => ({
  BarcodeRepository: vi.fn().mockImplementation(() => mockBarcodeRepo),
}));

// Import after mocks
import { barcodesApp } from './barcodes.js';

describe('Barcodes Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /barcodes', () => {
    it('should return all barcodes', async () => {
      const barcodes = [
        createBarcode({ id: '1', label: 'Costco', sort_order: 0 }),
        createBarcode({ id: '2', label: 'Gym', sort_order: 1 }),
      ];
      mockBarcodeRepo.findAll.mockResolvedValue(barcodes);

      const response = await request(barcodesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: barcodes });
      expect(mockBarcodeRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no barcodes exist', async () => {
      mockBarcodeRepo.findAll.mockResolvedValue([]);

      const response = await request(barcodesApp).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: [] });
    });
  });

  describe('GET /barcodes/:id', () => {
    it('should return barcode by id', async () => {
      const barcode = createBarcode({ id: 'bc-123' });
      mockBarcodeRepo.findById.mockResolvedValue(barcode);

      const response = await request(barcodesApp).get('/bc-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: barcode });
      expect(mockBarcodeRepo.findById).toHaveBeenCalledWith('bc-123');
    });

    it('should return 404 when barcode not found', async () => {
      mockBarcodeRepo.findById.mockResolvedValue(null);

      const response = await request(barcodesApp).get('/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Barcode with id non-existent not found' },
      });
    });
  });

  describe('POST /barcodes', () => {
    it('should create barcode with valid data', async () => {
      const created = createBarcode({
        id: 'new-bc',
        label: 'Costco',
        value: '12345678',
        barcode_type: 'code128',
        color: '#FF5733',
        sort_order: 0,
      });
      mockBarcodeRepo.create.mockResolvedValue(created);

      const response = await request(barcodesApp).post('/').send({
        label: 'Costco',
        value: '12345678',
        barcode_type: 'code128',
        color: '#FF5733',
        sort_order: 0,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: created });
      expect(mockBarcodeRepo.create).toHaveBeenCalledWith({
        label: 'Costco',
        value: '12345678',
        barcode_type: 'code128',
        color: '#FF5733',
        sort_order: 0,
      });
    });

    it('should return 400 for invalid barcode_type', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        label: 'Test',
        value: '123',
        barcode_type: 'invalid',
        color: '#FF5733',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid hex color', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        label: 'Test',
        value: '123',
        barcode_type: 'qr',
        color: 'not-a-hex',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing label', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        value: '123',
        barcode_type: 'qr',
        color: '#FF5733',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for empty label', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        label: '',
        value: '123',
        barcode_type: 'qr',
        color: '#FF5733',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative sort_order', async () => {
      const response: Response = await request(barcodesApp).post('/').send({
        label: 'Test',
        value: '123',
        barcode_type: 'qr',
        color: '#FF5733',
        sort_order: -1,
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /barcodes/:id', () => {
    it('should update barcode with valid data', async () => {
      const updated = createBarcode({ id: 'bc-123', label: 'Updated' });
      mockBarcodeRepo.update.mockResolvedValue(updated);

      const response = await request(barcodesApp).put('/bc-123').send({ label: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: updated });
      expect(mockBarcodeRepo.update).toHaveBeenCalledWith('bc-123', { label: 'Updated' });
    });

    it('should return 404 when barcode not found', async () => {
      mockBarcodeRepo.update.mockResolvedValue(null);

      const response = await request(barcodesApp).put('/non-existent').send({ label: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Barcode with id non-existent not found' },
      });
    });

    it('should return 400 for invalid hex color in update', async () => {
      const response: Response = await request(barcodesApp).put('/bc-123').send({ color: 'bad' });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /barcodes/:id', () => {
    it('should delete barcode successfully', async () => {
      mockBarcodeRepo.delete.mockResolvedValue(true);

      const response = await request(barcodesApp).delete('/bc-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { deleted: true } });
      expect(mockBarcodeRepo.delete).toHaveBeenCalledWith('bc-123');
    });

    it('should return 404 when barcode not found', async () => {
      mockBarcodeRepo.delete.mockResolvedValue(false);

      const response = await request(barcodesApp).delete('/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Barcode with id non-existent not found' },
      });
    });
  });
});
