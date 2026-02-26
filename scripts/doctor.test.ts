import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SCRIPT = path.resolve('scripts/doctor.sh');
const ROOT = path.resolve('.');

beforeAll(() => {
  execSync(
    `cargo build --manifest-path ${path.join(ROOT, 'tools/dev-cli/Cargo.toml')} --target-dir ${path.join(ROOT, 'target')} --release --bin brad-doctor -q`,
    { stdio: 'pipe' },
  );
});

const TOOL_VERSIONS: Record<string, string> = {
  node: 'v22.12.0',
  npm: '10.12.0',
  firebase: '13.15.0',
  cargo: '1.75.0',
  gitleaks: '8.23.0',
  xcodegen: '2.40.0',
};

function makeFakeTool(binDir: string, name: string, version: string): void {
  const binary = path.join(binDir, name);
  fs.writeFileSync(
    binary,
    [
      '#!/usr/bin/env sh',
      'if [ "$1" = "--version" ] || [ "$1" = "-v" ]; then',
      `  echo "${version}"`,
      'fi',
      '',
    ].join('\n'),
  );
  fs.chmodSync(binary, 0o755);
}

function createDoctorRepo(overrides: {
  includeTools?: string[];
  hooksPath?: string | null;
  nodeModules?: boolean;
} = {}): { cwd: string; cleanup: () => void; binDir: string } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'brad-os-doctor-'));
  const binDir = path.join(cwd, 'bin');
  const includeTools = overrides.includeTools ?? Object.keys(TOOL_VERSIONS);
  const hooksPath = overrides.hooksPath;
  const nodeModules = overrides.nodeModules ?? true;

  fs.mkdirSync(binDir, { recursive: true });

  for (const name of Object.keys(TOOL_VERSIONS)) {
    if (includeTools.includes(name)) {
      makeFakeTool(binDir, name, TOOL_VERSIONS[name]);
    }
  }

  execSync('git init -q', { cwd });
  if (hooksPath === null) {
    execSync('git config --unset core.hooksPath', { cwd });
  } else if (hooksPath !== undefined) {
    execSync(`git config core.hooksPath ${hooksPath}`, { cwd });
  } else {
    execSync('git config core.hooksPath hooks', { cwd });
  }

  if (nodeModules) {
    fs.mkdirSync(path.join(cwd, 'node_modules'), { recursive: true });
  }

  return {
    cwd,
    binDir,
    cleanup() {
      fs.rmSync(cwd, { recursive: true, force: true });
    },
  };
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

