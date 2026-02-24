#!/usr/bin/env tsx
/**
 * Unified Architecture Enforcement Linter
 *
 * Runs all architectural checks in sequence and reports a combined result.
 *
 * Checks:
 *   1. Layer dependency direction (types -> schemas -> repos -> services -> handlers)
 *   2. Schema-at-boundary (write routes must have Zod validation)
 *   3. Type deduplication (no duplicate type/interface definitions)
 *   4. Firebase route consistency (rewrite paths match stripPathPrefix)
 *   5. iOS architecture layers (Views->Services, Components->ViewModels)
 *   6. Architecture map file references (docs/architecture/*.md paths exist on disk)
 *   7. CLAUDE.md file path references (backtick-quoted paths resolve)
 *   8. Orphan features (handlers with routes have architecture docs)
 *
 * Exits 0 only if ALL checks pass. Exits 1 if any fail.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname ?? __dirname, '..');
const FUNCTIONS_SRC = path.join(ROOT_DIR, 'packages/functions/src');

// ── Color helpers ────────────────────────────────────────────────────────────

const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

interface CheckResult {
  name: string;
  passed: boolean;
  violations: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 1: Layer Dependency Direction
// ─────────────────────────────────────────────────────────────────────────────

function checkLayerDeps(): CheckResult {
  const name = 'Layer dependencies';
  const SRC_DIR = FUNCTIONS_SRC;

  if (!fs.existsSync(SRC_DIR)) {
    return { name, passed: false, violations: [`Source directory not found: ${SRC_DIR}`] };
  }

  const ALLOWED_IMPORTS: Record<string, Set<string>> = {
    types: new Set<string>(),
    schemas: new Set(['types']),
    repositories: new Set(['types', 'schemas']),
    services: new Set(['types', 'schemas', 'repositories']),
    handlers: new Set(['types', 'schemas', 'repositories', 'services', 'middleware']),
    middleware: new Set(['types', 'schemas']),
  };

  const SKIP_DIRS = new Set(['__tests__', 'test-utils', 'node_modules']);
  const UNCHECKED_LAYERS = new Set(['routes', 'scripts', 'prompts']);

  function getLayer(filePath: string): string | null {
    const rel = path.relative(SRC_DIR, filePath);
    const parts = rel.split(path.sep);
    if (parts.length === 1) return null;
    const dir = parts[0];
    if (dir === undefined) return null;
    if (UNCHECKED_LAYERS.has(dir)) return null;
    if (SKIP_DIRS.has(dir)) return null;
    if (dir in ALLOWED_IMPORTS) return dir;
    return null;
  }

  function isTestFile(filePath: string): boolean {
    const base = path.basename(filePath);
    return base.endsWith('.test.ts') || base.endsWith('.spec.ts') || base.includes('__tests__');
  }

  function collectFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        results.push(...collectFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !isTestFile(fullPath)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  function parseImports(filePath: string): string[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports: string[] = [];
    const importRegex = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const specifier = match[1];
      if (specifier !== undefined) imports.push(specifier);
    }
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const specifier = match[1];
      if (specifier !== undefined) imports.push(specifier);
    }
    return imports;
  }

  function resolveImportLayer(importSpecifier: string, sourceFile: string): string | null {
    if (!importSpecifier.startsWith('.')) return null;
    const sourceDir = path.dirname(sourceFile);
    let resolved = path.resolve(sourceDir, importSpecifier);
    if (resolved.endsWith('.js')) resolved = resolved.slice(0, -3);
    if (!resolved.startsWith(SRC_DIR)) return null;
    const rel = path.relative(SRC_DIR, resolved);
    const parts = rel.split(path.sep);
    if (parts.length === 1) return null;
    const dir = parts[0];
    if (dir === undefined) return null;
    if (dir in ALLOWED_IMPORTS) return dir;
    return null;
  }

  const files = collectFiles(SRC_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const layer = getLayer(file);
    if (layer === null) continue;
    const allowed = ALLOWED_IMPORTS[layer];
    if (allowed === undefined) continue;
    const imports = parseImports(file);
    for (const spec of imports) {
      const importedLayer = resolveImportLayer(spec, file);
      if (importedLayer === null) continue;
      if (importedLayer === layer) continue;
      if (!allowed.has(importedLayer)) {
        const relFile = path.relative(process.cwd(), file);
        const allowedList = [...allowed].join(', ') || '(none)';
        violations.push(
          `${relFile} (layer: ${layer}) imports from ${spec} (layer: ${importedLayer}). ${layer} must not depend on ${importedLayer}.\n` +
          `    Rule: Dependencies flow types -> schemas -> repositories -> services -> handlers. A ${layer} file may only import from: [${allowedList}].\n` +
          `    Fix: 1. Move the needed type/function to a layer that ${layer} is allowed to import (e.g. packages/functions/src/types/).\n` +
          `         2. Update the import in ${relFile} to point to the new location.\n` +
          `         3. Delete the old definition if nothing else uses it.\n` +
          `    Example: packages/functions/src/services/workout.service.ts correctly imports from types/ and repositories/, never from handlers/.\n` +
          `    See: docs/conventions/typescript.md`
        );
      }
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 2: Schema-at-Boundary
// ─────────────────────────────────────────────────────────────────────────────

function checkSchemaBoundary(): CheckResult {
  const name = 'Schema-at-boundary';
  const HANDLERS_DIR = path.join(FUNCTIONS_SRC, 'handlers');

  if (!fs.existsSync(HANDLERS_DIR)) {
    return { name, passed: false, violations: [`Handlers directory not found: ${HANDLERS_DIR}`] };
  }

  const ACTION_SUFFIXES = [
    '/start', '/complete', '/skip', '/cancel', '/unlog',
    '/remove', '/finalize', '/add', '/sync', '/generate',
    '/backfill-streams',
  ];

  function isActionRoute(routePath: string): boolean {
    return ACTION_SUFFIXES.some((suffix) => routePath.endsWith(suffix));
  }

  const files = fs.readdirSync(HANDLERS_DIR);
  const handlerFiles = files.filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts')
  );

  const violations: string[] = [];

  for (const file of handlerFiles) {
    const fullPath = path.join(HANDLERS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const relPath = path.relative(process.cwd(), fullPath);

    const routeRegex = /app\.(post|put|patch)\(\s*\n?\s*['"`]([^'"`]+)['"`]/g;
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
      if (isActionRoute(route.routePath)) continue;

      const nextRoute = routes[i + 1];
      const endIndex = nextRoute !== undefined ? nextRoute.index : content.length;
      const routeBlock = content.slice(route.index, endIndex);

      const hasValidateMiddleware = /validate\s*\(/.test(routeBlock);
      const hasSafeParse = /\.safeParse\s*\(/.test(routeBlock);
      const hasCreateResourceRouter = /createResourceRouter/.test(content);

      if (!hasValidateMiddleware && !hasSafeParse && !hasCreateResourceRouter) {
        const schemaDir = 'packages/functions/src/schemas/';
        violations.push(
          `${relPath} has a ${route.method} route at '${route.routePath}' without Zod validation.\n` +
          `    Rule: Every POST/PUT/PATCH handler must validate its request body with a Zod schema at the boundary.\n` +
          `    Fix: 1. Create or find a Zod schema in ${schemaDir} (e.g. ${schemaDir}<resource>.schema.ts).\n` +
          `         2. Import { validate } from '../middleware/validate.js' in the handler.\n` +
          `         3. Add validate(yourSchema) as middleware: app.${route.method.toLowerCase()}('${route.routePath}', validate(yourSchema), asyncHandler(...)).\n` +
          `    Example:\n` +
          `         // packages/functions/src/schemas/exercise.schema.ts\n` +
          `         export const createExerciseSchema = z.object({\n` +
          `           name: z.string().min(1).max(100),\n` +
          `           weightIncrement: z.number().positive().default(5),\n` +
          `         });\n` +
          `         // packages/functions/src/handlers/exercises.ts\n` +
          `         app.post('/exercises', validate(createExerciseSchema), asyncHandler(...));\n` +
          `    See: docs/conventions/api-patterns.md`
        );
      }
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 3: Type Deduplication
// ─────────────────────────────────────────────────────────────────────────────

function checkTypeDedup(): CheckResult {
  const name = 'Type deduplication';
  const SRC_DIR = FUNCTIONS_SRC;

  if (!fs.existsSync(SRC_DIR)) {
    return { name, passed: false, violations: [`Source directory not found: ${SRC_DIR}`] };
  }

  function collectTsFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        results.push(...collectTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  function isReExport(line: string): boolean {
    return /export\s+\{[^}]*\}\s+from\s+/.test(line) || /export\s+\*\s+from\s+/.test(line);
  }

  interface TypeLocation {
    file: string;
    line: number;
  }

  const typeMap = new Map<string, TypeLocation[]>();
  const interfacePattern = /^export\s+interface\s+(\w+)/;
  const typeAliasPattern = /^export\s+type\s+(\w+)\s*=/;

  const files = collectTsFiles(SRC_DIR);

  for (const filePath of files) {
    const relativePath = path.relative(ROOT_DIR, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (isReExport(line)) continue;
      const match = interfacePattern.exec(line) ?? typeAliasPattern.exec(line);
      if (match) {
        const typeName = match[1]!;
        const locations = typeMap.get(typeName) ?? [];
        locations.push({ file: relativePath, line: i + 1 });
        typeMap.set(typeName, locations);
      }
    }
  }

  const violations: string[] = [];
  const sortedEntries = [...typeMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [typeName, locations] of sortedEntries) {
    const uniqueFiles = new Map<string, number>();
    for (const loc of locations) {
      if (!uniqueFiles.has(loc.file)) {
        uniqueFiles.set(loc.file, loc.line);
      }
    }

    if (uniqueFiles.size > 1) {
      const filesList = [...uniqueFiles.entries()];
      const typesFile = filesList.find(([f]) => f.includes('packages/functions/src/types/'));
      const canonicalFile = typesFile ? typesFile[0] : 'packages/functions/src/types/<resource>.ts';
      let msg = `Type '${typeName}' defined in multiple files:`;
      for (const [file, line] of uniqueFiles) {
        msg += `\n    ${file}:${line}`;
      }
      msg += `\n    Rule: Each type/interface must be defined exactly once, in packages/functions/src/types/.`;
      msg += `\n    Fix: 1. Keep the definition in ${canonicalFile} (the canonical location).`;
      msg += `\n         2. Delete the duplicate definition(s) from the other file(s).`;
      msg += `\n         3. Update imports in consuming files to use: import { ${typeName} } from '../shared.js'`;
      msg += `\n    Example: packages/functions/src/types/meditation.ts is the single source of truth for MeditationSessionRecord.`;
      msg += `\n    See: docs/conventions/typescript.md#type-deduplication`;
      violations.push(msg);
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 4: Firebase Route Consistency
// ─────────────────────────────────────────────────────────────────────────────

function checkFirebaseRoutes(): CheckResult {
  const name = 'Firebase route consistency';
  const FIREBASE_JSON = path.join(ROOT_DIR, 'firebase.json');
  const HANDLERS_DIR = path.join(FUNCTIONS_SRC, 'handlers');
  const INDEX_TS = path.join(FUNCTIONS_SRC, 'index.ts');

  if (!fs.existsSync(FIREBASE_JSON)) {
    return { name, passed: false, violations: [`firebase.json not found at ${FIREBASE_JSON}`] };
  }
  if (!fs.existsSync(INDEX_TS)) {
    return { name, passed: false, violations: [`index.ts not found at ${INDEX_TS}`] };
  }

  // Step 1: Read firebase.json rewrites
  const firebaseConfig = JSON.parse(fs.readFileSync(FIREBASE_JSON, 'utf-8'));
  const rewrites: { source: string; function: string }[] =
    (firebaseConfig.hosting?.rewrites ?? []).filter(
      (r: Record<string, unknown>) => 'function' in r
    );

  const rewriteByFunction = new Map<string, string>();
  for (const r of rewrites) {
    const existing = rewriteByFunction.get(r.function);
    if (!existing || r.source.endsWith('/**')) {
      rewriteByFunction.set(r.function, r.source);
    }
  }

  // Step 2: Parse index.ts
  const indexContent = fs.readFileSync(INDEX_TS, 'utf-8');

  const importPattern = /import\s+\{\s*(\w+)\s*\}\s+from\s+'\.\/handlers\/([\w-]+)\.js'/g;
  const appToHandler = new Map<string, string>();
  let importMatch: RegExpExecArray | null;
  while ((importMatch = importPattern.exec(indexContent)) !== null) {
    appToHandler.set(importMatch[1]!, importMatch[2]!);
  }

  const registerPattern = /const\s+\{\s*dev:\s*(\w+),\s*prod:\s*(\w+)\s*\}\s*=\s*register\((\w+)/g;
  const functionToApp = new Map<string, string>();
  let registerMatch: RegExpExecArray | null;
  while ((registerMatch = registerPattern.exec(indexContent)) !== null) {
    functionToApp.set(registerMatch[1]!, registerMatch[3]!);
    functionToApp.set(registerMatch[2]!, registerMatch[3]!);
  }

  const standalonePattern = /export\s+const\s+(\w+)\s*=\s*onRequest\(\w+,\s*(\w+)\)/g;
  let standaloneMatch: RegExpExecArray | null;
  while ((standaloneMatch = standalonePattern.exec(indexContent)) !== null) {
    functionToApp.set(standaloneMatch[1]!, standaloneMatch[2]!);
  }

  // Step 3: Check handler stripPathPrefix
  function getStripPrefixArg(handlerFile: string): string | null {
    const filePath = path.join(HANDLERS_DIR, `${handlerFile}.ts`);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');

    const createBaseAppMatch = /createBaseApp\(\s*'([^']+)'\s*\)/.exec(content);
    if (createBaseAppMatch) return createBaseAppMatch[1]!;

    const createResourceRouterMatch = /createResourceRouter\(\s*\{[^}]*resourceName:\s*'([^']+)'/.exec(content);
    if (createResourceRouterMatch) return createResourceRouterMatch[1]!;

    const stripMatch = /stripPathPrefix\(\s*'([^']+)'\s*\)/.exec(content);
    if (stripMatch) return stripMatch[1]!;

    return null;
  }

  function extractResourceFromSource(source: string): string {
    const cleanPath = source.replace(/\/\*+$/, '');
    const segments = cleanPath.split('/');
    return segments[segments.length - 1]!;
  }

  // Step 4: Compare
  const violations: string[] = [];
  const devRewrites = [...rewriteByFunction.entries()].filter(([funcName]) =>
    funcName.startsWith('dev')
  );

  for (const [funcName, source] of devRewrites) {
    const appName = functionToApp.get(funcName);
    if (!appName) continue;

    const handlerFile = appToHandler.get(appName);
    if (!handlerFile) continue;

    const stripPrefixArg = getStripPrefixArg(handlerFile);
    if (stripPrefixArg === null) continue;

    const expectedResource = extractResourceFromSource(source);

    if (stripPrefixArg !== expectedResource) {
      violations.push(
        `firebase.json rewrite '${source}' -> function '${funcName}' but handler uses stripPathPrefix('${stripPrefixArg}'). Expected stripPathPrefix('${expectedResource}').\n` +
        `    Rule: The stripPathPrefix (or createBaseApp) argument must match the last path segment of the firebase.json rewrite source.\n` +
        `    Fix: 1. Open packages/functions/src/handlers/${handlerFile}.ts.\n` +
        `         2. Change stripPathPrefix('${stripPrefixArg}') to stripPathPrefix('${expectedResource}'), or change createBaseApp('${stripPrefixArg}') to createBaseApp('${expectedResource}').\n` +
        `         3. Alternatively, update the firebase.json rewrite source path to end with /${stripPrefixArg}/** if that was the intended resource name.\n` +
        `    Example: If firebase.json has '/api/dev/stretch-sessions/**', the handler must use createBaseApp('stretch-sessions').\n` +
        `    See: docs/guides/debugging-cloud-functions.md#ordered-checklist`
      );
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 5: iOS Architecture Layers (ported from lint-ios-layers.sh)
//
// Rule 1: Views/ must not directly reference Service class/actor types
//         (Views should access services through ViewModels)
// Rule 2: Components/ must not reference ViewModel class types
//         (Components should receive data via parameters)
// ─────────────────────────────────────────────────────────────────────────────

function checkIosLayers(): CheckResult {
  const name = 'iOS architecture layers';
  const IOS_APP = path.join(ROOT_DIR, 'ios/BradOS/BradOS');
  const SERVICES_DIR = path.join(IOS_APP, 'Services');
  const VIEWMODELS_DIR = path.join(IOS_APP, 'ViewModels');
  const VIEWS_DIR = path.join(IOS_APP, 'Views');
  const COMPONENTS_DIR = path.join(IOS_APP, 'Components');

  const violations: string[] = [];

  // Collect Swift files recursively
  function collectSwiftFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectSwiftFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.swift')) {
        results.push(fullPath);
      }
    }
    return results.sort();
  }

  // Discover class/actor names from a directory (only class/actor, not struct/enum)
  function discoverClassTypes(dir: string, includeActors: boolean): string[] {
    if (!fs.existsSync(dir)) return [];
    const types: Set<string> = new Set();
    const pattern = includeActors
      ? /^\s*(?:final\s+)?(?:class|actor)\s+(\w+)/
      : /^\s*(?:final\s+)?class\s+(\w+)/;

    // Only check top-level Swift files (like the bash script does with *.swift)
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.swift'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      for (const line of content.split('\n')) {
        const match = pattern.exec(line);
        if (match?.[1]) {
          types.add(match[1]);
        }
      }
    }
    return [...types].sort();
  }

  // Find the first #Preview or PreviewProvider line number (1-indexed), 0 if none
  function firstPreviewLine(content: string): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^#Preview|_Previews:/.test(lines[i]!)) {
        return i + 1;
      }
    }
    return 0;
  }

  // Check if a line is comment-only
  function isCommentLine(line: string): boolean {
    return /^\s*\/\//.test(line);
  }

  // Strip trailing comment from a line
  function stripTrailingComment(line: string): string {
    return line.replace(/\s\/\/.*$/, '');
  }

  // Discover types
  const serviceTypes = discoverClassTypes(SERVICES_DIR, true);
  const vmTypes = discoverClassTypes(VIEWMODELS_DIR, false);

  // Rule 1: Views/ must not directly reference Service types
  if (fs.existsSync(VIEWS_DIR) && serviceTypes.length > 0) {
    const viewFiles = collectSwiftFiles(VIEWS_DIR);

    for (const viewFile of viewFiles) {
      const content = fs.readFileSync(viewFile, 'utf-8');
      const lines = content.split('\n');
      const previewStart = firstPreviewLine(content);

      for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const line = lines[i]!;

        // Skip lines in preview section
        if (previewStart > 0 && lineNum >= previewStart) continue;

        // Skip comment-only lines
        if (isCommentLine(line)) continue;

        const codePart = stripTrailingComment(line);

        for (const stype of serviceTypes) {
          // Check if the type name appears as a whole word in the code part
          const typeRegex = new RegExp(`\\b${stype}\\b`);
          if (!typeRegex.test(codePart)) continue;

          // Skip if part of a Mock type name (e.g., MockSomeService)
          const mockRegex = new RegExp(`Mock${stype}`);
          if (mockRegex.test(codePart)) {
            // Check if the type only appears as part of Mock references
            const cleaned = codePart.replace(/Mock\w+/g, '');
            if (!typeRegex.test(cleaned)) continue;
          }

          const relPath = path.relative(ROOT_DIR, viewFile);
          violations.push(
            `${relPath}:${lineNum} references ${stype} (a Service type). Views must not depend on Services directly.\n` +
            `    Rule: Views/ -> ViewModels/ -> Services/. Views access data through ViewModels, never by importing Service types.\n` +
            `    Fix: 1. Create or find a ViewModel in ios/BradOS/BradOS/ViewModels/ that wraps ${stype}.\n` +
            `         2. Move the ${stype} usage from the View into that ViewModel.\n` +
            `         3. Have the View observe the ViewModel via @StateObject or @ObservedObject instead.\n` +
            `    Example: ios/BradOS/BradOS/ViewModels/CyclingViewModel.swift wraps CyclingCoachClient so Views never reference it.\n` +
            `    See: docs/conventions/ios-swift.md`
          );
        }
      }
    }
  }

  // Rule 2: Components/ must not reference ViewModel types
  if (fs.existsSync(COMPONENTS_DIR) && vmTypes.length > 0) {
    const compFiles = collectSwiftFiles(COMPONENTS_DIR);

    for (const compFile of compFiles) {
      const content = fs.readFileSync(compFile, 'utf-8');
      const lines = content.split('\n');
      const previewStart = firstPreviewLine(content);

      for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const line = lines[i]!;

        if (previewStart > 0 && lineNum >= previewStart) continue;
        if (isCommentLine(line)) continue;

        const codePart = stripTrailingComment(line);

        for (const vtype of vmTypes) {
          const typeRegex = new RegExp(`\\b${vtype}\\b`);
          if (!typeRegex.test(codePart)) continue;

          const relPath = path.relative(ROOT_DIR, compFile);
          violations.push(
            `${relPath}:${lineNum} references ${vtype} (a ViewModel type). Components must not depend on ViewModels.\n` +
            `    Rule: Components/ are reusable UI pieces that receive data via parameters (plain types, closures). They never import or reference ViewModel classes.\n` +
            `    Fix: 1. Replace the ${vtype} reference with a plain parameter (e.g. a struct, array, or closure).\n` +
            `         2. Have the parent View that owns ${vtype} extract the needed data and pass it as a parameter.\n` +
            `         3. If the Component needs to trigger actions, pass a closure parameter instead of the whole ViewModel.\n` +
            `    Example: Components/LoadStateView.swift accepts generic content closures instead of referencing any ViewModel directly.\n` +
            `    See: docs/conventions/ios-swift.md`
          );
        }
      }
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 6: Architecture Map File References
//
// Parses file paths from docs/architecture/*.md and verifies they exist on disk.
// ─────────────────────────────────────────────────────────────────────────────

function checkArchMapRefs(): CheckResult {
  const name = 'Architecture map file references';
  const ARCH_DIR = path.join(ROOT_DIR, 'docs/architecture');

  if (!fs.existsSync(ARCH_DIR)) {
    return { name, passed: true, violations: [] };
  }

  const archFiles = fs.readdirSync(ARCH_DIR).filter((f) => f.endsWith('.md'));
  const violations: string[] = [];

  // Match backtick-quoted file paths that look like project-relative paths
  // e.g. `packages/functions/src/handlers/exercises.ts` or `ios/BradOS/BradOS/Views/Lifting/MesoView.swift`
  const pathPattern = /`((?:packages|ios|scripts|docs|thoughts)\/[^`\s]+\.\w+)`/g;

  for (const archFile of archFiles) {
    const filePath = path.join(ARCH_DIR, archFile);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      let match: RegExpExecArray | null;
      const linePattern = new RegExp(pathPattern.source, pathPattern.flags);

      while ((match = linePattern.exec(line)) !== null) {
        const refPath = match[1]!;
        const fullPath = path.join(ROOT_DIR, refPath);

        if (!fs.existsSync(fullPath)) {
          violations.push(
            `docs/architecture/${archFile}:${i + 1} references \`${refPath}\` but file does not exist.\n` +
            `    Rule: All backtick-quoted file paths in architecture docs must resolve to real files on disk.\n` +
            `    Fix: 1. If the file was renamed or moved, update the path in docs/architecture/${archFile}.\n` +
            `         2. If the file was deleted, remove the reference from the doc.\n` +
            `         3. Run \`git log --diff-filter=R -- '${refPath}'\` to find renames.\n` +
            `    See: docs/golden-principles.md`
          );
        }
      }
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 7: CLAUDE.md File Path References
//
// Verifies backtick-quoted file/directory paths in CLAUDE.md resolve to real
// files or directories on disk.
// ─────────────────────────────────────────────────────────────────────────────

function checkClaudeMdRefs(): CheckResult {
  const name = 'CLAUDE.md file path references';
  const CLAUDE_MD = path.join(ROOT_DIR, 'CLAUDE.md');

  if (!fs.existsSync(CLAUDE_MD)) {
    return { name, passed: true, violations: [] };
  }

  const content = fs.readFileSync(CLAUDE_MD, 'utf-8');
  const lines = content.split('\n');
  const violations: string[] = [];

  // Match backtick-quoted paths that look like project-relative references
  // Includes both files (with extensions) and directories
  const pathPattern = /`((?:packages|ios|scripts|docs|thoughts|hooks)\/[^`\s]+)`/g;

  // Track whether we're inside a code fence
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Toggle code fence state
    if (/^```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    // Skip lines inside code fences (example code, not real references)
    if (inCodeFence) continue;

    let match: RegExpExecArray | null;
    const linePattern = new RegExp(pathPattern.source, pathPattern.flags);

    while ((match = linePattern.exec(line)) !== null) {
      const refPath = match[1]!;

      // Skip paths with template variables like <feature>
      if (/<\w+>/.test(refPath)) continue;

      // Skip wildcard patterns like *.test.ts
      if (/\*/.test(refPath)) continue;

      const fullPath = path.join(ROOT_DIR, refPath);

      if (!fs.existsSync(fullPath)) {
        violations.push(
          `CLAUDE.md:${i + 1} references \`${refPath}\` but the path does not exist.\n` +
          `    Rule: All backtick-quoted file paths in CLAUDE.md must resolve to real files or directories on disk.\n` +
          `    Fix: 1. If the file was renamed or moved, update the path in CLAUDE.md.\n` +
          `         2. If the file was deleted intentionally, remove the reference.\n` +
          `         3. Run \`git log --diff-filter=R -- '${refPath}'\` to find renames.\n` +
          `    See: docs/golden-principles.md`
        );
      }
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 8: Orphan Features (handlers with routes but no architecture doc)
//
// Every handler file that defines Express routes should have a corresponding
// architecture document in docs/architecture/.
// ─────────────────────────────────────────────────────────────────────────────

