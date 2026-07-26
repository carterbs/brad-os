import { describe, expect, it } from 'vitest';
import { getCollectionName, getEnvironment } from './firebase.js';
import { runWithEnvironment } from './runtime/environment-context.js';

describe('Firebase environment selection', () => {
  it('uses unprefixed collection names in production', () => {
    const collectionName = runWithEnvironment('prod', () =>
      getCollectionName('workouts')
    );

    expect(collectionName).toBe('workouts');
  });

  it('uses dev-prefixed collection names in development', () => {
    const collectionName = runWithEnvironment('dev', () =>
      getCollectionName('workouts')
    );

    expect(collectionName).toBe('dev_workouts');
  });

  it('does not infer an environment from process-wide function variables', () => {
    process.env['K_SERVICE'] = 'devHealth';
    process.env['FUNCTION_NAME'] = 'devHealth';

    expect(() => getEnvironment()).toThrow(
      'API environment is unavailable outside an explicit request context'
    );

    delete process.env['K_SERVICE'];
    delete process.env['FUNCTION_NAME'];
  });
});
