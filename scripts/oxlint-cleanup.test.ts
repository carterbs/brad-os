import childProcess from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { beforeEach } from 'vitest';
import {
  buildOxlintArgs,
  getCleanupProfiles,
  main,
  parseArgs,
  runProfile,
} from './oxlint-cleanup';

function buildSpawnResult(status: number): childProcess.SpawnSyncReturns<Buffer> {
  return {
    status,
    signal: null,
    output: [],
    pid: 0,
    stdout: null,
    stderr: null,
  };
}

describe('scripts/oxlint-cleanup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    it('parses list command', () => {
      expect(parseArgs(['list'])).toEqual({ command: 'list', dryRun: false });
    });

    it('parses run task command', () => {
      expect(parseArgs(['run', 'unsafe-type-assertion:repositories'])).toEqual({
        command: 'run',
        target: 'unsafe-type-assertion:repositories',
        dryRun: false,
      });
    });

    it('parses run all command', () => {
      expect(parseArgs(['run', 'all'])).toEqual({
        command: 'run',
        target: 'all',
        dryRun: false,
      });
    });

    it('parses dry-run flag', () => {
      expect(parseArgs(['--dry-run', 'run', 'all'])).toEqual({
        command: 'run',
        target: 'all',
        dryRun: true,
      });
    });
  });

  it('prints all cleanup profiles for list command', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = main(['list']);

    expect(result).toBe(0);
    const lines = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    for (const profile of getCleanupProfiles()) {
      expect(lines).toContain(profile.id);
    }
  });

  it('builds Oxlint arguments with shared base flags and scoped paths', () => {
    const profile = getCleanupProfiles()[2];
    const args = buildOxlintArgs(profile);

    expect(args).toEqual([
      '--config',
      '.oxlintrc.json',
      '--type-aware',
      '-A',
      'all',
      '-D',
      'typescript/no-unnecessary-type-assertion',
      'packages/functions/src/services/training-load.service.test.ts',
    ]);
  });

  it('prints available task IDs on unknown task lookup', () => {
    const spawnSpy = vi.spyOn(childProcess, 'spawnSync');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = main(['run', 'not-a-task']);

    expect(result).toBe(1);
    expect(spawnSpy).not.toHaveBeenCalled();
    const lines = [
      ...errorSpy.mock.calls,
      ...logSpy.mock.calls,
    ]
      .map((call) => String(call[0]))
      .join('\n');
    expect(lines).toContain('Unknown cleanup task: not-a-task');
    expect(lines).toContain('unsafe-type-assertion:repositories');
    expect(lines).toContain('base-to-string:health-sync');
  });

  it('runs all profiles and returns non-zero if any profile fails', () => {
    const spawnSpy = vi
      .spyOn(childProcess, 'spawnSync')
      .mockImplementation(() => buildSpawnResult(0));
    const exitCodes = [0, 0, 1, 0];

    let callIndex = 0;
    spawnSpy.mockImplementation(() => {
      const status = exitCodes[callIndex] ?? 0;
      callIndex += 1;
      return buildSpawnResult(status);
    });

    const result = main(['run', 'all']);

    expect(result).toBe(1);
    expect(spawnSpy).toHaveBeenCalledTimes(4);
    expect(spawnSpy.mock.calls[0]?.[0]).toBe('oxlint');
    expect(spawnSpy.mock.calls[1]?.[0]).toBe('oxlint');
    expect(spawnSpy.mock.calls[2]?.[0]).toBe('oxlint');
    expect(spawnSpy.mock.calls[3]?.[0]).toBe('oxlint');
  });

  it('emits dry-run command output without executing', () => {
    const spawnSpy = vi.spyOn(childProcess, 'spawnSync');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const profile = getCleanupProfiles()[0];
    const result = runProfile(profile, true);

    expect(result).toBe(0);
    expect(spawnSpy).not.toHaveBeenCalled();
    const lines = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(lines).toContain('oxlint --config .oxlintrc.json --type-aware -A all -D typescript/no-unsafe-type-assertion packages/functions/src/repositories');
  });
});
