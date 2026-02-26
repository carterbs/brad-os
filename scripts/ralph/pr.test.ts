import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensurePullRequestMergeable,
  listOpenRalphPullRequests,
  mergePullRequest,
  pushBranch,
  readPullRequestMergeState,
} from './pr.js';

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

describe('ensurePullRequestMergeable', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns true when PR is already mergeable', async () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          number: 20,
          mergeable: 'MERGEABLE',
          mergeStateStatus: 'CLEAN',
        });
      }
      return '';
    });

    expect(
      ensurePullRequestMergeable('/tmp/wt', 'change-065', 20)
    ).toBe(true);
  });

  it('merges origin/main into branch when PR is conflicting', async () => {
    let viewCalls = 0;
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        viewCalls += 1;
        return JSON.stringify(
          viewCalls === 1
            ? {
                number: 20,
                mergeable: 'CONFLICTING',
                mergeStateStatus: 'DIRTY',
              }
            : {
                number: 20,
                mergeable: 'MERGEABLE',
                mergeStateStatus: 'CLEAN',
              }
        );
      }
      return '';
    });

    expect(
      ensurePullRequestMergeable('/tmp/wt', 'change-065', 20)
    ).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['fetch', 'origin', 'main'],
      expect.any(Object)
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['checkout', 'change-065'],
      expect.any(Object)
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['merge', 'origin/main', '--no-edit'],
      expect.any(Object)
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['push', 'origin', 'change-065'],
      expect.any(Object)
    );
  });

  it('returns false when merge-from-main fails', async () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          number: 20,
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
        });
      }
      if (args[0] === 'merge' && args[1] === 'origin/main') {
        throw new Error('conflict');
      }
      return '';
    });

    expect(
      ensurePullRequestMergeable('/tmp/wt', 'change-065', 20)
    ).toBe(false);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['merge', '--abort'],
      expect.any(Object)
    );
  });
});

describe('listOpenRalphPullRequests', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('filters open PRs by Ralph branch prefix', async () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        return JSON.stringify([
          {
            number: 19,
            url: 'https://github.com/carterbs/brad-os/pull/19',
            headRefName: 'change-067',
          },
          {
            number: 88,
            url: 'https://github.com/carterbs/brad-os/pull/88',
            headRefName: 'feature/other',
          },
        ]);
      }
      return '';
    });

    expect(listOpenRalphPullRequests('/repo', 'change')).toEqual([
      {
        number: 19,
        url: 'https://github.com/carterbs/brad-os/pull/19',
        headRefName: 'change-067',
      },
    ]);
  });
});

describe('mergePullRequest', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns true only when PR is confirmed merged', async () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          number: 20,
          state: 'CLOSED',
          mergedAt: '2026-02-26T11:00:00Z',
        });
      }
      return '';
    });

    expect(mergePullRequest('/repo', 20)).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['pr', 'merge', '20', '--squash', '--delete-branch'],
      expect.any(Object)
    );
  });

  it('returns false when PR remains open after merge command', async () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          number: 20,
          state: 'OPEN',
          mergedAt: null,
        });
      }
      return '';
    });

    expect(mergePullRequest('/repo', 20)).toBe(false);
  });

});

describe('pushBranch', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns true on initial push success', async () => {
    mockExecFileSync.mockReturnValue('');
    expect(pushBranch('/repo', 'change-066')).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['push', '--set-upstream', 'origin', 'change-066'],
      expect.any(Object)
    );
  });

  it('returns false when push fails', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('push failed');
    });

    expect(pushBranch('/repo', 'change-066')).toBe(false);
  });
});

describe('readPullRequestMergeState', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns state and mergedAt from gh pr view', async () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          number: 21,
          state: 'MERGED',
          mergedAt: '2026-02-26T17:18:45Z',
        });
      }
      return '';
    });

    expect(readPullRequestMergeState('/repo', 21)).toEqual({
      state: 'MERGED',
      mergedAt: '2026-02-26T17:18:45Z',
    });
  });
});
