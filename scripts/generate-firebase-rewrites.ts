#!/usr/bin/env tsx

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ENDPOINT_MANIFEST } from '../packages/functions/src/endpoint-manifest.js';
import {
  compareRewrites,
  generateRewrites,
  type FirebaseRewrite,
} from './rewrite-utils.js';

interface FirebaseConfig {
  hosting?: {
    rewrites?: FirebaseRewrite[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function parseFirebaseRewrites(firebaseConfig: FirebaseConfig): FirebaseRewrite[] {
  const hosting = firebaseConfig.hosting;
  if (!hosting || !Array.isArray(hosting.rewrites)) {
    return [];
  }

  return hosting.rewrites.filter(
    (rewrite): rewrite is FirebaseRewrite =>
      typeof (rewrite as Record<string, unknown>).source === 'string' &&
      typeof (rewrite as Record<string, unknown>).function === 'string'
  );
}

function writeFirebaseConfig(firebasePath: string, payload: FirebaseConfig): void {
  fs.writeFileSync(firebasePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function main(): number {
  const rootDir = path.resolve(import.meta.dirname ?? __dirname, '..');
  const firebasePath = path.join(rootDir, 'firebase.json');
  const isCheck = process.argv.includes('--check');
  const expected = generateRewrites(ENDPOINT_MANIFEST);

  const current = JSON.parse(fs.readFileSync(firebasePath, 'utf-8')) as FirebaseConfig;
  const currentRewrites = parseFirebaseRewrites(current);
  const violations = compareRewrites(expected, currentRewrites);

  if (isCheck) {
    if (violations.length === 0) {
      console.log('✓ firebase.json rewrites already match manifest.');
      return 0;
    }

    console.log('✗ firebase.json rewrites differ from manifest:');
    for (const violation of violations) {
      console.log(`  - ${violation}`);
    }
    return 1;
  }

  current.hosting ??= {};
  current.hosting.rewrites = expected;
  writeFirebaseConfig(firebasePath, current);
  console.log(`✓ Generated ${expected.length} rewrites in firebase.json`);
  return 0;
}

process.exit(main());
