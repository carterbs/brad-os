import type { EndpointEntry } from '../packages/functions/src/endpoint-manifest.js';

export interface FirebaseRewrite {
  source: string;
  function: string;
}

export function toPascalCase(str: string): string {
  const segments = str.split('-').filter((segment) => segment.length > 0);
  return segments
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join('');
}

export function toCamelCase(str: string): string {
  const segments = str.split('-').filter((segment) => segment.length > 0);
  const [first, ...rest] = segments;
  const firstSegment = first ?? '';
  const restSegments = rest.map((segment) => segment[0]?.toUpperCase() + segment.slice(1));
  return `${firstSegment}${restSegments.join('')}`;
}

export function getFunctionStem(entry: EndpointEntry): string {
  return entry.functionStem ?? toPascalCase(entry.routePath);
}

export function getAppExportName(entry: EndpointEntry): string {
  return `${toCamelCase(entry.handlerFile)}App`;
}

export function getDevFunctionName(entry: EndpointEntry): string {
  return `dev${getFunctionStem(entry)}`;
}

export function getProdFunctionName(entry: EndpointEntry): string {
  return `prod${getFunctionStem(entry)}`;
}

export function generateRewrites(manifest: readonly EndpointEntry[]): FirebaseRewrite[] {
  const rewrites: FirebaseRewrite[] = [];
  const devRewrites: FirebaseRewrite[] = [];
  const prodRewrites: FirebaseRewrite[] = [];

  for (const entry of manifest) {
    const devFunction = getDevFunctionName(entry);
    const devSource = entry.customSource ?? `/api/dev/${entry.routePath}`;
    devRewrites.push({ source: devSource, function: devFunction });
    devRewrites.push({ source: `${devSource}/**`, function: devFunction });

    if (entry.devOnly === true) {
      continue;
    }

    const prodFunction = getProdFunctionName(entry);
    const prodSource = entry.customSource ?? `/api/prod/${entry.routePath}`;
    prodRewrites.push({ source: prodSource, function: prodFunction });
    prodRewrites.push({ source: `${prodSource}/**`, function: prodFunction });
  }

  return [...devRewrites, ...prodRewrites];
}

export function compareRewrites(
  expected: FirebaseRewrite[],
  actual: FirebaseRewrite[]
): string[] {
  const violations: string[] = [];
  const expectedKeys = expected.map((rewrite) => `${rewrite.source}|${rewrite.function}`);
  const actualKeys = actual.map((rewrite) => `${rewrite.source}|${rewrite.function}`);
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
