#!/usr/bin/env tsx
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveConfig } from './config.js';
import { syncTaskFilesFromLog } from './backlog.js';

export function runSyncBacklog(): void {
  const config = resolveConfig();
  const result = syncTaskFilesFromLog(config.logFile);
  const removedCount =
    result.removedFromBacklog.length + result.removedFromTriage.length;

  console.log(`Merged tasks seen: ${result.mergedTasksSeen}`);
  console.log(`Removed tasks   : ${removedCount}`);
  console.log(`  - backlog     : ${result.removedFromBacklog.length}`);
  console.log(`  - triage      : ${result.removedFromTriage.length}`);

  for (const task of result.removedFromBacklog) {
    console.log(`  backlog: ${task}`);
  }
  for (const task of result.removedFromTriage) {
    console.log(`  triage: ${task}`);
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
