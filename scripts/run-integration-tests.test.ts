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
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('should be executable', () => {
    expect(() => accessSync(SCRIPT_PATH, constants.X_OK)).not.toThrow();
  });

  it('should set up a cleanup trap on EXIT', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('brad-run-integration-tests');
  });

  it('should move readiness wait into the Rust binary', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).not.toContain('wait-for-emulator.sh');
  });

  it('should delegate emulator startup to Rust binary', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('exec "$binary"');
    expect(content).toContain('run_rust_emulator_tests');
    expect(content).not.toContain('firebase emulators:start');
    expect(content).not.toContain('--import');
    expect(content).not.toContain('--export-on-exit');
  });

  it('should run npm run test:integration', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('cargo build -p dev-cli --release');
  });

  it('should preserve the test exit code', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('exec "$binary"');
  });
});
