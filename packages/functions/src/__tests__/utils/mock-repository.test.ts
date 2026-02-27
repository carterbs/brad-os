import { describe, it, expect, vi } from 'vitest';
import {
  createMockCyclingActivityRepository,
  createMockStretchRepository,
  createMockWorkoutRepository,
} from './index.js';

describe('Mock repository factories', () => {
  it('creates stretch repository with required methods', () => {
    const mockStretchRepo = createMockStretchRepository();

    expect(mockStretchRepo.findAll).toBeTypeOf('function');
    expect(mockStretchRepo.findByRegion).toBeTypeOf('function');
    expect(mockStretchRepo.seed).toBeTypeOf('function');
    expect(vi.isMockFunction(mockStretchRepo.findAll)).toBe(true);
    expect(vi.isMockFunction(mockStretchRepo.findByRegion)).toBe(true);
    expect(vi.isMockFunction(mockStretchRepo.seed)).toBe(true);
  });

  it('creates cycling activity repository with all required methods', () => {
    const mockCyclingActivityRepo = createMockCyclingActivityRepository();

    expect(mockCyclingActivityRepo.findAllByUser).toBeTypeOf('function');
    expect(mockCyclingActivityRepo.findById).toBeTypeOf('function');
    expect(mockCyclingActivityRepo.findByStravaId).toBeTypeOf('function');
    expect(mockCyclingActivityRepo.create).toBeTypeOf('function');
    expect(mockCyclingActivityRepo.update).toBeTypeOf('function');
    expect(mockCyclingActivityRepo.delete).toBeTypeOf('function');
    expect(mockCyclingActivityRepo.saveStreams).toBeTypeOf('function');
    expect(mockCyclingActivityRepo.getStreams).toBeTypeOf('function');

    expect(vi.isMockFunction(mockCyclingActivityRepo.create)).toBe(true);
    expect(vi.isMockFunction(mockCyclingActivityRepo.update)).toBe(true);
    expect(vi.isMockFunction(mockCyclingActivityRepo.delete)).toBe(true);
    expect(vi.isMockFunction(mockCyclingActivityRepo.saveStreams)).toBe(true);
    expect(vi.isMockFunction(mockCyclingActivityRepo.getStreams)).toBe(true);
  });

  it('extends workout repository with findByCompletedAtRange method', () => {
    const mockWorkoutRepo = createMockWorkoutRepository();

    expect(mockWorkoutRepo.findByCompletedAtRange).toBeTypeOf('function');
    expect(vi.isMockFunction(mockWorkoutRepo.findByCompletedAtRange)).toBe(true);
  });
});
