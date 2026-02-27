#!/usr/bin/env tsx
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveConfig } from './config.js';
import { syncTaskFilesFromLog } from './backlog.js';

export function runSyncBacklog(): void {
  const config = resolveConfig();
  const result = syncTaskFilesFromLog(config.logFile);

  console.log(`Merged tasks seen: ${result.mergedTasksSeen}`);
  console.log(`Removed tasks   : ${result.removedFromBacklog.length}`);

  for (const task of result.removedFromBacklog) {
    console.log(`  backlog: ${task}`);
  }
}

const modulePath = fileURLToPath(import.meta.url);
const entrypointPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (modulePath === entrypointPath) {
  runSyncBacklog();
}

export function main(): void {
  runSyncBacklog();
}
