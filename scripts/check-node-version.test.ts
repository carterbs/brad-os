import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const scriptPath = path.resolve(__dirname, 'check-node-version.js');

describe('check-node-version', () => {
  it('script file exists and is valid JavaScript', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);

    const content = fs.readFileSync(scriptPath, 'utf8');
    const sanitized = content.replace(/^#!.*\n/, '');
    expect(() => new Function(sanitized)).not.toThrow();
  });

  it('succeeds on the current Node version (which should match .nvmrc)', () => {
    const nvmrcPath = path.resolve(__dirname, '..', '.nvmrc');
    const expectedMajor = parseInt(fs.readFileSync(nvmrcPath, 'utf8').trim(), 10);
    const actualMajor = parseInt(process.versions.node.split('.')[0], 10);

    if (actualMajor === expectedMajor) {
      const result = execFileSync('node', [scriptPath], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      expect(result).toBe('');
    } else {
      try {
        execFileSync('node', [scriptPath], {
          encoding: 'utf8',
          stdio: 'pipe',
        });
        expect.unreachable('Expected node version check to fail on mismatch');
      } catch (error) {
        const message = (error as { stderr?: string; message?: string }).stderr?.toString();
        expect((error as Error).message).toContain('Command failed');
        expect(message).toContain('ERROR: Node');
      }
    }
  });

  it('reads expected major version from .nvmrc', () => {
    const nvmrcPath = path.resolve(__dirname, '..', '.nvmrc');
    const content = fs.readFileSync(nvmrcPath, 'utf8').trim();

    expect(parseInt(content, 10)).toBe(22);
  });
});
