import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ENDPOINT_MANIFEST,
  type EndpointEntry,
} from '../packages/functions/src/endpoint-manifest.js';
import {
  CLOUD_RUN_API_REWRITE,
  compareRewrites,
  generateRewrites,
  type FirebaseRewrite,
} from './rewrite-utils.js';

describe('generateRewrites', () => {
  it('routes the complete API namespace to one pinned Cloud Run service', () => {
    const manifest: EndpointEntry[] = [
      { routePath: 'exercises', handlerFile: 'exercises' },
    ];
    expect(generateRewrites(manifest)).toEqual([CLOUD_RUN_API_REWRITE]);
  });

  it('publishes all manifest routes through one Cloud Run rewrite', () => {
    const rewrites = generateRewrites(ENDPOINT_MANIFEST);
    expect(rewrites).toEqual([CLOUD_RUN_API_REWRITE]);
  });

  it('refuses to generate a front door for a manifest with no API routes', () => {
    const manifest: EndpointEntry[] = [
      {
        routePath: '',
        handlerFile: 'invalid',
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
      functions?: unknown;
      emulators?: Record<string, unknown>;
      hosting?: {
        rewrites?: FirebaseRewrite[];
      };
    };

    expect(firebaseConfig.functions).toBeUndefined();
    expect(Object.keys(firebaseConfig.emulators ?? {})).toEqual(['firestore']);
    expect(firebaseConfig.hosting?.rewrites).toEqual(
      generateRewrites(ENDPOINT_MANIFEST)
    );
  });
});

describe('compareRewrites', () => {
  const expected: FirebaseRewrite[] = [CLOUD_RUN_API_REWRITE];

  it('returns no violations when every Cloud Run field matches', () => {
    expect(compareRewrites(expected, [CLOUD_RUN_API_REWRITE])).toEqual([]);
  });

  it('reports missing, extra, and changed targets', () => {
    expect(compareRewrites(expected, [])).toEqual([
      'Missing rewrite: /api/**|brad-os-api|us-central1|pinTag=true',
    ]);

    const wrongTarget: FirebaseRewrite = {
      source: '/api/**',
      run: {
        serviceId: 'wrong-service',
        region: 'us-central1',
        pinTag: true,
      },
    };
    const violations = compareRewrites(expected, [wrongTarget]);
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

  it('rejects any Function-backed Hosting rewrite', () => {
    const violations = compareRewrites(expected, [
      CLOUD_RUN_API_REWRITE,
      { source: '/legacy', function: 'legacyFunction' },
    ]);

    expect(violations).toContain(
      'Extra rewrite: /legacy|function=legacyFunction'
    );
  });
});
