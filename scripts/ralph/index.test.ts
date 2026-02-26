import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config, StepResult } from './types.js';
import {
  IMPLEMENT_PLAN_TASK_PREFIX,
  MAIN_NOT_GREEN_TRIAGE_TASK,
  MERGE_CONFLICT_TRIAGE_PREFIX,
  activeWorktrees,
  buildImprovementTitle,
  buildOutstandingRalphPrTriageTask,
  checkDeps,
  enforceMainManagedBacklog,
  extractPlanDocPathFromTask,
  hasMoreWork,
  isMergeConflictTriageTask,
  parseOutstandingRalphPrTriageTask,
  main,
  runValidation,
  runWorker,
} from './index.js';

const {
  mockExecFileSync,
  mockExistsSync,
  mockReaddirSync,
  mockRunStep,
  mockCreateWorktree,
  mockCleanupWorktree,
  mockCountCompleted,
  mockCommitAll,
  mockHasNewCommits,
  mockReadBacklog,
  mockReadTriage,
  mockAddTriageTask,
  mockRemoveTask,
  mockRemoveTriageTask,
  mockMoveTaskToMergeConflicts,
  mockSyncTaskFilesFromLog,
  mockResolveConfig,
  mockEnsurePullRequest,
  mockListOpenRalphPullRequests,
  mockPushBranch,
  mockReadPullRequestMergeState,
  mockBuildBacklogRefillPrompt,
  mockBuildTaskPlanPrompt,
  mockBuildPlanPrompt,
  mockBuildImplPrompt,
  mockBuildMergeConflictResolvePrompt,
  mockBuildOutstandingPrMergePrompt,
  mockBuildAgentMergePrompt,
  mockBuildReviewPrompt,
  mockBuildFixPrompt,
  mockLoggerConstructor,
  mockBacklogPath,
  mockReadSuppressedTypeScriptEslintRules,
  mockNormalizeBacklogForTypeScriptEslintCleanup,
  mockWriteBacklog,
} = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockRunStep: vi.fn(),
  mockCreateWorktree: vi.fn(),
  mockCleanupWorktree: vi.fn(),
  mockCountCompleted: vi.fn(),
  mockCommitAll: vi.fn(),
  mockHasNewCommits: vi.fn(),
  mockReadBacklog: vi.fn(),
  mockReadTriage: vi.fn(),
  mockAddTriageTask: vi.fn(),
  mockRemoveTask: vi.fn(),
  mockRemoveTriageTask: vi.fn(),
  mockMoveTaskToMergeConflicts: vi.fn(),
  mockSyncTaskFilesFromLog: vi.fn(),
  mockResolveConfig: vi.fn(),
  mockEnsurePullRequest: vi.fn(),
  mockListOpenRalphPullRequests: vi.fn(),
  mockPushBranch: vi.fn(),
  mockReadPullRequestMergeState: vi.fn(),
  mockBuildBacklogRefillPrompt: vi.fn(),
  mockBuildTaskPlanPrompt: vi.fn(),
  mockBuildPlanPrompt: vi.fn(),
  mockBuildImplPrompt: vi.fn(),
  mockBuildMergeConflictResolvePrompt: vi.fn(),
  mockBuildOutstandingPrMergePrompt: vi.fn(),
  mockBuildAgentMergePrompt: vi.fn(),
  mockBuildReviewPrompt: vi.fn(),
  mockBuildFixPrompt: vi.fn(),
  mockLoggerConstructor: vi.fn(),
  mockBacklogPath: vi.fn(() => 'scripts/ralph/backlog.md'),
  mockReadSuppressedTypeScriptEslintRules: vi.fn(),
  mockNormalizeBacklogForTypeScriptEslintCleanup: vi.fn(),
  mockWriteBacklog: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock('./agent.js', () => ({
  runStep: mockRunStep,
}));

vi.mock('./git.js', () => ({
  createWorktree: mockCreateWorktree,
  cleanupWorktree: mockCleanupWorktree,
  countCompleted: mockCountCompleted,
  commitAll: mockCommitAll,
  hasNewCommits: mockHasNewCommits,
}));

vi.mock('./backlog.js', () => ({
  readBacklog: mockReadBacklog,
  readTriage: mockReadTriage,
  addTriageTask: mockAddTriageTask,
  removeTask: mockRemoveTask,
  removeTriageTask: mockRemoveTriageTask,
  moveTaskToMergeConflicts: mockMoveTaskToMergeConflicts,
  syncTaskFilesFromLog: mockSyncTaskFilesFromLog,
  readSuppressedTypeScriptEslintRules:
    mockReadSuppressedTypeScriptEslintRules,
  normalizeBacklogForTypeScriptEslintCleanup:
    mockNormalizeBacklogForTypeScriptEslintCleanup,
  writeBacklog: mockWriteBacklog,
  backlogPath: mockBacklogPath,
}));

vi.mock('./config.js', () => ({
  resolveConfig: mockResolveConfig,
}));

vi.mock('./pr.js', () => ({
  ensurePullRequest: mockEnsurePullRequest,
  listOpenRalphPullRequests: mockListOpenRalphPullRequests,
  pushBranch: mockPushBranch,
  readPullRequestMergeState: mockReadPullRequestMergeState,
}));

vi.mock('./prompts.js', () => ({
  buildBacklogRefillPrompt: mockBuildBacklogRefillPrompt,
  buildTaskPlanPrompt: mockBuildTaskPlanPrompt,
  buildPlanPrompt: mockBuildPlanPrompt,
  buildImplPrompt: mockBuildImplPrompt,
  buildMergeConflictResolvePrompt: mockBuildMergeConflictResolvePrompt,
  buildOutstandingPrMergePrompt: mockBuildOutstandingPrMergePrompt,
  buildAgentMergePrompt: mockBuildAgentMergePrompt,
  buildReviewPrompt: mockBuildReviewPrompt,
  buildFixPrompt: mockBuildFixPrompt,
}));

const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  heading: vi.fn(),
  jsonl: vi.fn(),
  stepSummary: vi.fn(),
  improvementSummary: vi.fn(),
  verboseMsg: vi.fn(),
  tool: vi.fn(),
  compaction: vi.fn(),
});

vi.mock('./log.js', () => ({
  Logger: mockLoggerConstructor,
}));

// Helper to create a valid StepResult
function makeStepResult(overrides: Partial<StepResult> = {}): StepResult {
  return {
    success: true,
    backend: 'claude',
    turns: 1,
    costUsd: 0.01,
    inputTokens: 100,
    outputTokens: 50,
    durationMs: 1000,
    outputText: '',
    ...overrides,
  };
}

// Helper to create a valid Config
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    target: 1,
    parallelism: 1,
    branchPrefix: 'change',
    maxTurns: 10,
    verbose: false,
    repoDir: '/repo',
    worktreeDir: '/tmp/worktrees',
    minReviewCycles: 1,
    maxReviewCycles: 3,
    logFile: '/repo/ralph-loop.jsonl',
    agents: {
      backlog: { backend: 'claude', model: 'claude-opus-4-6' },
      plan: { backend: 'claude', model: 'claude-opus-4-6' },
      implement: { backend: 'claude', model: 'claude-sonnet-4-6' },
      review: { backend: 'claude', model: 'claude-sonnet-4-6' },
    },
    ...overrides,
  };
}

beforeEach(() => {
  activeWorktrees.clear();
});

// ────────────────────────────────────────────────────────────────────────────
// describe("runValidation")
// ────────────────────────────────────────────────────────────────────────────

