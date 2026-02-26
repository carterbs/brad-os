import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SCRIPT = path.resolve('scripts/doctor.sh');
const ROOT = path.resolve('.');

const DEFAULT_TOOLS = {
  node: 'v22.12.0',
  npm: '10.0.0',
  firebase: '13.29.1',
  gitleaks: '3.0.0',
  xcodegen: '0.38.0',
};

type ToolMap = Record<string, string | null>;

function runDoctor(
  envOverrides: Record<string, string> = {},
  cwd = ROOT,
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`bash ${SCRIPT}`, {
      cwd,
      env: { ...process.env, BRAD_DOCTOR_FAST: '1', ...envOverrides },
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

function createFakeCommand(directory: string, name: string, output: string): void {
  const commandPath = path.join(directory, name);
  const body = `#!/usr/bin/env sh\nprintf '%s\\n' "${output.replace(/"/g, '\\"')}"\n`;
  fs.writeFileSync(commandPath, body, { encoding: 'utf-8' });
  fs.chmodSync(commandPath, 0o755);
}

function createFakeGit(directory: string, hooksPath: string): void {
  const commandPath = path.join(directory, 'git');
  const body = `#!/usr/bin/env sh\nif [ "$1" = \"config\" ] && [ "$2" = \"core.hooksPath\" ]; then\n  printf '%s\\n' \"${hooksPath.replace(/"/g, '\\"')}\"\n  exit 0\nfi\nexit 1\n`;
  fs.writeFileSync(commandPath, body, { encoding: 'utf-8' });
  fs.chmodSync(commandPath, 0o755);
}

function createToolFixture(overrides: ToolMap, hooksPath: string): { root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brad-os-doctor-'));
  const tools = { ...DEFAULT_TOOLS, ...overrides };

  for (const [name, output] of Object.entries(tools)) {
    if (output === null) {
      continue;
    }
    createFakeCommand(root, name, output);
  }

  createFakeGit(root, hooksPath);

  return { root };
}

function fixturePathOnly(roots: string): string {
  return `${roots}:/bin`;
}

let cachedHealthyRun: { stdout: string; exitCode: number } | null = null;
let cachedMissingToolsRun: { stdout: string; exitCode: number } | null = null;
let cachedOutdatedRun: { stdout: string; exitCode: number } | null = null;

function getHealthyRun(): { stdout: string; exitCode: number } {
  if (cachedHealthyRun === null) {
    cachedHealthyRun = runDoctor({ PATH: `${getHealthyCommandDir()}:${process.env.PATH ?? ''}` });
  }

  return cachedHealthyRun;
}

function getMissingToolsRun(): { stdout: string; exitCode: number } {
  if (cachedMissingToolsRun === null) {
    const fixture = createToolFixture({ firebase: null }, 'hooks');
    cachedMissingToolsRun = runDoctor({ PATH: fixturePathOnly(fixture.root) }, ROOT);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }

  return cachedMissingToolsRun;
}

function getOutdatedRun(): { stdout: string; exitCode: number } {
  if (cachedOutdatedRun === null) {
    const fixture = createToolFixture({ node: 'v21.0.0' }, 'hooks');
    cachedOutdatedRun = runDoctor(
      {
        BRAD_DOCTOR_FAST: '0',
        PATH: fixturePathOnly(fixture.root),
      },
      ROOT,
    );
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }

  return cachedOutdatedRun;
}

describe('scripts/doctor.sh', () => {
  it('exits 0 when all tools are present', () => {
    const { stdout, exitCode } = getHealthyRun();
    expect(exitCode).toBe(0);
    expect(stdout).toContain('PASS');
    expect(stdout).toContain('All dependencies satisfied.');
  });

  it('reports node version', () => {
    const { stdout } = getHealthyRun();
    expect(stdout).toContain('✓ node');
    expect(stdout).toContain('installed (fast)');
  });

  it('reports all expected tool names', () => {
    const { stdout } = getHealthyRun();
    expect(stdout).toContain('node');
    expect(stdout).toContain('npm');
    expect(stdout).toContain('firebase');
    expect(stdout).toContain('cargo');
    expect(stdout).toContain('gitleaks');
    expect(stdout).toContain('xcodegen');
    expect(stdout).toContain('git hooks');
    expect(stdout).toContain('node_modules');
  });

  it('exits 1 when a tool is missing', () => {
    const { stdout, exitCode } = getMissingToolsRun();
    expect(exitCode).toBe(1);
    expect(stdout).toContain('FAIL');
  });

  it('prints install commands when tools are missing', () => {
    const { stdout } = getMissingToolsRun();
    expect(stdout).toContain('npm install -g firebase-tools');
    expect(stdout).not.toContain('brew install gitleaks');
    expect(stdout).not.toContain('brew install xcodegen');
  });

  it('detects missing node_modules', () => {
    const fixture = createToolFixture({}, 'hooks');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brad-os-doctor-node-modules-'));
    const { stdout, exitCode } = runDoctor(
      { PATH: fixturePathOnly(fixture.root) },
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toContain('✗ node_modules');
    expect(stdout).toContain('missing');

    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('exits 1 when required tool has outdated major version', () => {
    const { stdout, exitCode } = getOutdatedRun();
    expect(exitCode).toBe(1);
    expect(stdout).toContain('✗ node');
    expect(stdout).toContain('v21.0.0 (need ≥ 22)');
  });

  it('flags setup drift when git hooks are not configured', () => {
    const fixture = createToolFixture({}, 'custom/hooks');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brad-os-doctor-misconfig-'));

    const { stdout, exitCode } = runDoctor(
      {
        PATH: fixturePathOnly(fixture.root),
      },
      tempDir,
    );

    expect(exitCode).toBe(1);
    expect(stdout).toContain('✗ git hooks');
    expect(stdout).toContain("not configured (got: 'custom/hooks')");
    expect(stdout).toContain('missing');

    fs.rmSync(fixture.root, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
