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

  it('should delegate lifecycle cleanup to the Rust runner', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('brad-run-integration-tests');
  });

  it('should move readiness wait into the Rust binary', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).not.toContain('wait-for-emulator.sh');
  });

  it('should delegate service startup to the Rust binary', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('exec "$binary" "$@"');
    expect(content).toContain('run_rust_integration_tests');
    expect(content).not.toContain('firebase emulators:start');
    expect(content).not.toContain('--import');
    expect(content).not.toContain('--export-on-exit');
  });

  it('should always let Cargo verify that the exact binary is current', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('cargo build');
    expect(content).toContain('-p dev-cli');
    expect(content).toContain('--release');
    expect(content).toContain('--bin brad-run-integration-tests');
    expect(content).not.toContain('find ');
    expect(content).not.toContain('-newer');
  });

  it('should preserve the test exit code', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('exec "$binary" "$@"');
  });
});
