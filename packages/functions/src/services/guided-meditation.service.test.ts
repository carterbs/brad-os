import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedMeditationService } from './guided-meditation.service.js';

const mockRepository = {
  getCategories: vi.fn(),
  findAllByCategory: vi.fn(),
  findById: vi.fn(),
};

describe('GuidedMeditationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates listCategories to repository', async () => {
    const categories = [{ id: 'sleep', name: 'sleep', scriptCount: 2 }];
    mockRepository.getCategories.mockResolvedValue(categories);

    const service = new GuidedMeditationService(mockRepository as never);
    const result = await service.listCategories();

    expect(result).toEqual(categories);
    expect(mockRepository.getCategories).toHaveBeenCalledTimes(1);
  });

  it('delegates listScriptsByCategory with the exact category value', async () => {
    const scripts = [{ id: 's1', category: 'sleep' }];
    mockRepository.findAllByCategory.mockResolvedValue(scripts);

    const service = new GuidedMeditationService(mockRepository as never);
    const result = await service.listScriptsByCategory('sleep');

    expect(result).toEqual(scripts);
    expect(mockRepository.findAllByCategory).toHaveBeenCalledWith('sleep');
  });

  it('returns null when script does not exist', async () => {
    mockRepository.findById.mockResolvedValue(null);

    const service = new GuidedMeditationService(mockRepository as never);
    const result = await service.getScriptById('missing-id');

    expect(result).toBeNull();
    expect(mockRepository.findById).toHaveBeenCalledWith('missing-id');
  });

  it('propagates repository errors without masking', async () => {
    const error = new Error('firestore unavailable');
    mockRepository.findAllByCategory.mockRejectedValue(error);

    const service = new GuidedMeditationService(mockRepository as never);

    await expect(service.listScriptsByCategory('focus')).rejects.toThrow('firestore unavailable');
  });
});
