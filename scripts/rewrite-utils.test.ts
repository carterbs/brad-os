import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ENDPOINT_MANIFEST, type EndpointEntry } from '../packages/functions/src/endpoint-manifest.js';
import {
  compareRewrites,
  generateRewrites,
  getAppExportName,
  getDevFunctionName,
  getProdFunctionName,
  toCamelCase,
  toPascalCase,
  type FirebaseRewrite,
} from './rewrite-utils.js';

describe('toPascalCase', () => {
  it('capitalizes single word', () => {
    expect(toPascalCase('health')).toBe('Health');
  });

  it('converts kebab-case', () => {
    expect(toPascalCase('workout-sets')).toBe('WorkoutSets');
  });

  it('handles camelCase input', () => {
    expect(toPascalCase('guidedMeditations')).toBe('GuidedMeditations');
  });

  it('handles all-lowercase acronym', () => {
    expect(toPascalCase('tts')).toBe('Tts');
  });
});

describe('toCamelCase', () => {
  it('returns single word unchanged', () => {
    expect(toCamelCase('health')).toBe('health');
  });

  it('converts kebab-case', () => {
    expect(toCamelCase('strava-webhook')).toBe('stravaWebhook');
  });

  it('handles camelCase input', () => {
    expect(toCamelCase('stretchSessions')).toBe('stretchSessions');
  });
});

describe('getAppExportName', () => {
  it('builds app export from handler file', () => {
    expect(getAppExportName({ routePath: 'exercises', handlerFile: 'health' })).toBe('healthApp');
    expect(getAppExportName({ routePath: 'exercises', handlerFile: 'strava-webhook' })).toBe('stravaWebhookApp');
  });
});

describe('function name helpers', () => {
  it('builds dev and prod function names from manifest entry', () => {
    const entry = { routePath: 'mealplans', handlerFile: 'mealplans' };
    expect(getDevFunctionName(entry)).toBe('devMealplans');
    expect(getProdFunctionName(entry)).toBe('prodMealplans');
  });
});

describe('generateRewrites', () => {
  it('generates 4 rewrites per standard entry', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises' }];
    const rewrites = generateRewrites(manifest);

    expect(rewrites).toHaveLength(4);
    expect(rewrites).toEqual([
      { source: '/api/dev/exercises', function: 'devExercises' },
      { source: '/api/dev/exercises/**', function: 'devExercises' },
      { source: '/api/prod/exercises', function: 'prodExercises' },
      { source: '/api/prod/exercises/**', function: 'prodExercises' },
    ]);
  });

  it('generates 2 rewrites for devOnly entry', () => {
    const manifest: EndpointEntry[] = [{ routePath: '', handlerFile: 'mealplan-debug', devOnly: true, customSource: '/debug', functionStem: 'MealplanDebug' }];
    const rewrites = generateRewrites(manifest);

    expect(rewrites).toHaveLength(2);
    expect(rewrites).toEqual([
      { source: '/debug', function: 'devMealplanDebug' },
      { source: '/debug/**', function: 'devMealplanDebug' },
    ]);
  });

  it('uses custom source when provided', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises', customSource: '/coach' }];
    const rewrites = generateRewrites(manifest);
    expect(rewrites[0]).toEqual({ source: '/coach', function: 'devExercises' });
    expect(rewrites[1]).toEqual({ source: '/coach/**', function: 'devExercises' });
    expect(rewrites[2]).toEqual({ source: '/coach', function: 'prodExercises' });
    expect(rewrites[3]).toEqual({ source: '/coach/**', function: 'prodExercises' });
  });

  it('uses functionStem override when provided', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'guidedMeditations', handlerFile: 'guidedMeditations', functionStem: 'GuidedMeditationPortal' }];
    const rewrites = generateRewrites(manifest);
    expect(rewrites).toEqual([
      { source: '/api/dev/guidedMeditations', function: 'devGuidedMeditationPortal' },
      { source: '/api/dev/guidedMeditations/**', function: 'devGuidedMeditationPortal' },
      { source: '/api/prod/guidedMeditations', function: 'prodGuidedMeditationPortal' },
      { source: '/api/prod/guidedMeditations/**', function: 'prodGuidedMeditationPortal' },
    ]);
  });

  it('emits all dev rewrites before prod rewrites', () => {
    const manifest: EndpointEntry[] = [
      { routePath: 'exercises', handlerFile: 'exercises' },
      { routePath: 'calendar', handlerFile: 'calendar' },
    ];
    const rewrites = generateRewrites(manifest);
    expect(rewrites).toHaveLength(8);
    expect(rewrites).toEqual([
      { source: '/api/dev/exercises', function: 'devExercises' },
      { source: '/api/dev/exercises/**', function: 'devExercises' },
      { source: '/api/dev/calendar', function: 'devCalendar' },
      { source: '/api/dev/calendar/**', function: 'devCalendar' },
      { source: '/api/prod/exercises', function: 'prodExercises' },
      { source: '/api/prod/exercises/**', function: 'prodExercises' },
      { source: '/api/prod/calendar', function: 'prodCalendar' },
      { source: '/api/prod/calendar/**', function: 'prodCalendar' },
    ]);
  });

  it('generates output matching current firebase.json for the production manifest', () => {
    const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf-8')) as {
      hosting?: {
        rewrites?: FirebaseRewrite[];
      };
    };
    const existingRewrites = (firebaseConfig.hosting?.rewrites ?? []).filter(
      (rewrite): rewrite is FirebaseRewrite =>
        typeof rewrite.source === 'string' && typeof rewrite.function === 'string'
    );

    expect(generateRewrites(ENDPOINT_MANIFEST)).toEqual(existingRewrites);
  });
});