function checkOrphanFeatures(): CheckResult {
  const name = 'Orphan features';
  const HANDLERS_DIR = path.join(FUNCTIONS_SRC, 'handlers');
  const ARCH_DIR = path.join(ROOT_DIR, 'docs/architecture');

  if (!fs.existsSync(HANDLERS_DIR)) {
    return { name, passed: true, violations: [] };
  }

  // Collect existing architecture doc names (without .md)
  const archDocs = new Set<string>();
  if (fs.existsSync(ARCH_DIR)) {
    for (const f of fs.readdirSync(ARCH_DIR)) {
      if (f.endsWith('.md')) {
        archDocs.add(f.replace('.md', ''));
      }
    }
  }

  // Map handler filenames to the architecture doc names that cover them.
  // Some handlers are grouped under a single feature doc.
  const handlerToFeature: Record<string, string> = {
    'exercises': 'lifting',
    'plans': 'lifting',
    'mesocycles': 'lifting',
    'workouts': 'lifting',
    'workoutSets': 'lifting',
    'stretches': 'stretching',
    'stretchSessions': 'stretching',
    'meditationSessions': 'meditation',
    'guidedMeditations': 'meditation',
    'tts': 'meditation',
    'health-sync': 'health',
    'health': 'health',
    'calendar': 'calendar',
    'today-coach': 'today',
    'cycling': 'cycling',
    'cycling-coach': 'cycling',
    'strava-webhook': 'cycling',
    'mealplans': 'meal-planning',
    'meals': 'meal-planning',
    'recipes': 'meal-planning',
    'ingredients': 'meal-planning',
    'barcodes': 'meal-planning',
    'mealplan-debug': 'meal-planning',
  };

  const violations: string[] = [];
  const handlerFiles = fs.readdirSync(HANDLERS_DIR).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts')
  );

  for (const file of handlerFiles) {
    const handlerName = file.replace('.ts', '');
    const content = fs.readFileSync(path.join(HANDLERS_DIR, file), 'utf-8');

    // Only check handlers that define Express routes
    const hasRoutes = /app\.(get|post|put|patch|delete)\s*\(/.test(content);
    if (!hasRoutes) continue;

    const featureName = handlerToFeature[handlerName];

    if (featureName === undefined) {
      violations.push(
        `packages/functions/src/handlers/${file} defines routes but has no entry in the handler-to-feature map.\n` +
        `    Rule: Every handler with Express routes must map to a feature and have an architecture doc.\n` +
        `    Fix: 1. Add '${handlerName}': '<feature>' to handlerToFeature in scripts/lint-architecture.ts (checkOrphanFeatures).\n` +
        `         2. Create docs/architecture/<feature>.md using the template below.\n` +
        `    Example template for docs/architecture/<feature>.md:\n` +
        `         # <Feature> Architecture\n` +
        `         ## Data Flow\n` +
        `         handler -> service -> repository -> Firestore\n` +
        `         ## Key Files\n` +
        `         - \`packages/functions/src/handlers/${file}\`\n` +
        `         - \`packages/functions/src/services/<feature>.service.ts\`\n` +
        `         - \`packages/functions/src/types/<feature>.ts\`\n` +
        `    See: docs/golden-principles.md`
      );
    } else if (!archDocs.has(featureName)) {
      violations.push(
        `packages/functions/src/handlers/${file} maps to feature '${featureName}' but docs/architecture/${featureName}.md does not exist.\n` +
        `    Rule: Every feature with handlers must have an architecture doc in docs/architecture/.\n` +
        `    Fix: 1. Create docs/architecture/${featureName}.md.\n` +
        `         2. Use docs/architecture/lifting.md as a template for structure.\n` +
        `    Example template for docs/architecture/${featureName}.md:\n` +
        `         # ${featureName.charAt(0).toUpperCase() + featureName.slice(1)} Architecture\n` +
        `         ## Data Flow\n` +
        `         handler -> service -> repository -> Firestore\n` +
        `         ## Key Files\n` +
        `         - \`packages/functions/src/handlers/${file}\`\n` +
        `         - \`packages/functions/src/services/${featureName}.service.ts\`\n` +
        `         - \`packages/functions/src/types/${featureName}.ts\`\n` +
        `    See: docs/golden-principles.md`
      );
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 9: Plan Lifecycle (plans must be in active/ or completed/)
//
// Prevents plans from being dumped directly in thoughts/shared/plans/.
// Only index.md is allowed at the root level.
// ─────────────────────────────────────────────────────────────────────────────

function checkPlanLifecycle(): CheckResult {
  const name = 'Plan lifecycle';
  const PLANS_DIR = path.join(ROOT_DIR, 'thoughts/shared/plans');

  if (!fs.existsSync(PLANS_DIR)) {
    return { name, passed: true, violations: [] };
  }

  const violations: string[] = [];
  const ALLOWED_ROOT_FILES = new Set(['index.md']);

  const entries = fs.readdirSync(PLANS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md') && !ALLOWED_ROOT_FILES.has(entry.name)) {
      violations.push(
        `thoughts/shared/plans/${entry.name} is a plan file in the root directory.\n` +
        `    Rule: Plans must live in thoughts/shared/plans/active/ or thoughts/shared/plans/completed/, not the root.\n` +
        `    Fix: Move the file to the appropriate subdirectory:\n` +
        `         git mv thoughts/shared/plans/${entry.name} thoughts/shared/plans/active/${entry.name}   # if in progress\n` +
        `         git mv thoughts/shared/plans/${entry.name} thoughts/shared/plans/completed/${entry.name} # if shipped\n` +
        `    Then update thoughts/shared/plans/index.md with a summary row.`
      );
    }
  }

  return { name, passed: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(bold('\n=== Architecture Enforcement ===\n'));

  const checks: Array<() => CheckResult> = [
    checkLayerDeps,
    checkSchemaBoundary,
    checkTypeDedup,
    checkFirebaseRoutes,
    checkIosLayers,
    checkArchMapRefs,
    checkClaudeMdRefs,
    checkOrphanFeatures,
    checkPlanLifecycle,
  ];

  const results: CheckResult[] = [];

  for (const check of checks) {
    const result = check();
    results.push(result);

    if (result.passed) {
      console.log(`${green('\u2713')} ${result.name}: ${green('clean')}`);
    } else {
      console.log(`${red('\u2717')} ${result.name}: ${red(`${result.violations.length} violation(s)`)}`);
      console.log();
      for (const v of result.violations) {
        console.log(`  ${dim(v)}`);
      }
      console.log();
    }
  }

  // Summary
  const failed = results.filter((r) => !r.passed);
  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);

  console.log(bold('\n--- Summary ---'));

  if (failed.length === 0) {
    console.log(green(`\nAll ${results.length}/${results.length} checks passed.\n`));
    process.exit(0);
  } else {
    console.log(
      red(`\n${failed.length}/${results.length} check(s) failed with ${totalViolations} total violation(s).\n`)
    );
    process.exit(1);
  }
}

main();
