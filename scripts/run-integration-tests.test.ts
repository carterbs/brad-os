import { describe, expect, it } from 'vitest';
import { accessSync, constants, readFileSync } from 'fs';
import { resolve } from 'path';

const SCRIPT_PATH = resolve(__dirname, 'run-integration-tests.sh');
const WRAPPER_PATH = resolve(__dirname, 'brad-run-integration-tests');

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

  it('should delegate to Rust wrapper', () => {
    const content = readFileSync(SCRIPT_PATH, 'utf-8');
    expect(content).toContain('brad-run-integration-tests');
  });
});

describe('brad-run-integration-tests', () => {
  it('should exist', () => {
    expect(() => accessSync(WRAPPER_PATH, constants.F_OK)).not.toThrow();
  });

  it('should be executable', () => {
    expect(() => accessSync(WRAPPER_PATH, constants.X_OK)).not.toThrow();
  });
});