describe('compareRewrites', () => {
  it('returns no violations when rewrites match', () => {
    const expected = [
      { source: '/api/dev/exercises', function: 'devExercises' },
      { source: '/api/dev/exercises/**', function: 'devExercises' },
      { source: '/api/prod/exercises', function: 'prodExercises' },
      { source: '/api/prod/exercises/**', function: 'prodExercises' },
    ];
    const actual = [
      { source: '/api/dev/exercises', function: 'devExercises' },
      { source: '/api/dev/exercises/**', function: 'devExercises' },
      { source: '/api/prod/exercises', function: 'prodExercises' },
      { source: '/api/prod/exercises/**', function: 'prodExercises' },
    ];
    expect(compareRewrites(expected, actual)).toEqual([]);
  });

  it('reports missing rewrites', () => {
    const expected = [
      { source: '/api/dev/exercises', function: 'devExercises' },
      { source: '/api/dev/exercises/**', function: 'devExercises' },
      { source: '/api/prod/exercises', function: 'prodExercises' },
    ];
    const actual = [
      { source: '/api/dev/exercises', function: 'devExercises' },
      { source: '/api/dev/exercises/**', function: 'devExercises' },
    ];
    expect(compareRewrites(expected, actual).some((v) => v.includes('Missing rewrite'))).toBe(true);
    expect(compareRewrites(expected, actual)[0]).toContain('Missing rewrite');
  });

  it('reports extra rewrites', () => {
    const expected = [{ source: '/api/dev/exercises', function: 'devExercises' }];
    const actual = [
      { source: '/api/dev/exercises', function: 'devExercises' },
      { source: '/api/dev/exercises/**', function: 'devExercises' },
    ];
    expect(compareRewrites(expected, actual).some((v) => v.includes('Extra rewrite'))).toBe(true);
  });

  it('reports order differences', () => {
    const expected = [
      { source: '/api/dev/exercises', function: 'devExercises' },
      { source: '/api/prod/exercises', function: 'prodExercises' },
    ];
    const actual = [
      { source: '/api/prod/exercises', function: 'prodExercises' },
      { source: '/api/dev/exercises', function: 'devExercises' },
    ];
    expect(compareRewrites(expected, actual).some((v) => v.includes('Rewrite order mismatch'))).toBe(true);
  });
});