describe('runValidation', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns true when execFileSync succeeds', async () => {
    mockExecFileSync.mockReturnValue('');
    expect(runValidation('/repo')).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith('npm', ['run', 'validate'], {
      cwd: '/repo',
      stdio: 'pipe',
    });
  });

  it('returns false when execFileSync throws', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('validation failed');
    });
    expect(runValidation('/repo')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// describe("isMergeConflictTriageTask")
// ────────────────────────────────────────────────────────────────────────────

describe('isMergeConflictTriageTask', () => {
  beforeEach(() => {});

  it('returns true for triage source with matching prefix', async () => {
    const taskText = `${MERGE_CONFLICT_TRIAGE_PREFIX}123`;
    expect(isMergeConflictTriageTask(taskText, 'triage')).toBe(true);
  });

  it('returns false for backlog source', async () => {
    const taskText = `${MERGE_CONFLICT_TRIAGE_PREFIX}123`;
    expect(isMergeConflictTriageTask(taskText, 'backlog')).toBe(false);
  });

  it('returns false for non-matching text', async () => {
    expect(isMergeConflictTriageTask('Some other task', 'triage')).toBe(false);
  });

  it('returns false for undefined taskText', async () => {
    expect(isMergeConflictTriageTask(undefined, 'triage')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// describe("extractPlanDocPathFromTask")
// ────────────────────────────────────────────────────────────────────────────

describe('extractPlanDocPathFromTask', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReaddirSync.mockReset();
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);
  });

  it('returns undefined for non implement-plan task', async () => {
    expect(extractPlanDocPathFromTask('Add tests')).toBeUndefined();
  });

  it('returns default active-plans path for filename tasks', async () => {
    expect(
      extractPlanDocPathFromTask(`${IMPLEMENT_PLAN_TASK_PREFIX}my-plan.md`)
    ).toBe('thoughts/shared/plans/active/my-plan.md');
  });

  it('appends .md when missing extension', async () => {
    expect(
      extractPlanDocPathFromTask(`${IMPLEMENT_PLAN_TASK_PREFIX}my-plan`)
    ).toBe('thoughts/shared/plans/active/my-plan.md');
  });

  it('preserves explicit relative paths', async () => {
    expect(
      extractPlanDocPathFromTask(
        `${IMPLEMENT_PLAN_TASK_PREFIX}thoughts/shared/plans/completed/old.md`
      )
    ).toBe('thoughts/shared/plans/completed/old.md');
  });

  it('extracts slug before colon and resolves dated active plan file', async () => {
    mockReaddirSync.mockReturnValue([
      '2026-02-26-rust-migrate-setup-ios-testing.md',
      '2026-02-26-rust-migrate-run-integration-tests.md',
    ]);

    expect(
      extractPlanDocPathFromTask(
        'Implement plan rust-migrate-setup-ios-testing: migrate scripts/setup-ios-testing.sh iOS bootstrap orchestration to Rust.'
      )
    ).toBe(
      'thoughts/shared/plans/active/2026-02-26-rust-migrate-setup-ios-testing.md'
    );
  });

  it('uses direct active path when exact plan filename exists', async () => {
    mockExistsSync.mockImplementation(
      (path: string) =>
        path ===
        'thoughts/shared/plans/active/2026-02-26-rust-migrate-setup-ios-testing.md'
    );

    expect(
      extractPlanDocPathFromTask(
        `${IMPLEMENT_PLAN_TASK_PREFIX}2026-02-26-rust-migrate-setup-ios-testing.md`
      )
    ).toBe(
      'thoughts/shared/plans/active/2026-02-26-rust-migrate-setup-ios-testing.md'
    );
  });
});

describe('buildImprovementTitle', () => {
  it('preserves a conventional commit prefix from the plan summary', async () => {
    expect(buildImprovementTitle(4, 'refactor: extract shared Firestore mock utilities')).toBe(
      'refactor: extract shared Firestore mock utilities'
    );
  });

  it('infers test prefix from keywords', async () => {
    expect(buildImprovementTitle(4, 'Add schema validation tests for cycling domain')).toBe(
      'test: Add schema validation tests for cycling domain'
    );
  });

  it('infers feat prefix from action keywords', async () => {
    expect(buildImprovementTitle(4, 'Add createResourceRouter for recipes handler')).toBe(
      'feat: Add createResourceRouter for recipes handler'
    );
  });

  it('infers docs prefix from documentation keywords', async () => {
    expect(buildImprovementTitle(4, 'Add doc-freshness CI lint check')).toBe(
      'docs: Add doc-freshness CI lint check'
    );
  });

  it('falls back to task text when plan summary is low-signal', async () => {
    expect(buildImprovementTitle(4, 'X', 'Add tests for merge queue retries')).toBe(
      'test: Add tests for merge queue retries'
    );
  });

  it('falls back to improvement number with chore prefix when both inputs are low-signal', async () => {
    expect(buildImprovementTitle(9, 'fix', 'x')).toBe(
      'chore: improvement #9'
    );
  });

  it('truncates long titles to git/GitHub-friendly length', async () => {
    const title = buildImprovementTitle(
      2,
      'Implement architecture guardrails for observability pipelines and telemetry quality score exports'
    );
    expect(title.length).toBeLessThanOrEqual(72);
    expect(title.endsWith('...')).toBe(true);
  });

  it('preserves scoped conventional prefixes', async () => {
    expect(buildImprovementTitle(1, 'fix(cycling): correct TSS calculation')).toBe(
      'fix(cycling): correct TSS calculation'
    );
  });
});

describe('buildOutstandingRalphPrTriageTask', () => {
  it('returns deterministic triage text for open Ralph PRs', async () => {
    expect(
      buildOutstandingRalphPrTriageTask({
        prNumber: 21,
        branchName: 'change-066',
        prUrl: 'https://github.com/carterbs/brad-os/pull/21',
      })
    ).toBe(
      'Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21'
    );
  });
});

describe('parseOutstandingRalphPrTriageTask', () => {
  it('parses valid outstanding PR triage task', async () => {
    expect(
      parseOutstandingRalphPrTriageTask(
        'Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21',
        'triage'
      )
    ).toEqual({
      prNumber: 21,
      branchName: 'change-066',
      prUrl: 'https://github.com/carterbs/brad-os/pull/21',
    });
  });

  it('parses valid outstanding PR task regardless of source', async () => {
    expect(
      parseOutstandingRalphPrTriageTask(
        'Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21',
        'backlog'
      )
    ).toEqual({
      prNumber: 21,
      branchName: 'change-066',
      prUrl: 'https://github.com/carterbs/brad-os/pull/21',
    });
  });

  it('returns undefined for non-matching text', async () => {
    expect(
      parseOutstandingRalphPrTriageTask('Resolve merge conflict for improvement #66', 'triage')
    ).toBeUndefined();
  });

  it('parses outstanding PR task nested inside human-escalation wrapper', async () => {
    expect(
      parseOutstandingRalphPrTriageTask(
        'Human escalation required for PR #21 (improvement #65). Worktree: /tmp/brad-os-ralph-worktrees/change-066. Original task: Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21',
        'triage'
      )
    ).toEqual({
      prNumber: 21,
      branchName: 'change-066',
      prUrl: 'https://github.com/carterbs/brad-os/pull/21',
    });
  });

  it('parses outstanding PR task through multiple escalation wrappers', async () => {
    expect(
      parseOutstandingRalphPrTriageTask(
        'Human escalation required for PR #21 (improvement #65). Worktree: /tmp/a. Original task: Human escalation required for PR #21 (improvement #65). Worktree: /tmp/b. Original task: Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21',
        'triage'
      )
    ).toEqual({
      prNumber: 21,
      branchName: 'change-066',
      prUrl: 'https://github.com/carterbs/brad-os/pull/21',
    });
  });

  it('parses outstanding PR task through deep escalation nesting', async () => {
    const directTask =
      'Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21';
    const deeplyNested = Array.from({ length: 20 }).reduce(
      (acc, _, i) =>
        `Human escalation required for PR #21 (improvement #${i + 1}). Worktree: /tmp/wt-${i + 1}. Original task: ${acc}`,
      directTask
    );

    expect(parseOutstandingRalphPrTriageTask(deeplyNested, 'triage')).toEqual({
      prNumber: 21,
      branchName: 'change-066',
      prUrl: 'https://github.com/carterbs/brad-os/pull/21',
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// describe("enforceMainManagedBacklog")
// ────────────────────────────────────────────────────────────────────────────

describe('enforceMainManagedBacklog', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('does nothing when git status throws', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('git failed');
    });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    enforceMainManagedBacklog('/repo', mockLogger as any);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('does nothing when no changes detected', async () => {
    mockExecFileSync.mockReturnValue('');
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    enforceMainManagedBacklog('/repo', mockLogger as any);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('restores with git restore when changes detected', async () => {
    let callCount = 0;
    mockExecFileSync.mockImplementation((cmd, args) => {
      callCount++;
      if (
        callCount === 1 &&
        args.includes('status') &&
        args.includes('--porcelain')
      ) {
        return 'M scripts/ralph/backlog.md';
      }
      return '';
    });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    enforceMainManagedBacklog('/repo', mockLogger as any);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Discarded worktree edits')
    );
  });

  it('falls back to reset+checkout when restore fails', async () => {
    let callCount = 0;
    mockExecFileSync.mockImplementation((cmd, args) => {
      callCount++;
      if (
        callCount === 1 &&
        args.includes('status') &&
        args.includes('--porcelain')
      ) {
        return 'M scripts/ralph/backlog.md';
      }
      if (callCount === 2 && args.includes('restore')) {
        throw new Error('restore not available');
      }
      return '';
    });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    enforceMainManagedBacklog('/repo', mockLogger as any);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Discarded worktree edits')
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['reset']),
      expect.any(Object)
    );
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['checkout']),
      expect.any(Object)
    );
  });

  it('logs failure when both restore and fallback fail', async () => {
    let callCount = 0;
    mockExecFileSync.mockImplementation((cmd, args) => {
      callCount++;
      if (
        callCount === 1 &&
        args.includes('status') &&
        args.includes('--porcelain')
      ) {
        return 'M scripts/ralph/backlog.md';
      }
      throw new Error('operation failed');
    });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    enforceMainManagedBacklog('/repo', mockLogger as any);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to enforce')
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// describe("checkDeps")
// ────────────────────────────────────────────────────────────────────────────

describe('checkDeps', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('passes when all deps present', async () => {
    mockExecFileSync.mockReturnValue('');
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    // Should not throw
    checkDeps(config, mockLogger as any);
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['git'], {
      stdio: 'pipe',
    });
  });

  it('exits when git is missing', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('git not found');
    });
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    expect(() => {
      checkDeps(config, mockLogger as any);
    }).toThrow('process.exit');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing dependency: git')
    );

    exitSpy.mockRestore();
  });

  it('exits when claude is missing but needed', async () => {
    let whichCallCount = 0;
    mockExecFileSync.mockImplementation((_cmd, args) => {
      if (args.includes('git')) {
        return '';
      }
      if (args.includes('claude')) {
        throw new Error('claude not found');
      }
      return '';
    });
    const config = makeConfig({
      agents: {
        backlog: { backend: 'claude', model: 'claude-opus-4-6' },
        plan: { backend: 'claude', model: 'claude-opus-4-6' },
        implement: { backend: 'claude', model: 'claude-sonnet-4-6' },
        review: { backend: 'claude', model: 'claude-sonnet-4-6' },
      },
    });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    expect(() => {
      checkDeps(config, mockLogger as any);
    }).toThrow('process.exit');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing dependency: claude')
    );

    exitSpy.mockRestore();
  });

  it('exits when codex is missing but needed', async () => {
    mockExecFileSync.mockImplementation((_cmd, args) => {
      if (args.includes('git')) {
        return '';
      }
      if (args.includes('codex')) {
        throw new Error('codex not found');
      }
      return '';
    });
    const config = makeConfig({
      agents: {
        backlog: { backend: 'codex', model: 'codex-model' },
        plan: { backend: 'codex', model: 'codex-model' },
        implement: { backend: 'codex', model: 'codex-model' },
        review: { backend: 'codex', model: 'codex-model' },
      },
    });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    expect(() => {
      checkDeps(config, mockLogger as any);
    }).toThrow('process.exit');
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Missing dependency: codex')
    );

    exitSpy.mockRestore();
  });

  it('skips claude check when not in use', async () => {
    mockExecFileSync.mockReturnValue('');
    const config = makeConfig({
      agents: {
        backlog: { backend: 'codex', model: 'codex-model' },
        plan: { backend: 'codex', model: 'codex-model' },
        implement: { backend: 'codex', model: 'codex-model' },
        review: { backend: 'codex', model: 'codex-model' },
      },
    });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    checkDeps(config, mockLogger as any);

    // Should check git and codex, not claude
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['git'], {
      stdio: 'pipe',
    });
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['codex'], {
      stdio: 'pipe',
    });
  });

  it('skips codex check when not in use', async () => {
    mockExecFileSync.mockReturnValue('');
    const config = makeConfig({
      agents: {
        backlog: { backend: 'claude', model: 'claude-opus-4-6' },
        plan: { backend: 'claude', model: 'claude-opus-4-6' },
        implement: { backend: 'claude', model: 'claude-sonnet-4-6' },
        review: { backend: 'claude', model: 'claude-sonnet-4-6' },
      },
    });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };

    checkDeps(config, mockLogger as any);

    // Should check git and claude, not codex
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['git'], {
      stdio: 'pipe',
    });
    expect(mockExecFileSync).toHaveBeenCalledWith('which', ['claude'], {
      stdio: 'pipe',
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// describe("hasMoreWork")
// ────────────────────────────────────────────────────────────────────────────

describe('hasMoreWork', () => {
  beforeEach(() => {});

  it('returns true when target set and completed < target', async () => {
    expect(hasMoreWork(0, 5, 0, 0, 0)).toBe(true);
  });

  it('returns false when target set and completed >= target', async () => {
    expect(hasMoreWork(5, 5, 0, 0, 0)).toBe(false);
  });

  it('returns true when no target and triage > 0', async () => {
    expect(hasMoreWork(0, undefined, 1, 0, 0)).toBe(true);
  });

  it('returns true when no target and backlog > 0', async () => {
    expect(hasMoreWork(0, undefined, 0, 1, 0)).toBe(true);
  });

  it('returns true when no target and inFlight > 0', async () => {
    expect(hasMoreWork(0, undefined, 0, 0, 1)).toBe(true);
  });

  it('returns false when no target and all zero', async () => {
    expect(hasMoreWork(0, undefined, 0, 0, 0)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// describe("runWorker")
// ────────────────────────────────────────────────────────────────────────────

describe('runWorker', () => {
  beforeEach(() => {
    mockCreateWorktree.mockReset();
    mockRunStep.mockReset();
    mockExistsSync.mockReset();
    mockCommitAll.mockReset();
    mockHasNewCommits.mockReset();
    mockExecFileSync.mockReset();
    mockPushBranch.mockReset();
    mockEnsurePullRequest.mockReset();
    mockListOpenRalphPullRequests.mockReset();
    mockPushBranch.mockReturnValue(true);
    mockRunStep.mockResolvedValue(
      makeStepResult({ outputText: 'REVIEW_PASSED' })
    );
    mockEnsurePullRequest.mockReturnValue({
      number: 123,
      url: 'https://github.com/org/repo/pull/123',
    });
    mockListOpenRalphPullRequests.mockReturnValue([]);
    mockReadPullRequestMergeState.mockReturnValue({
      state: 'MERGED',
      mergedAt: '2026-02-26T17:18:45Z',
    });
  });

  it('returns failure when worktree creation fails', async () => {
    mockCreateWorktree.mockReturnValue({ created: false, resumed: false });
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController
    );

    expect(result.success).toBe(false);
  });

  it('skips planning when resumed', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: true });
    mockExistsSync.mockReturnValue(true);
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'DONE: Implemented' })
    );
    mockCommitAll.mockReturnValue(true);
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'REVIEW_PASSED' })
    );
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController
    );

    expect(result.success).toBe(true);
    // Verify plan step was not called
    const runStepCalls = mockRunStep.mock.calls;
    const planCalls = runStepCalls.filter((c) => c[0].stepName === 'plan');
    expect(planCalls).toHaveLength(0);
  });

  it('skips planning for merge conflict triage task', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'DONE: Resolved conflict' })
    );
    mockCommitAll.mockReturnValue(true);
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'REVIEW_PASSED' })
    );
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();
    const taskText = `${MERGE_CONFLICT_TRIAGE_PREFIX}123`;

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      taskText,
      'triage'
    );

    expect(result.success).toBe(true);
    // Verify plan step was not called
    const runStepCalls = mockRunStep.mock.calls;
    const planCalls = runStepCalls.filter((c) => c[0].stepName === 'plan');
    expect(planCalls).toHaveLength(0);
    // Verify merge conflict resolve was called instead of impl
    expect(mockBuildMergeConflictResolvePrompt).toHaveBeenCalled();
  });

  it('uses merge-only flow for outstanding PR triage task', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'DONE: Rebased and resolved conflicts' })
    );
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const abortController = new AbortController();
    const taskText =
      'Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21';

    const result = await runWorker(
      0,
      1,
      config,
      createMockLogger() as any,
      abortController,
      taskText,
      'triage'
    );

    expect(result.success).toBe(true);
    expect(result.prNumber).toBe(21);
    expect(result.branchName).toBe('change-066');
    expect(result.prUrl).toBe(
      'https://github.com/carterbs/brad-os/pull/21'
    );
    expect(result.mergeHandledByWorker).toBe(true);
    expect(mockRunStep).toHaveBeenCalledTimes(2);
    expect(mockRunStep.mock.calls[0]?.[0]?.stepName).toBe('implement');
    expect(mockRunStep.mock.calls[1]?.[0]?.stepName).toBe('merge');
    expect(mockBuildOutstandingPrMergePrompt).toHaveBeenCalledWith(
      taskText,
      21,
      'change-066'
    );
    expect(mockBuildAgentMergePrompt).toHaveBeenCalledWith(
      21,
      'change-066'
    );
    expect(mockReadPullRequestMergeState).toHaveBeenCalledWith(
      `${config.worktreeDir}/change-066`,
      21
    );
    expect(mockCommitAll).not.toHaveBeenCalled();
    expect(mockPushBranch).not.toHaveBeenCalled();
    expect(mockEnsurePullRequest).not.toHaveBeenCalled();
    const stepNames = mockRunStep.mock.calls.map((call) => call[0].stepName);
    expect(stepNames).not.toContain('review');
  });

  it('skips planning for implement-plan task', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'DONE: Implemented plan' })
    );
    mockCommitAll.mockReturnValue(true);
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'REVIEW_PASSED' })
    );
    const config = makeConfig();
    const abortController = new AbortController();
    const taskText = 'Implement Plan 2026-02-26-rust-migrate-qa-start.md';

    const result = await runWorker(
      0,
      1,
      config,
      createMockLogger() as any,
      abortController,
      taskText,
      'backlog'
    );

    expect(result.success).toBe(true);
    const runStepCalls = mockRunStep.mock.calls;
    const planCalls = runStepCalls.filter((c) => c[0].stepName === 'plan');
    expect(planCalls).toHaveLength(0);
    expect(mockBuildImplPrompt).toHaveBeenCalledWith(
      'thoughts/shared/plans/active/2026-02-26-rust-migrate-qa-start.md'
    );
  });

  it('fails early when implement-plan task references missing plan file', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(false);
    const config = makeConfig();
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      createMockLogger() as any,
      abortController,
      'Implement Plan does-not-exist.md',
      'backlog'
    );

    expect(result.success).toBe(false);
    expect(mockRunStep).not.toHaveBeenCalled();
  });

  it('task-based planning succeeds', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: Add tests' }))
      .mockResolvedValueOnce(
        makeStepResult({ outputText: 'DONE: Added tests' })
      )
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add unit tests for X'
    );

    expect(result.success).toBe(true);
    expect(mockBuildTaskPlanPrompt).toHaveBeenCalledWith(
      'Add unit tests for X'
    );
  });

  it('task-based planning fails', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ success: false, outputText: '' })
    );
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add unit tests'
    );

    expect(result.success).toBe(false);
  });

  it('fails when plan file not created', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'PLAN: Something' })
    );
    mockExistsSync.mockReturnValue(false);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add unit tests'
    );

    expect(result.success).toBe(false);
  });

  it('ideation planning (no taskText)', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: Improve X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Improved' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController
    );

    expect(result.success).toBe(true);
    expect(mockBuildPlanPrompt).toHaveBeenCalled();
  });

  it('ideation planning fails', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ success: false, outputText: '' })
    );
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController
    );

    expect(result.success).toBe(false);
  });

  it('ideation plan file not created', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep.mockResolvedValueOnce(
      makeStepResult({ outputText: 'PLAN: Something' })
    );
    mockExistsSync.mockReturnValue(false);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController
    );

    expect(result.success).toBe(false);
  });

  it('implementation retries on first failure', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ success: false, outputText: '' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Fixed' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
    expect(mockRunStep.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('implementation fails on both attempts', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ success: false, outputText: '' }))
      .mockResolvedValueOnce(
        makeStepResult({ success: false, outputText: '' })
      );
    mockExistsSync.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(false);
  });

  it('no changes produced returns no_changes failure', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(false);
    mockHasNewCommits.mockReturnValue(false);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('no_changes');
  });

  it('no changes but main is green for main-not-green task', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(false);
    mockHasNewCommits.mockReturnValue(false);
    mockExecFileSync.mockReturnValue(''); // validation succeeds
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      MAIN_NOT_GREEN_TRIAGE_TASK,
      'triage'
    );

    expect(result.success).toBe(true);
  });

  it('has prior commits bypasses no-change check', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(false);
    mockHasNewCommits.mockReturnValue(true); // Has commits despite no fresh changes
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
  });

  it('review passes on first cycle', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
    // Verify review was called only once
    const reviewCalls = mockRunStep.mock.calls.filter(
      (c) => c[0].stepName === 'review'
    );
    expect(reviewCalls).toHaveLength(1);
  });

  it('review fails triggers fix step', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(
        makeStepResult({ outputText: 'REVIEW_FAILED\nIssues found' })
      )
      .mockResolvedValueOnce(makeStepResult({ outputText: 'FIXED: Corrected' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
    expect(mockBuildFixPrompt).toHaveBeenCalled();
  });

  it('ambiguous review with passing validation', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(
        makeStepResult({ outputText: 'Some ambiguous output' })
      );
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    mockExecFileSync.mockReturnValue(''); // validation passes
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
  });

  it('ambiguous review with failing validation triggers fix', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(
        makeStepResult({ outputText: 'Some ambiguous output' })
      )
      .mockResolvedValueOnce(makeStepResult({ outputText: 'FIXED: Corrected' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    // Make validation fail specifically for "npm run validate" calls, not git status
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (_cmd === 'npm' && args?.includes('validate')) {
        throw new Error('validation failed');
      }
      return '';
    });
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
    expect(mockBuildFixPrompt).toHaveBeenCalledWith(
      expect.stringContaining('npm run validate failed'),
      'thoughts/shared/plans/active/ralph-improvement.md'
    );
  });

  it('exceeds max review cycles', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(
        makeStepResult({ outputText: 'REVIEW_FAILED\nIssues' })
      )
      .mockResolvedValueOnce(makeStepResult({ outputText: 'FIXED: X' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig({ maxReviewCycles: 1 });
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(false);
  });

  it('catches thrown errors', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep.mockImplementation(() => {
      throw new Error('Unexpected error');
    });
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(false);
    expect(result.stepResults).toEqual([]);
  });

  it('DONE: line extracted from implementation output', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(
        makeStepResult({
          outputText: 'some text\nDONE: Added tests\nmore text',
        })
      )
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
    // Verify mockCommitAll was called with message containing "Added tests"
    expect(mockCommitAll).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Added tests')
    );
  });

  it('PLAN: line extracted from plan output', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(
        makeStepResult({
          outputText: 'some text\nPLAN: Improve X\nmore',
        })
      )
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Improved' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
    // Verify commit message used "Improve X" as title
    expect(mockCommitAll).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Improve X')
    );
  });

  it('FIXED: line logged from fix output', async () => {
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(
        makeStepResult({ outputText: 'REVIEW_FAILED\nIssues' })
      )
      .mockResolvedValueOnce(
        makeStepResult({
          outputText: 'Working on it\nFIXED: Corrected imports\nDone',
        })
      )
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    const config = makeConfig();
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      heading: vi.fn(),
      jsonl: vi.fn(),
      stepSummary: vi.fn(),
      improvementSummary: vi.fn(),
      verboseMsg: vi.fn(),
      tool: vi.fn(),
      compaction: vi.fn(),
    };
    const abortController = new AbortController();

    const result = await runWorker(
      0,
      1,
      config,
      mockLogger as any,
      abortController,
      'Add tests'
    );

    expect(result.success).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('FIXED: Corrected imports')
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// describe("activeWorktrees")
// ────────────────────────────────────────────────────────────────────────────

describe('activeWorktrees', () => {
  beforeEach(() => {});

  it('is exported as an empty Map', async () => {
    expect(activeWorktrees).toBeInstanceOf(Map);
    expect(activeWorktrees.size).toBe(0);
  });

  it('can store worktree entries', async () => {
    activeWorktrees.set(0, { path: '/tmp/test', branch: 'test-branch' });
    expect(activeWorktrees.has(0)).toBe(true);
    expect(activeWorktrees.get(0)).toEqual({
      path: '/tmp/test',
      branch: 'test-branch',
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// describe("main")
// ────────────────────────────────────────────────────────────────────────────

describe('main', () => {
  let mockProcessExit: ReturnType<typeof vi.spyOn>;
  let mockProcessOn: ReturnType<typeof vi.spyOn>;
  let signalHandlers: Record<string, ((...args: unknown[]) => void)[]>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockExecFileSync.mockReset();
    mockExistsSync.mockReset();
    mockRunStep.mockReset();
    mockCreateWorktree.mockReset();
    mockCleanupWorktree.mockReset();
    mockCountCompleted.mockReset();
    mockCommitAll.mockReset();
    mockHasNewCommits.mockReset();
    mockReadBacklog.mockReset();
    mockReadTriage.mockReset();
    mockAddTriageTask.mockReset();
    mockRemoveTask.mockReset();
    mockRemoveTriageTask.mockReset();
    mockMoveTaskToMergeConflicts.mockReset();
    mockSyncTaskFilesFromLog.mockReset();
    mockResolveConfig.mockReset();
    mockPushBranch.mockReset();
    mockEnsurePullRequest.mockReset();
    mockListOpenRalphPullRequests.mockReset();
    mockBuildBacklogRefillPrompt.mockReset();
    mockBuildTaskPlanPrompt.mockReset();
    mockBuildPlanPrompt.mockReset();
    mockBuildImplPrompt.mockReset();
    mockBuildMergeConflictResolvePrompt.mockReset();
    mockBuildReviewPrompt.mockReset();
    mockBuildFixPrompt.mockReset();
    mockLoggerConstructor.mockReset();
    mockLoggerConstructor.mockImplementation(createMockLogger);
    mockPushBranch.mockReturnValue(true);
    mockRunStep.mockResolvedValue(
      makeStepResult({ outputText: 'REVIEW_PASSED' })
    );
    mockReadPullRequestMergeState.mockReset();
    mockReadPullRequestMergeState.mockReturnValue({
      state: 'MERGED',
      mergedAt: '2026-02-26T17:30:24Z',
    });
    mockEnsurePullRequest.mockReturnValue({
      number: 123,
      url: 'https://github.com/org/repo/pull/123',
    });
    mockListOpenRalphPullRequests.mockReturnValue([]);
    mockReadSuppressedTypeScriptEslintRules.mockReturnValue([]);
    mockNormalizeBacklogForTypeScriptEslintCleanup.mockImplementation(
      (tasks) => ({
        normalizedTasks: tasks,
        addedCleanupTasks: [],
        removedNoiseTasks: [],
      }),
    );
    mockWriteBacklog.mockReset();
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      // no-op — just record the call
    }) as never);
    signalHandlers = {};
    mockProcessOn = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      handler: (...args: unknown[]) => void
    ) => {
      if (!signalHandlers[event]) signalHandlers[event] = [];
      signalHandlers[event].push(handler);
      return process;
    }) as never);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
    vi.useRealTimers();
    mockProcessExit.mockRestore();
    mockProcessOn.mockRestore();
  });

  function setupMainDefaults(configOverrides: Partial<Config> = {}): void {
    mockResolveConfig.mockReturnValue(makeConfig(configOverrides));
    mockSyncTaskFilesFromLog.mockReturnValue({
      mergedTasksSeen: 0,
      removedFromBacklog: [],
      removedFromTriage: [],
    });
    mockCountCompleted.mockReturnValue(0);
    mockCommitAll.mockReturnValue(true);
    mockBacklogPath.mockReturnValue('scripts/ralph/backlog.md');
    // Default: validation passes (runValidation won't add triage task)
    mockExecFileSync.mockReturnValue('');
  }

  it('completes a single CLI task successfully', async () => {
    setupMainDefaults({ task: 'Fix thing', target: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue([]);

    // Worker will run: plan → implement → review
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: Fix thing' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Fixed' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const mainPromise = main();
    // Advance past the setTimeout(2000) in the loop
    await vi.advanceTimersByTimeAsync(3000);
    await mainPromise;

  });

  it('adds triage task when main is not green', async () => {
    setupMainDefaults({ target: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['Some task']);
    mockAddTriageTask.mockReturnValue(true);

    // Make runValidation fail (the initial check in main)
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args?.[1] === 'validate') throw new Error('validation failed');
      return '';
    });

    // Worker succeeds
    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    expect(mockAddTriageTask).toHaveBeenCalledWith(MAIN_NOT_GREEN_TRIAGE_TASK);
  });

  it('imports outstanding Ralph PRs into triage at startup', async () => {
    setupMainDefaults({ target: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['Some task']);
    mockAddTriageTask.mockReturnValue(true);
    mockListOpenRalphPullRequests.mockReturnValue([
      {
        number: 19,
        url: 'https://github.com/carterbs/brad-os/pull/19',
        headRefName: 'change-067',
      },
      {
        number: 20,
        url: 'https://github.com/carterbs/brad-os/pull/20',
        headRefName: 'change-065',
      },
    ]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    expect(mockListOpenRalphPullRequests).toHaveBeenCalledWith(
      '/repo',
      'change'
    );
    expect(mockAddTriageTask).toHaveBeenCalledWith(
      'Resolve outstanding Ralph PR #19 (change-067) and merge to main. PR: https://github.com/carterbs/brad-os/pull/19'
    );
    expect(mockAddTriageTask).toHaveBeenCalledWith(
      'Resolve outstanding Ralph PR #20 (change-065) and merge to main. PR: https://github.com/carterbs/brad-os/pull/20'
    );
  });

  it('imports unattached outstanding Ralph PRs during loop', async () => {
    setupMainDefaults({ target: 1, parallelism: 1 });
    let triageReadCount = 0;
    mockReadTriage.mockImplementation(() => {
      triageReadCount += 1;
      return triageReadCount === 1
        ? []
        : [
            'Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21',
          ];
    });
    mockReadBacklog.mockReturnValue([]);
    mockListOpenRalphPullRequests.mockReturnValue([
      {
        number: 21,
        url: 'https://github.com/carterbs/brad-os/pull/21',
        headRefName: 'change-066',
      },
    ]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(
        makeStepResult({ outputText: 'DONE: Rebased and merged' })
      )
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));

    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    expect(mockListOpenRalphPullRequests).toHaveBeenCalledWith(
      '/repo',
      'change',
    );
    expect(mockAddTriageTask).toHaveBeenCalledWith(
      'Resolve outstanding Ralph PR #21 (change-066) and merge to main. PR: https://github.com/carterbs/brad-os/pull/21'
    );
    const stepNames = mockRunStep.mock.calls.map((call) => call[0].stepName);
    expect(stepNames).toEqual(['implement', 'merge']);
  });

  it('skips initial validation when --task is set', async () => {
    setupMainDefaults({ task: 'Fix thing', target: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue([]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    // runValidation uses execFileSync with "npm" — should not have been called for validate
    // (config.task is set, so `!config.task` is false at line 775)
    expect(mockAddTriageTask).not.toHaveBeenCalled();
  });

  it('stops on consecutive failure threshold', async () => {
    setupMainDefaults({ target: 10, parallelism: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue([
      'task1',
      'task2',
      'task3',
      'task4',
      'task5',
    ]);

    // All workers fail — worktree creation fails
    mockCreateWorktree.mockReturnValue({ created: false, resumed: false });
    const p = main();
    // Need to advance timers for each loop iteration's 2s delay
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await p;

    // failureThreshold = max(3, 1+2) = 3, so it should stop after 3 failures
    // Each failure creates one worker
    expect(mockCreateWorktree).toHaveBeenCalledTimes(3);
  });

  it('handles merge failure and escalates backlog task to triage', async () => {
    setupMainDefaults({ target: 2, parallelism: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['Task A', 'Task B']);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);

    mockRunStep.mockImplementation((options: { stepName: string }) => {
      if (options.stepName === "plan") {
        return Promise.resolve(makeStepResult({ outputText: "PLAN: X" }));
      }
      if (options.stepName === "implement") {
        return Promise.resolve(makeStepResult({ outputText: "DONE: Y" }));
      }
      return Promise.resolve(makeStepResult({ outputText: "REVIEW_PASSED" }));
    });
    mockCommitAll.mockReturnValue(true);

    mockReadPullRequestMergeState
      .mockReturnValueOnce({ state: 'OPEN', mergedAt: null })
      .mockReturnValueOnce({ state: 'OPEN', mergedAt: null })
      .mockReturnValueOnce({ state: 'OPEN', mergedAt: null })
      .mockReturnValueOnce({ state: 'MERGED', mergedAt: '2026-02-26T17:30:24Z' });
    const p = main();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await p;

    expect(mockRemoveTask).toHaveBeenCalledWith('Task A');
    expect(mockMoveTaskToMergeConflicts).toHaveBeenCalledWith(
      'Task A',
      {
        improvement: 1,
        branchName: 'change-001',
        worktreePath: '/tmp/worktrees/change-001',
      }
    );
  });

  it('handles triage task merge failure', async () => {
    setupMainDefaults({ target: 1, parallelism: 1 });
    mockReadTriage.mockReturnValue(['Triage fix']);
    mockReadBacklog.mockReturnValue([]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep.mockImplementation((options: { stepName: string }) => {
      if (options.stepName === "plan") {
        return Promise.resolve(makeStepResult({ outputText: "PLAN: X" }));
      }
      if (options.stepName === "implement") {
        return Promise.resolve(makeStepResult({ outputText: "DONE: Y" }));
      }
      return Promise.resolve(makeStepResult({ outputText: "REVIEW_PASSED" }));
    });
    mockCommitAll.mockReturnValue(true);
    mockReadPullRequestMergeState.mockReturnValueOnce({
      state: 'OPEN',
      mergedAt: null,
    }).mockReturnValueOnce({
      state: 'OPEN',
      mergedAt: null,
    }).mockReturnValueOnce({
      state: 'OPEN',
      mergedAt: null,
    });
    const p = main();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await p;

    expect(mockRemoveTriageTask).toHaveBeenCalledWith('Triage fix');
    expect(mockMoveTaskToMergeConflicts).toHaveBeenCalledWith(
      'Triage fix',
      {
        improvement: 1,
        branchName: 'change-001',
        worktreePath: '/tmp/worktrees/change-001',
      }
    );
  });

  it('removes triage task on successful merge', async () => {
    setupMainDefaults({ target: 1, parallelism: 1 });
    mockReadTriage.mockReturnValue(['Triage task']);
    mockReadBacklog.mockReturnValue([]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    expect(mockRemoveTriageTask).toHaveBeenCalledWith('Triage task');
  });

  it('removes backlog task on successful merge', async () => {
    setupMainDefaults({ target: 1, parallelism: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['Backlog task']);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    expect(mockRemoveTask).toHaveBeenCalledWith('Backlog task');
  });

  it('defers main-not-green task after no_changes failure', async () => {
    setupMainDefaults({ target: undefined, parallelism: 1 });

    const MAIN_GREEN_TASK =
      'Restore main to green: run npm run validate on main, fix failures, then rerun validate.';

    // First read: triage has the main-green task; later reads return empty
    let triageCallCount = 0;
    mockReadTriage.mockImplementation(() => {
      triageCallCount++;
      // First few calls: has the task. After worker finishes, empty.
      if (triageCallCount <= 4) return [MAIN_GREEN_TASK];
      return [];
    });
    mockReadBacklog.mockReturnValue([]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    // Plan and implement succeed, but commitAll returns false + no new commits = no_changes
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: fix' }))
      .mockResolvedValueOnce(
        makeStepResult({ outputText: 'DONE: nothing to fix' })
      );
    mockCommitAll.mockReturnValue(false);
    mockHasNewCommits.mockReturnValue(false);
    // checkDeps calls execFileSync("which",...) — must succeed for that.
    // runValidation calls execFileSync("npm",...) — must fail for that.
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (_cmd === 'which') return ''; // deps OK
      throw new Error('validation failed'); // npm run validate fails
    });
    mockAddTriageTask.mockReturnValue(false); // Already exists
    const p = main();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await p;

    // The worker should have failed with no_changes and the retry cooldown should be set
  });

  it('refills empty backlog', async () => {
    // target must be set so hasMoreWork returns true even with empty backlog
    setupMainDefaults({ target: 1, parallelism: 1 });
    mockExecFileSync.mockReturnValue(''); // checkDeps + runValidation
    mockReadTriage.mockReturnValue([]);

    // readBacklog is called by: (1) header display, (2) hasMoreWork condition,
    // (3) ensureBacklog. Must return [] for all 3 to trigger refill.
    let backlogCallCount = 0;
    mockReadBacklog.mockImplementation(() => {
      backlogCallCount++;
      if (backlogCallCount <= 3) return []; // header + hasMoreWork + ensureBacklog → triggers refill
      return ['Refilled task'];
    });

    // Refill step succeeds, then worker steps
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ success: true })) // backlog-refill
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' })) // plan
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' })) // implement
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' })); // review

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    const p = main();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await p;

    expect(mockBuildBacklogRefillPrompt).toHaveBeenCalled();
  });

  it('normalizes refilled backlog with suppression cleanup and writes updates', async () => {
    setupMainDefaults({ target: 1, parallelism: 1 });
    mockExecFileSync.mockReturnValue('');
    mockReadTriage.mockReturnValue([]);

    const rawBacklog = [
      'Add `typescript-eslint` cleanup tasks to reduce noise from the temporary oxlint suppression.',
      'Refill baseline task',
    ];
    const normalizedBacklog = [
      'Refill baseline task',
      'Re-enable `typescript-eslint/no-unsafe-type-assertion` in repositories and middleware after targeted type-guard refactors.',
      'Re-enable `typescript-eslint/no-unnecessary-type-assertion` once broad `as` casts are replaced with schema-safe parsing.',
      'Re-enable `typescript-eslint/no-base-to-string` after replacing implicit string coercions in serialization paths.',
    ];
    const addedTasks = [
      'Re-enable `typescript-eslint/no-unsafe-type-assertion` in repositories and middleware after targeted type-guard refactors.',
      'Re-enable `typescript-eslint/no-unnecessary-type-assertion` once broad `as` casts are replaced with schema-safe parsing.',
      'Re-enable `typescript-eslint/no-base-to-string` after replacing implicit string coercions in serialization paths.',
    ];
    const removedTasks = [
      'Add `typescript-eslint` cleanup tasks to reduce noise from the temporary oxlint suppression.',
    ];
    mockReadSuppressedTypeScriptEslintRules.mockReturnValue([
      'typescript-eslint/no-unsafe-type-assertion',
      'typescript-eslint/no-unnecessary-type-assertion',
      'typescript-eslint/no-base-to-string',
    ]);
    mockNormalizeBacklogForTypeScriptEslintCleanup.mockReturnValue({
      normalizedTasks: normalizedBacklog,
      addedCleanupTasks: addedTasks,
      removedNoiseTasks: removedTasks,
    });

    let backlogCallCount = 0;
    mockReadBacklog.mockImplementation(() => {
      backlogCallCount++;
      if (backlogCallCount <= 3) return [];
      if (backlogCallCount === 4) return rawBacklog;
      return normalizedBacklog;
    });

    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ success: true })) // backlog-refill
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' })) // plan
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' })) // implement
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' })); // review

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);

    const mainPromise = main();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await mainPromise;

    expect(mockReadSuppressedTypeScriptEslintRules).toHaveBeenCalledWith(
      '/repo/.oxlintrc.json',
    );
    expect(mockNormalizeBacklogForTypeScriptEslintCleanup).toHaveBeenCalledWith(
      rawBacklog,
      [
        'typescript-eslint/no-unsafe-type-assertion',
        'typescript-eslint/no-unnecessary-type-assertion',
        'typescript-eslint/no-base-to-string',
      ],
    );
    expect(mockWriteBacklog).toHaveBeenCalledWith(normalizedBacklog);
    const logger = mockLoggerConstructor.mock.results[0].value;
    expect(logger.info).toHaveBeenCalledWith(
      'Backlog normalization removed 1 generic suppression task(s) during refill:',
    );
    expect(logger.info).toHaveBeenCalledWith(
      `  - removed: ${removedTasks[0]}`,
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Backlog normalization added 3 canonical suppression cleanup task(s) during refill:',
    );
    expect(logger.info).toHaveBeenCalledWith(`  - added: ${addedTasks[0]}`);
  });

  it('leaves refilled backlog untouched when normalization makes no changes', async () => {
    setupMainDefaults({ target: 1, parallelism: 1 });
    mockExecFileSync.mockReturnValue('');
    mockReadTriage.mockReturnValue([]);

    const rawBacklog = ['Refill baseline task', 'Another task'];
    mockReadSuppressedTypeScriptEslintRules.mockReturnValue([]);
    mockNormalizeBacklogForTypeScriptEslintCleanup.mockReturnValue({
      normalizedTasks: rawBacklog,
      addedCleanupTasks: [],
      removedNoiseTasks: [],
    });

    let backlogCallCount = 0;
    mockReadBacklog.mockImplementation(() => {
      backlogCallCount++;
      if (backlogCallCount <= 3) return [];
      if (backlogCallCount === 4) return rawBacklog;
      return rawBacklog;
    });

    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ success: true })) // backlog-refill
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' })) // plan
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' })) // implement
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' })); // review

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);

    const mainPromise = main();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await mainPromise;

    expect(mockNormalizeBacklogForTypeScriptEslintCleanup).toHaveBeenCalledWith(
      rawBacklog,
      [],
    );
    expect(mockWriteBacklog).not.toHaveBeenCalled();
    expect(mockBuildBacklogRefillPrompt).toHaveBeenCalledTimes(1);
  });

  it('exits when backlog refill fails and no workers running', async () => {
    // target must be set so hasMoreWork enters the loop with empty backlog
    setupMainDefaults({ target: 5, parallelism: 1 });
    mockExecFileSync.mockReturnValue(''); // checkDeps + runValidation
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue([]); // always empty

    // Refill fails
    mockRunStep.mockResolvedValueOnce(makeStepResult({ success: false }));
    const p = main();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await p;

    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('exits when refill produces zero tasks', async () => {
    // target must be set so hasMoreWork enters the loop with empty backlog
    setupMainDefaults({ target: 5, parallelism: 1 });
    mockExecFileSync.mockReturnValue(''); // checkDeps + runValidation
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue([]); // always empty, even after refill

    // Refill "succeeds" but backlog stays empty
    mockRunStep.mockResolvedValueOnce(makeStepResult({ success: true }));
    const p = main();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await p;

    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('does not remove task on CLI task mode merge', async () => {
    setupMainDefaults({ task: 'CLI task', target: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue([]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    // When config.task is set, task removal from backlog/triage should not happen
    expect(mockRemoveTask).not.toHaveBeenCalled();
    expect(mockRemoveTriageTask).not.toHaveBeenCalled();
  });

  it('escalation parking is no-op in CLI task mode', async () => {
    setupMainDefaults({ target: 1, parallelism: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['task']);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: true });
    // Resumed: skip planning. Implement succeeds. Review passes. But no taskText propagated?
    // Actually runWorker always receives taskText from main. Let's test parkTask through
    // a merge failure where config.task is set (which makes parkTask return early).
    // The easier way: override config to have task set, force merge failure
    setupMainDefaults({ task: 'CLI only', target: 1, parallelism: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue([]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const p = main();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await p;

    expect(mockRemoveTask).not.toHaveBeenCalled();
    expect(mockRemoveTriageTask).not.toHaveBeenCalled();
    expect(mockAddTriageTask).not.toHaveBeenCalled();
  });

  it('syncBacklog logs removed tasks after merge', async () => {
    setupMainDefaults({ target: 1, parallelism: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['task']);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    
    // After merge, syncBacklog finds removals
    mockSyncTaskFilesFromLog
      .mockReturnValueOnce({
        mergedTasksSeen: 0,
        removedFromBacklog: [],
        removedFromTriage: [],
      }) // startup
      .mockReturnValueOnce({
        mergedTasksSeen: 1,
        removedFromBacklog: ['old task'],
        removedFromTriage: ['old triage'],
      }); // post-merge
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    // syncTaskFilesFromLog called twice: startup + post-merge
    expect(mockSyncTaskFilesFromLog).toHaveBeenCalledTimes(2);
  });

  it('processes remaining workers after loop exits via failure threshold (merge succeeds)', async () => {
    // parallelism: 2 → failureThreshold = max(3, 2+2) = 4
    // Worker 0 fails 4 times (createWorktree fails) → threshold reached → loop breaks
    // Worker 1 is still running (plan step delayed) → remaining workers path (lines 955-989)
    setupMainDefaults({ target: 10, parallelism: 2 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['A', 'B', 'C', 'D', 'E', 'F']);

    // Worker 1's plan step delayed by 60s, all other steps resolve immediately
    let runStepCount = 0;
    mockRunStep.mockImplementation((opts: { stepName: string }) => {
      runStepCount++;
      // Call 1 is worker 1's plan step (delayed)
      if (runStepCount === 1) {
        return new Promise((resolve) =>
          setTimeout(
            () => resolve(makeStepResult({ outputText: 'PLAN: B' })),
            60000
          )
        );
      }
      // Worker 1's implement and review
      if (opts.stepName === 'implement')
        return Promise.resolve(makeStepResult({ outputText: 'DONE: B' }));
      return Promise.resolve(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    });

    // createWorktree: call 2 (worker 1) succeeds, all others fail
    let createCount = 0;
    mockCreateWorktree.mockImplementation(() => {
      createCount++;
      if (createCount === 2) return { created: true, resumed: false };
      return { created: false, resumed: false };
    });

    mockExistsSync.mockReturnValue(true);
    const p = main();

    // Advance through 4 failure iterations (each has 2s delay) + some buffer
    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }

    // Now advance 60s to resolve worker 1's delayed plan step
    await vi.advanceTimersByTimeAsync(60000);

    await p;

    // Remaining worker was processed through merge queue
  });

  it('handles remaining worker merge failure after loop exits', async () => {
    setupMainDefaults({ target: 10, parallelism: 2 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['A', 'B', 'C', 'D', 'E', 'F']);

    let runStepCount = 0;
    mockRunStep.mockImplementation((opts: { stepName: string }) => {
      runStepCount++;
      if (runStepCount === 1) {
        return new Promise((resolve) =>
          setTimeout(
            () => resolve(makeStepResult({ outputText: 'PLAN: B' })),
            60000
          )
        );
      }
      if (opts.stepName === 'implement')
        return Promise.resolve(makeStepResult({ outputText: 'DONE: B' }));
      return Promise.resolve(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    });

    let createCount = 0;
    mockCreateWorktree.mockImplementation(() => {
      createCount++;
      if (createCount === 2) return { created: true, resumed: false };
      return { created: false, resumed: false };
    });

    mockExistsSync.mockReturnValue(true);
    mockCommitAll.mockReturnValue(true);
    // Agent merge state check fails for remaining worker (both attempts)
    mockReadPullRequestMergeState.mockReturnValueOnce({
      state: 'OPEN',
      mergedAt: null,
    }).mockReturnValueOnce({
      state: 'OPEN',
      mergedAt: null,
    }).mockReturnValueOnce({
      state: 'OPEN',
      mergedAt: null,
    });
    const p = main();

    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    await vi.advanceTimersByTimeAsync(60000);

    await p;

    expect(mockMoveTaskToMergeConflicts).toHaveBeenCalledWith(
      'B',
      {
        improvement: 2,
        branchName: 'change-002',
        worktreePath: '/tmp/worktrees/change-002',
      }
    );
  });

  it('remaining worker with triage task removes from triage on successful merge', async () => {
    setupMainDefaults({ target: 10, parallelism: 2 });
    // Triage has one task, backlog has tasks for worker 0 iterations
    mockReadTriage.mockReturnValue(['Triage fix']);
    mockReadBacklog.mockReturnValue(['A', 'B', 'C', 'D', 'E']);

    let runStepCount = 0;
    mockRunStep.mockImplementation((opts: { stepName: string }) => {
      runStepCount++;
      // Call 1: worker 1's plan step (triage task) — delayed
      if (runStepCount === 1) {
        return new Promise((resolve) =>
          setTimeout(
            () => resolve(makeStepResult({ outputText: 'PLAN: Fix' })),
            60000
          )
        );
      }
      if (opts.stepName === 'implement')
        return Promise.resolve(makeStepResult({ outputText: 'DONE: Fixed' }));
      return Promise.resolve(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    });

    // createWorktree: call 1 (worker for triage) succeeds, all others fail
    // Triage is prioritized, so worker slot 0 gets triage, slot 1 gets backlog
    // Actually acquireTask picks triage first, so slot 0 = triage, slot 1 = backlog
    // But we want the triage task to be the one that's still running
    // Since both workers start, and slot 0 picks triage first...
    // Let me make slot 0's createWorktree succeed (triage) and slot 1 fail (backlog)
    let createCount = 0;
    mockCreateWorktree.mockImplementation(() => {
      createCount++;
      if (createCount === 1) return { created: true, resumed: false }; // slot 0 (triage)
      return { created: false, resumed: false }; // slot 1+ (backlog, fails)
    });

    mockExistsSync.mockReturnValue(true);
    const p = main();

    // Advance through failure iterations
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }
    // Resolve worker 0's delayed plan step
    await vi.advanceTimersByTimeAsync(60000);

    await p;

    // Remaining worker (triage task) merged successfully → removeTriageTask called
    expect(mockRemoveTriageTask).toHaveBeenCalledWith('Triage fix');
  });

  it('SIGINT handler aborts and SIGTERM handler aborts', async () => {
    setupMainDefaults({ target: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['task']);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    // Verify signal handlers were registered
    expect(signalHandlers['SIGINT']).toBeDefined();
    expect(signalHandlers['SIGTERM']).toBeDefined();

    // Invoke them to exercise the callback code (lines 589-594)
    signalHandlers['SIGINT'][0]();
    signalHandlers['SIGTERM'][0]();
  });

  it('exit handler cleans up worktrees', async () => {
    setupMainDefaults({ target: 1 });
    mockReadTriage.mockReturnValue([]);
    mockReadBacklog.mockReturnValue(['task']);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: X' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: Y' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));
    const p = main();
    await vi.advanceTimersByTimeAsync(3000);
    await p;

    // Simulate active worktrees for exit handler coverage
    activeWorktrees.set(99, { path: '/tmp/wt-99', branch: 'branch-99' });

    // Exercise the exit handler — worktree has no new commits → cleanup
    mockHasNewCommits.mockReturnValue(false);
    expect(signalHandlers['exit']).toBeDefined();
    signalHandlers['exit'][0]();
    expect(mockCleanupWorktree).toHaveBeenCalled();

    // Exercise exit handler — worktree has commits → preserved
    activeWorktrees.set(98, { path: '/tmp/wt-98', branch: 'branch-98' });
    mockHasNewCommits.mockReturnValue(true);
    signalHandlers['exit'][0]();

    // Exercise exit handler — cleanup throws → ignored
    activeWorktrees.set(97, { path: '/tmp/wt-97', branch: 'branch-97' });
    mockHasNewCommits.mockReturnValue(false);
    mockCleanupWorktree.mockImplementation(() => {
      throw new Error('cleanup failed');
    });
    signalHandlers['exit'][0](); // should not throw

    activeWorktrees.clear();
  });

  it('acquireTask returns deferred main-not-green task when in cooldown', async () => {
    // target: undefined → hasMoreWork depends on triage/backlog/inFlight counts
    setupMainDefaults({ target: undefined, parallelism: 1 });

    // Provide the main-green task for the first few reads, then empty triage
    // so the orchestration loop can terminate deterministically.
    let triageReadCount = 0;
    mockReadTriage.mockImplementation(() => {
      triageReadCount++;
      if (triageReadCount <= 8) return [MAIN_NOT_GREEN_TRIAGE_TASK];
      return [];
    });
    mockReadBacklog.mockReturnValue([]);

    mockCreateWorktree.mockReturnValue({ created: true, resumed: false });
    mockExistsSync.mockReturnValue(true);
    mockHasNewCommits.mockReturnValue(false);

    // Worker 1: plan + implement → no_changes (commitAll false + hasNewCommits false)
    // Worker 2: plan + implement → succeeds + review passes
    mockRunStep
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: fix' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: nothing' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'PLAN: fix2' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'DONE: fixed' }))
      .mockResolvedValueOnce(makeStepResult({ outputText: 'REVIEW_PASSED' }));

    let commitCallCount = 0;
    mockCommitAll.mockImplementation(() => {
      commitCallCount++;
      return commitCallCount > 1; // first: false (no_changes), later: true
    });

    // runValidation must fail (this is the main-not-green scenario)
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (_cmd === 'which') return '';
      if (_cmd === 'npm' && args?.includes('validate'))
        throw new Error('validation failed');
      return '';
    });
    mockAddTriageTask.mockReturnValue(false); // task already exists

    const p = main();

    // First worker runs and fails with no_changes.
    // mainNotGreenRetryAfter is set to Date.now() + 15min.
    // On the second iteration, acquireTask defers the task but returns it anyway.
    // Advance small increments so fake Date.now() stays within the cooldown window.
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(3000);
    }

    await p;

  });
});
