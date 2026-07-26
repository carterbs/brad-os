import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ENDPOINT_MANIFEST,
  type EndpointEntry,
} from '../packages/functions/src/endpoint-manifest.js';
import {
  CLOUD_RUN_API_REWRITE,
  LEGACY_DEBUG_REWRITES,
  compareRewrites,
  generateRewrites,
  getAppExportName,
  getDevFunctionName,
  getProdFunctionName,
  toCamelCase,
  toPascalCase,
  type FirebaseRewrite,
} from './rewrite-utils.js';

describe('name helpers retained for legacy Cloud Functions', () => {
  it('converts route and handler names', () => {
    expect(toPascalCase('workout-sets')).toBe('WorkoutSets');
    expect(toPascalCase('guidedMeditations')).toBe('GuidedMeditations');
    expect(toCamelCase('strava-webhook')).toBe('stravaWebhook');
    expect(toCamelCase('stretchSessions')).toBe('stretchSessions');
  });

  it('builds legacy app and function export names', () => {
    const entry = { routePath: 'mealplans', handlerFile: 'strava-webhook' };
    expect(getAppExportName(entry)).toBe('stravaWebhookApp');
    expect(getDevFunctionName(entry)).toBe('devMealplans');
    expect(getProdFunctionName(entry)).toBe('prodMealplans');
  });

  it('honors the legacy function stem override', () => {
    const entry = {
      routePath: 'guidedMeditations',
      handlerFile: 'guidedMeditations',
      functionStem: 'GuidedMeditationPortal',
    };
    expect(getDevFunctionName(entry)).toBe('devGuidedMeditationPortal');
    expect(getProdFunctionName(entry)).toBe('prodGuidedMeditationPortal');
  });
});

describe('generateRewrites', () => {
  it('routes the complete API namespace to one pinned Cloud Run service', () => {
    const manifest: EndpointEntry[] = [
      { routePath: 'exercises', handlerFile: 'exercises' },
    ];
    expect(generateRewrites(manifest)).toEqual([
      CLOUD_RUN_API_REWRITE,
      ...LEGACY_DEBUG_REWRITES,
    ]);
  });

  it('preserves the two existing debug Function rewrites', () => {
    const rewrites = generateRewrites(ENDPOINT_MANIFEST);
    expect(rewrites).toHaveLength(3);
    expect(rewrites[0]?.source).toBe('/api/**');
    expect(rewrites.slice(1)).toEqual(LEGACY_DEBUG_REWRITES);
  });

  it('refuses to generate a front door for a manifest with no API routes', () => {
    const manifest: EndpointEntry[] = [
      {
        routePath: '',
        handlerFile: 'mealplan-debug',
        devOnly: true,
        customSource: '/debug',
        functionStem: 'MealplanDebug',
      },
    ];
    expect(() => generateRewrites(manifest)).toThrow(
      'Endpoint manifest must contain at least one public API route.'
    );
  });

  it('matches the checked-in Firebase Hosting configuration', () => {
    const firebaseConfig = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf-8')
    ) as {
      hosting?: {
        rewrites?: FirebaseRewrite[];
      };
    };

    expect(firebaseConfig.hosting?.rewrites).toEqual(
      generateRewrites(ENDPOINT_MANIFEST)
    );
  });
});

describe('compareRewrites', () => {
  const expected: FirebaseRewrite[] = [
    CLOUD_RUN_API_REWRITE,
    ...LEGACY_DEBUG_REWRITES,
  ];

  it('returns no violations when every Cloud Run field matches', () => {
    expect(
      compareRewrites(expected, [
        CLOUD_RUN_API_REWRITE,
        ...LEGACY_DEBUG_REWRITES,
      ])
    ).toEqual([]);
  });

  it('reports missing, extra, and changed targets', () => {
    expect(compareRewrites(expected, [])).toEqual([
      'Missing rewrite: /api/**|brad-os-api|us-central1|pinTag=true',
      'Missing rewrite: /debug|function=devMealplanDebug',
      'Missing rewrite: /debug/**|function=devMealplanDebug',
    ]);

    const wrongTarget: FirebaseRewrite = {
      source: '/api/**',
      run: {
        serviceId: 'wrong-service',
        region: 'us-central1',
        pinTag: true,
      },
    };
    const violations = compareRewrites(expected, [
      wrongTarget,
      ...LEGACY_DEBUG_REWRITES,
    ]);
    expect(
      violations.some((violation) => violation.startsWith('Missing rewrite:'))
    ).toBe(true);
    expect(
      violations.some((violation) => violation.startsWith('Extra rewrite:'))
    ).toBe(true);
    expect(
      violations.some((violation) =>
        violation.startsWith('Rewrite order mismatch at index 0')
      )
    ).toBe(true);
  });
});