function runDoctor({
  cwd,
  binDir,
  fastMode,
  extraEnv,
}: {
  cwd: string;
  binDir: string;
  fastMode: boolean;
  extraEnv?: Record<string, string>;
}): { stdout: string; exitCode: number } {
  const env = {
    ...process.env,
    BRAD_DOCTOR_FAST: fastMode ? '1' : '0',
    PATH: `${binDir}:${process.env.PATH}`,
    ...extraEnv,
  };

  try {
    const stdout = execSync(`bash ${SCRIPT}`, {
      cwd,
      env,
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return { stdout: stripAnsi(stdout), exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; status?: number };
    return {
      stdout: stripAnsi(e.stdout ?? ''),
      exitCode: e.status ?? 1,
    };
  }
}

describe('scripts/doctor.sh', () => {
  it('exits 0 when all tools are present', () => {
    const fixture = createDoctorRepo();
    try {
      const { stdout, exitCode } = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: false,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('PASS');
      expect(stdout).toContain('All dependencies satisfied.');
    } finally {
      fixture.cleanup();
    }
  });

  it('reports all expected tool and setup labels', () => {
    const fixture = createDoctorRepo();
    try {
      const { stdout, exitCode } = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: true,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain('node');
      expect(stdout).toContain('npm');
      expect(stdout).toContain('firebase');
      expect(stdout).toContain('cargo');
      expect(stdout).toContain('gitleaks');
      expect(stdout).toContain('xcodegen');
      expect(stdout).toContain('git hooks');
      expect(stdout).toContain('node_modules');
      expect(stdout).toContain('All dependencies satisfied.');
    } finally {
      fixture.cleanup();
    }
  });

  it('supports fast and non-fast output detail text', () => {
    const fixture = createDoctorRepo();
    try {
      const fast = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: true,
      });
      const slow = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: false,
      });

      expect(fast.exitCode).toBe(0);
      expect(slow.exitCode).toBe(0);
      expect(fast.stdout).toContain('installed (fast)');
      expect(slow.stdout).toContain('v22.12.0 (≥ 22)');
    } finally {
      fixture.cleanup();
    }
  });

  it('reports missing individual tool with focused remediation command', () => {
    const fixture = createDoctorRepo({
      includeTools: ['node', 'npm', 'firebase', 'cargo', 'xcodegen'],
    });
    try {
      const { stdout, exitCode } = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: true,
        extraEnv: {
          PATH: `${fixture.binDir}:/usr/bin:/bin`,
        },
      });

      expect(exitCode).toBe(1);
      expect(stdout).toContain('FAIL');
      expect(stdout).toContain('brew install gitleaks');
      expect(stdout).not.toContain('brew install xcodegen');
    } finally {
      fixture.cleanup();
    }
  });

  it('flags outdated node versions', () => {
    const fixture = createDoctorRepo({ includeTools: Object.keys(TOOL_VERSIONS) });
    const oldNode = path.join(fixture.binDir, 'node');
    fs.writeFileSync(
      oldNode,
      ['#!/usr/bin/env sh', 'if [ "$1" = "--version" ] || [ "$1" = "-v" ]; then', '  echo "v21.4.0"', 'fi', ''].join('\n'),
    );
    fs.chmodSync(oldNode, 0o755);

    try {
      const { stdout, exitCode } = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: false,
      });

      expect(exitCode).toBe(1);
      expect(stdout).toContain('v21.4.0 (need ≥ 22)');
    } finally {
      fixture.cleanup();
    }
  });

  it('detects hook-path drift', () => {
    const fixture = createDoctorRepo({ hooksPath: '.hooks' });
    try {
      const { stdout, exitCode } = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: true,
      });

      expect(exitCode).toBe(1);
      expect(stripAnsi(stdout)).toContain('git hooks');
      expect(stdout).toContain("not configured (got: '.hooks')");
    } finally {
      fixture.cleanup();
    }
  });

  it('detects missing node_modules', () => {
    const fixture = createDoctorRepo({ nodeModules: false });
    try {
      const { stdout, exitCode } = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: true,
      });

      expect(exitCode).toBe(1);
      expect(stripAnsi(stdout)).toContain('node_modules');
      expect(stdout).toContain('missing');
    } finally {
      fixture.cleanup();
    }
  });

  it('supports setup drift simulation for hooks and node_modules at once', () => {
    const fixture = createDoctorRepo({ hooksPath: '.githooks', nodeModules: false });
    try {
      const { stdout, exitCode } = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: false,
      });

      expect(exitCode).toBe(1);
      expect(stdout).toContain("not configured (got: '.githooks')");
      expect(stdout).toContain('missing');
      expect(stdout).toContain('Install missing dependencies:');
    } finally {
      fixture.cleanup();
    }
  });
});


describe('non-tool checks', () => {
  it('returns FAIL when fake PATH hides fake tools', () => {
    const fixture = createDoctorRepo({ includeTools: Object.keys(TOOL_VERSIONS) });
    try {
      const { stdout, exitCode } = runDoctor({
        cwd: fixture.cwd,
        binDir: fixture.binDir,
        fastMode: true,
        extraEnv: { PATH: '/usr/bin:/bin' },
      });

      expect(exitCode).toBe(1);
      expect(stdout).toContain('FAIL');
    } finally {
      fixture.cleanup();
    }
  });
});
