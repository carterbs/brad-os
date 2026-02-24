#!/usr/bin/env tsx
/**
 * Detects duplicate type/interface definitions across packages/functions/src/.
 * Types should be consolidated in packages/functions/src/types/ and imported via shared.ts.
 *
 * Exit 0 if no duplicates, exit 1 if duplicates found.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_DIR = path.resolve(__dirname, '../packages/functions/src');

/** Recursively collect .ts files, excluding tests and node_modules. */
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

/** Check if a line is a re-export (e.g., `export { Foo } from './bar'` or `export * from`) */
function isReExport(line: string): boolean {
  return /export\s+\{[^}]*\}\s+from\s+/.test(line) || /export\s+\*\s+from\s+/.test(line);
}

interface TypeLocation {
  file: string;
  line: number;
}

const typeMap = new Map<string, TypeLocation[]>();

// Patterns for type/interface declarations (not re-exports)
const interfacePattern = /^export\s+interface\s+(\w+)/;
const typeAliasPattern = /^export\s+type\s+(\w+)\s*=/;

const files = collectTsFiles(SRC_DIR);

for (const filePath of files) {
  const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Skip re-exports in barrel/index files
    if (isReExport(line)) continue;

    let match = interfacePattern.exec(line) ?? typeAliasPattern.exec(line);
    if (match) {
      const typeName = match[1]!;
      const locations = typeMap.get(typeName) ?? [];
      locations.push({ file: relativePath, line: i + 1 });
      typeMap.set(typeName, locations);
    }
  }
}

// Find duplicates (type name appearing in more than one file)
let hasDuplicates = false;

const sortedEntries = [...typeMap.entries()].sort(([a], [b]) => a.localeCompare(b));

for (const [typeName, locations] of sortedEntries) {
  // Deduplicate by file (a type declared once per file is fine)
  const uniqueFiles = new Map<string, number>();
  for (const loc of locations) {
    if (!uniqueFiles.has(loc.file)) {
      uniqueFiles.set(loc.file, loc.line);
    }
  }

  if (uniqueFiles.size > 1) {
    hasDuplicates = true;
    console.log(`DUPLICATE: Type '${typeName}' defined in multiple files:`);
    for (const [file, line] of uniqueFiles) {
      console.log(`  - ${file}:${line}`);
    }
    console.log(`  Consolidate into packages/functions/src/types/ and import from shared.ts\n`);
  }
}

if (!hasDuplicates) {
  console.log('No duplicate type definitions found.');
}

process.exit(hasDuplicates ? 1 : 0);
