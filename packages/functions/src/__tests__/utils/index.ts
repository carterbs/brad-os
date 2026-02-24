/**
 * Test utilities index.
 *
 * Re-exports all test utilities for convenient imports in test files.
 *
 * @example
 * ```typescript
 * import {
 *   createMockExerciseRepository,
 *   createExercise,
 *   createMockContext,
 * } from '../__tests__/utils/index.js';
 * ```
 */

// Mock repository factories
export * from './mock-repository.js';

// Test data fixtures
export * from './fixtures.js';

// Mock Express utilities
export * from './mock-express.js';

// Test-specific API types
export * from './api-types.js';
