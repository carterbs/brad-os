#!/usr/bin/env tsx
/**
 * Verifies firebase.json rewrite rules match stripPathPrefix() calls in handlers.
 *
 * This catches the common misconfiguration where the hosting rewrite path and
 * the Express stripPathPrefix argument diverge, causing silent 404s.
 *
 * Exit 0 if all match, exit 1 if mismatches found.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..');
const FIREBASE_JSON = path.join(ROOT_DIR, 'firebase.json');
const HANDLERS_DIR = path.join(ROOT_DIR, 'packages/functions/src/handlers');
const INDEX_TS = path.join(ROOT_DIR, 'packages/functions/src/index.ts');
const CREATE_RESOURCE_ROUTER_TS = path.join(ROOT_DIR, 'packages/functions/src/middleware/create-resource-router.ts');

interface RewriteRule {
  source: string;
  function: string;
}

interface FunctionMapping {
  functionName: string;
  appImportName: string;
  handlerFile: string;
}

// Step 1: Read firebase.json and extract rewrite rules pointing to functions
const firebaseConfig = JSON.parse(fs.readFileSync(FIREBASE_JSON, 'utf-8'));
const rewrites: RewriteRule[] = (firebaseConfig.hosting?.rewrites ?? []).filter(
  (r: Record<string, unknown>) => 'function' in r
);

// Deduplicate rewrites by function name (there are base + wildcard pairs)
const rewriteByFunction = new Map<string, string>();
for (const r of rewrites) {
  // Use the wildcard variant (/**) for the most specific path, or the base one
  const existing = rewriteByFunction.get(r.function);
  if (!existing || r.source.endsWith('/**')) {
    rewriteByFunction.set(r.function, r.source);
  }
}

// Step 2: Parse index.ts to map function names to handler app imports
const indexContent = fs.readFileSync(INDEX_TS, 'utf-8');

// Parse import lines: `import { healthApp } from './handlers/health.js';`
const importPattern = /import\s+\{\s*(\w+)\s*\}\s+from\s+'\.\/handlers\/([\w-]+)\.js'/g;
const appToHandler = new Map<string, string>();
let importMatch: RegExpExecArray | null;
while ((importMatch = importPattern.exec(indexContent)) !== null) {
  const appName = importMatch[1]!;
  const handlerFile = importMatch[2]!;
  appToHandler.set(appName, handlerFile);
}

// Parse register lines: `const { dev: devHealth, prod: prodHealth } = register(healthApp);`
const registerPattern = /const\s+\{\s*dev:\s*(\w+),\s*prod:\s*(\w+)\s*\}\s*=\s*register\((\w+)/g;
const functionToApp = new Map<string, string>();
let registerMatch: RegExpExecArray | null;
while ((registerMatch = registerPattern.exec(indexContent)) !== null) {
  const devName = registerMatch[1]!;
  const prodName = registerMatch[2]!;
  const appName = registerMatch[3]!;
  functionToApp.set(devName, appName);
  functionToApp.set(prodName, appName);
}

// Also handle standalone exports like: `export const devMealplanDebug = onRequest(defaultOptions, mealplanDebugApp);`
const standalonePattern = /export\s+const\s+(\w+)\s*=\s*onRequest\(\w+,\s*(\w+)\)/g;
let standaloneMatch: RegExpExecArray | null;
while ((standaloneMatch = standalonePattern.exec(indexContent)) !== null) {
  const funcName = standaloneMatch[1]!;
  const appName = standaloneMatch[2]!;
  functionToApp.set(funcName, appName);
}

// Step 3: For each handler, find the stripPathPrefix argument
// Handlers use either:
//   a) createBaseApp('resource-name') which internally calls stripPathPrefix('resource-name')
//   b) Direct stripPathPrefix('resource-name') call

function getStripPrefixArg(handlerFile: string): string | null {
  const filePath = path.join(HANDLERS_DIR, `${handlerFile}.ts`);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for createBaseApp('...') or createResourceRouter({ resourceName: '...' })
  const createBaseAppMatch = /createBaseApp\(\s*'([^']+)'\s*\)/.exec(content);
  if (createBaseAppMatch) return createBaseAppMatch[1]!;

  const createResourceRouterMatch = /createResourceRouter\(\s*\{[^}]*resourceName:\s*'([^']+)'/.exec(content);
  if (createResourceRouterMatch) return createResourceRouterMatch[1]!;

  // Check for direct stripPathPrefix('...')
  const stripMatch = /stripPathPrefix\(\s*'([^']+)'\s*\)/.exec(content);
  if (stripMatch) return stripMatch[1]!;

  return null;
}

/** Extract the last path segment from a rewrite source, e.g., "/api/dev/health-sync/**" → "health-sync" */
function extractResourceFromSource(source: string): string {
  // Remove trailing /** or /*
  const cleanPath = source.replace(/\/\*+$/, '');
  const segments = cleanPath.split('/');
  return segments[segments.length - 1]!;
}

// Step 4: Compare rewrite paths with stripPathPrefix arguments
let hasMismatches = false;

// Process only dev functions (prod mirrors dev, checking both would double-report)
const devRewrites = [...rewriteByFunction.entries()].filter(([funcName]) =>
  funcName.startsWith('dev')
);

for (const [funcName, source] of devRewrites) {
  const appName = functionToApp.get(funcName);
  if (!appName) {
    // Debug-only or special functions like devMealplanDebug use /debug path
    // Skip these as they may not follow the standard pattern
    continue;
  }

  const handlerFile = appToHandler.get(appName);
  if (!handlerFile) {
    console.log(`WARNING: Could not find handler file for app '${appName}' (function '${funcName}')`);
    continue;
  }

  const stripPrefixArg = getStripPrefixArg(handlerFile);
  if (stripPrefixArg === null) {
    console.log(`WARNING: No stripPathPrefix or createBaseApp found in handlers/${handlerFile}.ts for function '${funcName}'`);
    continue;
  }

  const expectedResource = extractResourceFromSource(source);

  if (stripPrefixArg !== expectedResource) {
    hasMismatches = true;
    // Find the prod equivalent
    const prodFuncName = funcName.replace(/^dev/, 'prod');
    const prodSource = rewriteByFunction.get(prodFuncName);

    console.log(
      `MISMATCH: firebase.json rewrite '${source}' → function '${funcName}' ` +
      `but stripPathPrefix('${stripPrefixArg}') used. ` +
      `Should be stripPathPrefix('${expectedResource}').`
    );
    if (prodSource) {
      const prodResource = extractResourceFromSource(prodSource);
      if (prodResource !== stripPrefixArg) {
        console.log(
          `  Also affects prod: '${prodSource}' → '${prodFuncName}'`
        );
      }
    }
    console.log();
  }
}

if (!hasMismatches) {
  console.log('All firebase.json rewrites match their stripPathPrefix() arguments.');
}

process.exit(hasMismatches ? 1 : 0);
