export function toPascalCase(str) {
    const segments = str.split('-').filter((segment) => segment.length > 0);
    return segments
        .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
        .join('');
}
export function toCamelCase(str) {
    const segments = str.split('-').filter((segment) => segment.length > 0);
    const [first, ...rest] = segments;
    const firstSegment = first ?? '';
    const restSegments = rest.map((segment) => segment[0]?.toUpperCase() + segment.slice(1));
    return `${firstSegment}${restSegments.join('')}`;
}
export function getFunctionStem(entry) {
    return entry.functionStem ?? toPascalCase(entry.routePath);
}
export function getAppExportName(entry) {
    return `${toCamelCase(entry.handlerFile)}App`;
}
export function getDevFunctionName(entry) {
    return `dev${getFunctionStem(entry)}`;
}
export function getProdFunctionName(entry) {
    return `prod${getFunctionStem(entry)}`;
}
export function generateRewrites(manifest) {
    const rewrites = [];
    const devRewrites = [];
    const prodRewrites = [];
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
export function compareRewrites(expected, actual) {
    const violations = [];
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
            violations.push(`Rewrite order mismatch at index ${i}: expected '${expectedKeys[i]}', found '${actualKeys[i]}'`);
        }
    }
    return violations;
}
