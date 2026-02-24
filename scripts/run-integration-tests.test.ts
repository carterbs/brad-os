import { describe, expect, it } from 'vitest';
import { accessSync, constants, readFileSync } from 'fs';
import { resolve } from 'path';

const SCRIPT_PATH = resolve(__dirname, 'run-integration-tests.sh');

describe('run-integration-tests.sh', () => {
  it('should exist', () => {
    expect(() => accessSync(SCRIPT_PATH, constants.F_OK)).not.toThrow();
  });

  it('should have a bash shebang', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content.startsWith('#!/bin/bash')).toBe(true);
  });

  it('should be executable', () => {
    expect(() => accessSync(SCRIPT_PATH, constants.X_OK)).not.toThrow();
  });

  it('should set up a cleanup trap on EXIT', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('trap cleanup EXIT');
  });

  it('should use wait-for-emulator.sh for readiness check', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('wait-for-emulator.sh');
  });

  it('should start emulators without --import (fresh database)', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    const emulatorStartLines = content
      .split('\n')
      .filter((line) => line.includes('firebase emulators:start'));

    for (const line of emulatorStartLines) {
      expect(line).not.toContain('--import');
      expect(line).not.toContain('--export-on-exit');
    }
  });

  it('should run npm run test:integration', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('npm run test:integration');
  });

  it('should preserve the test exit code', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('TEST_EXIT_CODE=$?');
    expect(content).toContain('exit $TEST_EXIT_CODE');
  });
});
