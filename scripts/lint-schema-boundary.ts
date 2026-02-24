#!/usr/bin/env tsx
/**
 * Schema Boundary Linter
 *
 * Ensures all write routes (POST, PUT, PATCH) in handler files have
 * Zod validation via either:
 *   - validate(schema) middleware in the route chain
 *   - Inline .safeParse() call within the handler body
 *
 * Routes that don't accept a request body (action routes like /start,
 * /complete, /skip, /cancel, /unlog, /remove, /finalize) are exempt.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const HANDLERS_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  '../packages/functions/src/handlers'
);

interface Violation {
  file: string;
  method: string;
  routePath: string;
}

// Action route suffixes that typically don't accept a request body
const ACTION_SUFFIXES = [
  '/start',
  '/complete',
  '/skip',
  '/cancel',
  '/unlog',
  '/remove',
];

function isActionRoute(routePath: string): boolean {
  return ACTION_SUFFIXES.some((suffix) => routePath.endsWith(suffix));
}

function isTestFile(fileName: string): boolean {
  return fileName.endsWith('.test.ts') || fileName.endsWith('.spec.ts');
}

/**
 * Check if a route registration has validation.
 *
 * Patterns detected:
 * 1. validate(schema) in the route chain: app.post('/path', validate(schema), handler)
 * 2. Inline safeParse in the handler body (for handlers that validate manually)
 *
 * We look at the full text block from the route registration to the next route
 * registration or end of file.
 */
function checkHandlerFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const relPath = path.relative(process.cwd(), filePath);

  // Match route registrations: app.post(, app.put(, app.patch(
  // Also match multiline patterns like:
  //   app.post(
  //     '/path',
  // We capture the method and the route path
  const routeRegex =
    /app\.(post|put|patch)\(\s*\n?\s*['"`]([^'"`]+)['"`]/g;

  let match: RegExpExecArray | null;
  const routes: { method: string; routePath: string; index: number }[] = [];

  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1];
    const routePath = match[2];
    if (method !== undefined && routePath !== undefined) {
      routes.push({ method: method.toUpperCase(), routePath, index: match.index });
    }
  }

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    if (route === undefined) continue;

    // Skip action routes that don't accept a body
    if (isActionRoute(route.routePath)) continue;

    // Get the text block for this route (from its start to the next route or EOF)
    const nextRoute = routes[i + 1];
    const endIndex = nextRoute !== undefined ? nextRoute.index : content.length;
    const routeBlock = content.slice(route.index, endIndex);

    // Check for validate() middleware in the route chain
    const hasValidateMiddleware = /validate\s*\(/.test(routeBlock);

    // Check for inline .safeParse() call
    const hasSafeParse = /\.safeParse\s*\(/.test(routeBlock);

    // Check if this is part of a createResourceRouter call (already validated)
    const hasCreateResourceRouter = /createResourceRouter/.test(content);

    if (!hasValidateMiddleware && !hasSafeParse && !hasCreateResourceRouter) {
      violations.push({
        file: relPath,
        method: route.method,
        routePath: route.routePath,
      });
    }
  }

  return violations;
}

function main(): void {
  if (!fs.existsSync(HANDLERS_DIR)) {
    console.error(`Handlers directory not found: ${HANDLERS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(HANDLERS_DIR);
  const handlerFiles = files.filter(
    (f) => f.endsWith('.ts') && !isTestFile(f)
  );

  const allViolations: Violation[] = [];

  for (const file of handlerFiles) {
    const fullPath = path.join(HANDLERS_DIR, file);
    allViolations.push(...checkHandlerFile(fullPath));
  }

  if (allViolations.length === 0) {
    console.log('No schema boundary violations found.');
    process.exit(0);
  }

  console.log(
    `Found ${allViolations.length} schema boundary violation(s):\n`
  );

  for (const v of allViolations) {
    console.log(
      `VIOLATION: ${v.file} has a ${v.method} route at '${v.routePath}' without Zod validation. Add validate(schema) middleware.`
    );
  }

  process.exit(1);
}

main();
