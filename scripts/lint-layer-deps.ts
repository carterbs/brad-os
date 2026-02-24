#!/usr/bin/env tsx
/**
 * Layer Dependency Linter
 *
 * Enforces one-way dependency flow between backend layers:
 *   types -> schemas -> repositories -> services -> handlers
 *
 * Middleware is cross-cutting: can import from types/schemas, can be imported by handlers.
 * Root-level src/ files (shared.ts, firebase.ts, index.ts) are ignored.
 * Files in routes/, scripts/, prompts/, __tests__/, and test files are excluded.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  '../packages/functions/src'
);

// Ordered layers (lower index = deeper layer, higher index = more superficial)
const LAYER_ORDER: Record<string, number> = {
  types: 0,
  schemas: 1,
  repositories: 2,
  services: 3,
  handlers: 4,
};

// What each layer is allowed to import (by layer name)
const ALLOWED_IMPORTS: Record<string, Set<string>> = {
  types: new Set<string>(),
  schemas: new Set(['types']),
  repositories: new Set(['types', 'schemas']),
  services: new Set(['types', 'schemas', 'repositories']),
  handlers: new Set(['types', 'schemas', 'repositories', 'services', 'middleware']),
  middleware: new Set(['types', 'schemas']),
};

// Directories to skip entirely
const SKIP_DIRS = new Set(['__tests__', 'test-utils', 'node_modules']);

// Directories whose files are not layer-checked (root scripts, routes, prompts, etc.)
const UNCHECKED_LAYERS = new Set(['routes', 'scripts', 'prompts']);

interface Violation {
  file: string;
  layer: string;
  importedFile: string;
  importedLayer: string;
}

function getLayer(filePath: string): string | null {
  const rel = path.relative(SRC_DIR, filePath);
  const parts = rel.split(path.sep);

  // Root-level files (e.g., shared.ts, firebase.ts, index.ts) are not checked
  if (parts.length === 1) return null;

  const dir = parts[0];
  if (dir === undefined) return null;

  if (UNCHECKED_LAYERS.has(dir)) return null;
  if (SKIP_DIRS.has(dir)) return null;

  // Return layer name if recognized
  if (dir in ALLOWED_IMPORTS) return dir;

  return null;
}

function isTestFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return (
    base.endsWith('.test.ts') ||
    base.endsWith('.spec.ts') ||
    base.includes('__tests__')
  );
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

/**
 * Parse import statements from a TypeScript file.
 * Returns an array of import specifiers (the string in `from '...'`).
 */
function parseImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports: string[] = [];

  // Match: import ... from '...'; and export ... from '...';
  const importRegex = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const specifier = match[1];
    if (specifier !== undefined) {
      imports.push(specifier);
    }
  }

  // Match: require('...')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    const specifier = match[1];
    if (specifier !== undefined) {
      imports.push(specifier);
    }
  }

  return imports;
}

/**
 * Resolve a relative import specifier to a layer.
 * Returns the layer name or null if it's an external package or root file.
 */
function resolveImportLayer(
  importSpecifier: string,
  sourceFile: string
): string | null {
  // Only check relative imports
  if (!importSpecifier.startsWith('.')) return null;

  // Resolve the import path relative to the source file
  const sourceDir = path.dirname(sourceFile);
  let resolved = path.resolve(sourceDir, importSpecifier);

  // Strip .js extension (TypeScript imports often use .js for ESM compat)
  if (resolved.endsWith('.js')) {
    resolved = resolved.slice(0, -3);
  }

  // Check if the resolved path is within src/
  if (!resolved.startsWith(SRC_DIR)) return null;

  const rel = path.relative(SRC_DIR, resolved);
  const parts = rel.split(path.sep);

  // Root-level imports (shared.ts, firebase.ts, index.ts) are always allowed
  if (parts.length === 1) return null;

  const dir = parts[0];
  if (dir === undefined) return null;

  // Return the layer if it's a recognized layer
  if (dir in ALLOWED_IMPORTS) return dir;

  return null;
}

function checkFile(filePath: string): Violation[] {
  const violations: Violation[] = [];

  const layer = getLayer(filePath);
  if (layer === null) return violations;

  const allowed = ALLOWED_IMPORTS[layer];
  if (allowed === undefined) return violations;

  const imports = parseImports(filePath);

  for (const spec of imports) {
    const importedLayer = resolveImportLayer(spec, filePath);
    if (importedLayer === null) continue;

    // Same-layer imports are always fine
    if (importedLayer === layer) continue;

    if (!allowed.has(importedLayer)) {
      violations.push({
        file: path.relative(process.cwd(), filePath),
        layer,
        importedFile: spec,
        importedLayer,
      });
    }
  }

  return violations;
}

function main(): void {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }

  const files = collectFiles(SRC_DIR);
  const allViolations: Violation[] = [];

  for (const file of files) {
    allViolations.push(...checkFile(file));
  }

  if (allViolations.length === 0) {
    console.log('No layer dependency violations found.');
    process.exit(0);
  }

  console.log(
    `Found ${allViolations.length} layer dependency violation(s):\n`
  );

  for (const v of allViolations) {
    console.log(
      `VIOLATION: ${v.file} (layer: ${v.layer}) imports from ${v.importedFile} (layer: ${v.importedLayer}). ${v.layer} must not depend on ${v.importedLayer}.`
    );
  }

  process.exit(1);
}

main();
