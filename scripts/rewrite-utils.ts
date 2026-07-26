import type { EndpointEntry } from '../packages/functions/src/endpoint-manifest.js';

export interface FirebaseCloudRunTarget {
  serviceId: string;
  region: string;
  pinTag: boolean;
}

export interface FirebaseCloudRunRewrite {
  source: string;
  run: FirebaseCloudRunTarget;
}

export interface FirebaseFunctionRewrite {
  source: string;
  function: string;
}

export type FirebaseRewrite = FirebaseCloudRunRewrite | FirebaseFunctionRewrite;

export const CLOUD_RUN_SERVICE_ID = 'brad-os-api';
export const CLOUD_RUN_REGION = 'us-central1';
export const CLOUD_RUN_API_REWRITE: FirebaseRewrite = {
  source: '/api/**',
  run: {
    serviceId: CLOUD_RUN_SERVICE_ID,
    region: CLOUD_RUN_REGION,
    pinTag: true,
  },
};

export function generateRewrites(
  manifest: readonly EndpointEntry[]
): FirebaseRewrite[] {
  if (!manifest.some((entry) => entry.routePath.length > 0)) {
    throw new Error(
      'Endpoint manifest must contain at least one public API route.'
    );
  }

  return [CLOUD_RUN_API_REWRITE];
}

export function compareRewrites(
  expected: FirebaseRewrite[],
  actual: FirebaseRewrite[]
): string[] {
  const violations: string[] = [];
  const rewriteKey = (rewrite: FirebaseRewrite): string => {
    if ('function' in rewrite) {
      return `${rewrite.source}|function=${rewrite.function}`;
    }
    return [
      rewrite.source,
      rewrite.run.serviceId,
      rewrite.run.region,
      rewrite.run.pinTag ? 'pinTag=true' : 'pinTag=false',
    ].join('|');
  };
  const expectedKeys = expected.map(rewriteKey);
  const actualKeys = actual.map(rewriteKey);
  const expectedSet = new Set(expectedKeys);
  const actualSet = new Set(actualKeys);

  for (const key of expectedKeys) {
    if (!actualSet.has(key)) {
      violations.push(`Missing rewrite: ${key}`);
    }
  }

  for (const key of actualKeys) {
    if (!expectedSet.has(key)) {
      violations.push(`Extra rewrite: ${key}`);
    }
  }

  const minLength = Math.min(expectedKeys.length, actualKeys.length);
  for (let i = 0; i < minLength; i++) {
    if (expectedKeys[i] !== actualKeys[i]) {
      violations.push(
        `Rewrite order mismatch at index ${i}: expected '${expectedKeys[i]}', found '${actualKeys[i]}'`
      );
    }
  }

  return violations;
}
