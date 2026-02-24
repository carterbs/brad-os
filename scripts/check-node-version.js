#!/usr/bin/env node

// Fail fast if Node major version doesn't match .nvmrc.
// Runs as a preinstall hook — no dependencies available, pure Node only.

const fs = require('fs');
const path = require('path');

const nvmrcPath = path.join(__dirname, '..', '.nvmrc');
const expectedMajor = parseInt(fs.readFileSync(nvmrcPath, 'utf8').trim(), 10);
const actualMajor = parseInt(process.versions.node.split('.')[0], 10);

if (actualMajor !== expectedMajor) {
  console.error('');
  console.error(`ERROR: Node ${expectedMajor} is required, but you're running Node ${process.versions.node}.`);
  console.error('');
  console.error('Fix with:');
  console.error(`  nvm install ${expectedMajor} && nvm use ${expectedMajor}`);
  console.error(`  # or: brew install node@${expectedMajor}`);
  console.error('');
  process.exit(1);
}
