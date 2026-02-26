import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from './config.js';

const { mockReadFileSync, mockParseArgs } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockParseArgs: vi.fn(),
}));

vi.mock('node:fs', () => ({ readFileSync: mockReadFileSync }));
vi.mock('node:util', () => ({ parseArgs: mockParseArgs }));

describe('resolveConfig', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset();
    mockParseArgs.mockReset();
  });

  // ===== 1. No CLI args, no config file (defaults only) =====
  it('should apply defaults when no CLI args and no config file', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.parallelism).toBe(2);
    expect(config.branchPrefix).toBe('harness-improvement');
    expect(config.maxTurns).toBe(100);
    expect(config.minReviewCycles).toBe(2);
    expect(config.maxReviewCycles).toBe(3);
    expect(config.verbose).toBe(false);
    expect(config.target).toBeUndefined();
    expect(config.task).toBeUndefined();
    expect(config.repoDir).toBe('/Users/bradcarter/Documents/Dev/brad-os');
    expect(config.worktreeDir).toBe('/tmp/brad-os-ralph-worktrees');
    expect(config.logFile).toBe(
      '/Users/bradcarter/Documents/Dev/brad-os/ralph-loop.jsonl'
    );
  });

  // ===== 2. Default agent backends and models =====
  it('should use claude backend with default claude models when no agent specified', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.agents.backlog.backend).toBe('claude');
    expect(config.agents.backlog.model).toBe('claude-opus-4-6');
    expect(config.agents.plan.backend).toBe('claude');
    expect(config.agents.plan.model).toBe('claude-opus-4-6');
    expect(config.agents.implement.backend).toBe('claude');
    expect(config.agents.implement.model).toBe('claude-sonnet-4-6');
    expect(config.agents.review.backend).toBe('claude');
    expect(config.agents.review.model).toBe('claude-sonnet-4-6');
  });

  // ===== 3. Config file overrides defaults =====
  it('should load and apply config file values', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        target: 15,
        parallelism: 4,
        branchPrefix: 'feature-branch',
        maxTurns: 50,
        maxReviewCycles: 3,
        verbose: true,
      });
    });
    const config = resolveConfig();

    expect(config.target).toBe(15);
    expect(config.parallelism).toBe(4);
    expect(config.branchPrefix).toBe('feature-branch');
    expect(config.maxTurns).toBe(50);
    expect(config.maxReviewCycles).toBe(3);
    expect(config.verbose).toBe(true);
  });

  // ===== 4. CLI args override config file =====
  it('should let CLI args override config file values', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        target: '10',
        parallelism: '6',
        'branch-prefix': 'cli-branch',
        'max-turns': '75',
        verbose: true,
      },
    });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        target: 15,
        parallelism: 4,
        branchPrefix: 'config-branch',
        maxTurns: 50,
        verbose: false,
      });
    });
    const config = resolveConfig();

    expect(config.target).toBe(10);
    expect(config.parallelism).toBe(6);
    expect(config.branchPrefix).toBe('cli-branch');
    expect(config.maxTurns).toBe(75);
    expect(config.verbose).toBe(true);
  });

  // ===== 5. --task forces parallelism to 1 =====
  it('should force parallelism to 1 when --task is set', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        task: 'fix critical bug',
        parallelism: '8',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.parallelism).toBe(1);
    expect(config.task).toBe('fix critical bug');
  });

  // ===== 6. --task forces parallelism even when config file sets it =====
  it('should force parallelism to 1 when --task is set, even if config file sets higher parallelism', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        task: 'some task',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        parallelism: 10,
      });
    });
    const config = resolveConfig();

    expect(config.parallelism).toBe(1);
  });

  // ===== 7. Explicit --agent flag =====
  it('should use --agent flag for all steps when specified', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        agent: 'codex',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.agents.backlog.backend).toBe('codex');
    expect(config.agents.backlog.model).toBe('gpt-5.3-codex');
    expect(config.agents.plan.backend).toBe('codex');
    expect(config.agents.plan.model).toBe('gpt-5.3-codex');
    expect(config.agents.implement.backend).toBe('codex');
    expect(config.agents.implement.model).toBe('gpt-5.3-codex-spark');
    expect(config.agents.review.backend).toBe('codex');
    expect(config.agents.review.model).toBe('gpt-5.3-codex-spark');
  });

  // ===== 8. Per-step agent override =====
  it('should allow per-step agent override via CLI flags', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        'plan-agent': 'codex',
        'impl-agent': 'codex',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    // plan and implement use codex
    expect(config.agents.plan.backend).toBe('codex');
    expect(config.agents.plan.model).toBe('gpt-5.3-codex');
    expect(config.agents.implement.backend).toBe('codex');
    expect(config.agents.implement.model).toBe('gpt-5.3-codex-spark');

    // backlog and review use claude (default)
    expect(config.agents.backlog.backend).toBe('claude');
    expect(config.agents.backlog.model).toBe('claude-opus-4-6');
    expect(config.agents.review.backend).toBe('claude');
    expect(config.agents.review.model).toBe('claude-sonnet-4-6');
  });

  // ===== 9. Model inference: codex model infers codex backend =====
  it('should infer codex backend from codex model name', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        'plan-model': 'gpt-5.3-codex',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.agents.plan.backend).toBe('codex');
    expect(config.agents.plan.model).toBe('gpt-5.3-codex');
  });

  // ===== 10. Model inference: gpt model infers codex backend =====
  it('should infer codex backend from gpt model name', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        'impl-model': 'gpt-custom-model',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.agents.implement.backend).toBe('codex');
    expect(config.agents.implement.model).toBe('gpt-custom-model');
  });

  // ===== 11. Model inference: claude model infers claude backend =====
  it('should infer claude backend from claude model name', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        'review-model': 'claude-opus-4-6',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.agents.review.backend).toBe('claude');
    expect(config.agents.review.model).toBe('claude-opus-4-6');
  });

  // ===== 12. Config file with agents section =====
  it('should apply agents section from config file', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        agents: {
          plan: { backend: 'codex', model: 'gpt-5.3-custom' },
          backlog: { backend: 'codex' },
        },
      });
    });
    const config = resolveConfig();

    expect(config.agents.plan.backend).toBe('codex');
    expect(config.agents.plan.model).toBe('gpt-5.3-custom');
    expect(config.agents.backlog.backend).toBe('codex');
    expect(config.agents.backlog.model).toBe('gpt-5.3-codex');
  });

  // ===== 13. Config file with global agent =====
  it('should apply global agent from config file to all steps', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        agent: 'codex',
      });
    });
    const config = resolveConfig();

    expect(config.agents.backlog.backend).toBe('codex');
    expect(config.agents.plan.backend).toBe('codex');
    expect(config.agents.implement.backend).toBe('codex');
    expect(config.agents.review.backend).toBe('codex');
  });

  // ===== 14. --config flag changes config file location =====
  it('should respect --config flag to load from custom location', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        config: '/custom/path',
      },
    });
    mockReadFileSync.mockImplementation((filePath: string) => {
      if (filePath === '/custom/path/ralph.config.json') {
        return JSON.stringify({
          parallelism: 7,
          branchPrefix: 'custom-config',
        });
      }
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.parallelism).toBe(7);
    expect(config.branchPrefix).toBe('custom-config');
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/custom/path/ralph.config.json',
      'utf-8'
    );
  });

  // ===== 15. Config file with non-object JSON =====
  it('should treat non-object JSON as no config file', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify('just a string');
    });
    const config = resolveConfig();

    // Should use all defaults
    expect(config.parallelism).toBe(2);
    expect(config.branchPrefix).toBe('harness-improvement');
  });

  // ===== 16. Config file with null =====
  it('should treat null JSON as no config file', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return 'null';
    });
    const config = resolveConfig();

    // Should use all defaults
    expect(config.parallelism).toBe(2);
    expect(config.branchPrefix).toBe('harness-improvement');
  });

  // ===== 17. Config file with invalid JSON =====
  it('should treat invalid JSON as no config file', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return '{ invalid json }';
    });
    const config = resolveConfig();

    // Should use all defaults
    expect(config.parallelism).toBe(2);
    expect(config.branchPrefix).toBe('harness-improvement');
  });

  // ===== 18. Per-step model override via CLI =====
  it('should allow per-step model override via CLI flags', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        'backlog-model': 'custom-model',
        'review-model': 'gpt-special',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    // backlog: custom-model (no "gpt" or "codex", infers claude)
    expect(config.agents.backlog.backend).toBe('claude');
    expect(config.agents.backlog.model).toBe('custom-model');

    // review: gpt-special (contains "gpt", infers codex)
    expect(config.agents.review.backend).toBe('codex');
    expect(config.agents.review.model).toBe('gpt-special');
  });

  // ===== 19. CLI step-agent overrides config file agents section =====
  it('should let CLI step-agent override config file agents section', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        'plan-agent': 'claude',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        agents: {
          plan: { backend: 'codex' },
        },
      });
    });
    const config = resolveConfig();

    expect(config.agents.plan.backend).toBe('claude');
    expect(config.agents.plan.model).toBe('claude-opus-4-6');
  });

  // ===== 20. CLI step-model overrides config file agents section =====
  it('should let CLI step-model override config file agents model', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        'plan-model': 'override-model',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        agents: {
          plan: { backend: 'codex', model: 'config-model' },
        },
      });
    });
    const config = resolveConfig();

    expect(config.agents.plan.model).toBe('override-model');
  });

  // ===== 21. Global --agent overrides config file global agent =====
  it('should let CLI global --agent override config file global agent', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        agent: 'claude',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        agent: 'codex',
      });
    });
    const config = resolveConfig();

    expect(config.agents.backlog.backend).toBe('claude');
    expect(config.agents.plan.backend).toBe('claude');
    expect(config.agents.implement.backend).toBe('claude');
    expect(config.agents.review.backend).toBe('claude');
  });

  // ===== 22. Config file agents section with mixed explicit and inferred backends =====
  it('should handle config file agents with mixed explicit and inferred backends', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        agents: {
          backlog: { model: 'gpt-5.3-codex' }, // model without backend, should infer codex
          plan: { backend: 'claude', model: 'custom-model' }, // explicit backend, use it
          implement: { model: 'claude-custom' }, // infers claude
        },
      });
    });
    const config = resolveConfig();

    expect(config.agents.backlog.backend).toBe('codex');
    expect(config.agents.backlog.model).toBe('gpt-5.3-codex');

    expect(config.agents.plan.backend).toBe('claude');
    expect(config.agents.plan.model).toBe('custom-model');

    expect(config.agents.implement.backend).toBe('claude');
    expect(config.agents.implement.model).toBe('claude-custom');
  });

  // ===== 23. parseArgs is called with correct options =====
  it('should call parseArgs with all expected options', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    resolveConfig();

    const call = mockParseArgs.mock.calls[0][0];
    expect(call.options).toHaveProperty('target');
    expect(call.options).toHaveProperty('branch-prefix');
    expect(call.options).toHaveProperty('max-turns');
    expect(call.options).toHaveProperty('parallelism');
    expect(call.options).toHaveProperty('verbose');
    expect(call.options).toHaveProperty('task');
    expect(call.options).toHaveProperty('config');
    expect(call.options).toHaveProperty('agent');
    expect(call.options).toHaveProperty('backlog-agent');
    expect(call.options).toHaveProperty('plan-agent');
    expect(call.options).toHaveProperty('impl-agent');
    expect(call.options).toHaveProperty('review-agent');
    expect(call.options).toHaveProperty('backlog-model');
    expect(call.options).toHaveProperty('plan-model');
    expect(call.options).toHaveProperty('impl-model');
    expect(call.options).toHaveProperty('review-model');
    expect(call.strict).toBe(false);
  });

  // ===== 24. target can be undefined if not specified =====
  it('should have target as undefined when not provided', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.target).toBeUndefined();
  });

  // ===== 25. target from CLI is parsed as integer =====
  it('should parse target from CLI as integer', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        target: '42',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.target).toBe(42);
    expect(typeof config.target).toBe('number');
  });

  // ===== 26. maxTurns is parsed as integer from CLI =====
  it('should parse maxTurns from CLI as integer', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        'max-turns': '200',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.maxTurns).toBe(200);
    expect(typeof config.maxTurns).toBe('number');
  });

  // ===== 27. parallelism is parsed as integer from CLI =====
  it('should parse parallelism from CLI as integer', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        parallelism: '16',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.parallelism).toBe(16);
    expect(typeof config.parallelism).toBe('number');
  });

  // ===== 28. verbose boolean default is false =====
  it('should default verbose to false when not set', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.verbose).toBe(false);
  });

  // ===== 29. verbose is true when CLI flag is set =====
  it('should set verbose to true when --verbose flag is set', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        verbose: true,
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.verbose).toBe(true);
  });

  // ===== 30. verbose is true when config file sets it =====
  it('should set verbose to true when config file has verbose: true', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        verbose: true,
      });
    });
    const config = resolveConfig();

    expect(config.verbose).toBe(true);
  });

  // ===== 31. repoDir is always set to the hardcoded value =====
  it('should always use the hardcoded repoDir', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.repoDir).toBe('/Users/bradcarter/Documents/Dev/brad-os');
  });

  // ===== 32. worktreeDir is always set to the hardcoded value =====
  it('should always use the hardcoded worktreeDir', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.worktreeDir).toBe('/tmp/brad-os-ralph-worktrees');
  });

  // ===== 33. logFile is constructed from repoDir =====
  it('should construct logFile from repoDir', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.logFile).toBe(
      '/Users/bradcarter/Documents/Dev/brad-os/ralph-loop.jsonl'
    );
  });

  // ===== 34. Multiple role differences: backlog/plan use "plan" role, implement/review use "exec" role =====
  it('should use correct role (plan vs exec) for each step', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        agent: 'codex',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    // backlog and plan use "plan" role, so should get gpt-5.3-codex
    expect(config.agents.backlog.model).toBe('gpt-5.3-codex');
    expect(config.agents.plan.model).toBe('gpt-5.3-codex');

    // implement and review use "exec" role, so should get gpt-5.3-codex-spark
    expect(config.agents.implement.model).toBe('gpt-5.3-codex-spark');
    expect(config.agents.review.model).toBe('gpt-5.3-codex-spark');
  });

  // ===== 35. Priority chain: CLI step > CLI global > config step > config global > infer > default =====
  it('should follow correct priority chain: CLI step > CLI global > config step > config global > infer > default', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        agent: 'claude', // CLI global
        'plan-agent': 'codex', // CLI step (overrides CLI global)
      },
    });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        agent: 'codex', // config global (would be used for other steps)
        agents: {
          implement: { backend: 'claude' }, // config step
        },
      });
    });
    const config = resolveConfig();

    // plan: CLI step-agent wins -> codex
    expect(config.agents.plan.backend).toBe('codex');

    // implement: config step-backend wins over config global -> claude
    expect(config.agents.implement.backend).toBe('claude');

    // backlog: CLI global wins over config global -> claude
    expect(config.agents.backlog.backend).toBe('claude');

    // review: CLI global wins over config global -> claude
    expect(config.agents.review.backend).toBe('claude');
  });

  // ===== 36. Empty config file object is treated like no config =====
  it('should treat empty config file object like no config file', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({});
    });
    const config = resolveConfig();

    // Should use all defaults
    expect(config.parallelism).toBe(2);
    expect(config.branchPrefix).toBe('harness-improvement');
    expect(config.maxTurns).toBe(100);
    expect(config.minReviewCycles).toBe(2);
    expect(config.maxReviewCycles).toBe(3);
  });

  // ===== 37. Partial config file only overrides what's specified =====
  it('should only override values that are specified in config file', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        parallelism: 5,
        // other values not specified, should use defaults
      });
    });
    const config = resolveConfig();

    expect(config.parallelism).toBe(5);
    expect(config.branchPrefix).toBe('harness-improvement'); // default
    expect(config.maxTurns).toBe(100); // default
    expect(config.minReviewCycles).toBe(2);
    expect(config.maxReviewCycles).toBe(3); // default
  });

  // ===== 38. all four agent steps are resolved =====
  it('should resolve all four agent steps', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.agents).toHaveProperty('backlog');
    expect(config.agents).toHaveProperty('plan');
    expect(config.agents).toHaveProperty('implement');
    expect(config.agents).toHaveProperty('review');

    // each should have backend and model
    expect(config.agents.backlog).toHaveProperty('backend');
    expect(config.agents.backlog).toHaveProperty('model');
    expect(config.agents.plan).toHaveProperty('backend');
    expect(config.agents.plan).toHaveProperty('model');
    expect(config.agents.implement).toHaveProperty('backend');
    expect(config.agents.implement).toHaveProperty('model');
    expect(config.agents.review).toHaveProperty('backend');
    expect(config.agents.review).toHaveProperty('model');
  });

  // ===== 39. Complex scenario: all config sources mixed =====
  it('should correctly merge all three sources: defaults, config file, and CLI args', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        target: '99',
        parallelism: '3',
        'branch-prefix': 'cli-prefix',
        'plan-agent': 'codex',
        'impl-model': 'gpt-custom',
        verbose: true,
      },
    });
    mockReadFileSync.mockImplementation(() => {
      return JSON.stringify({
        target: 50,
        parallelism: 5,
        branchPrefix: 'config-prefix',
        maxTurns: 75,
        agent: 'claude',
        agents: {
          backlog: { model: 'backlog-custom' },
          review: { backend: 'codex' },
        },
      });
    });
    const config = resolveConfig();

    // CLI overrides config
    expect(config.target).toBe(99);
    expect(config.parallelism).toBe(3);
    expect(config.branchPrefix).toBe('cli-prefix');
    expect(config.verbose).toBe(true);

    // Config provides when CLI doesn't
    expect(config.maxTurns).toBe(75);

    // Defaults apply when neither CLI nor config
    expect(config.minReviewCycles).toBe(2);
    expect(config.maxReviewCycles).toBe(3);

    // Agent resolution with multiple sources
    // backlog: config global agent (claude) applies, config-step model (backlog-custom) applies
    expect(config.agents.backlog.backend).toBe('claude');
    expect(config.agents.backlog.model).toBe('backlog-custom');

    // plan: CLI step-agent (codex) overrides config global agent (claude)
    expect(config.agents.plan.backend).toBe('codex');

    // implement: config global agent (claude) applies because explicit backend takes priority over model inference
    // CLI step-model is used but backend is NOT inferred from it when explicit backend exists in chain
    expect(config.agents.implement.backend).toBe('claude');
    expect(config.agents.implement.model).toBe('gpt-custom');

    // review: config step-backend (codex) applies, default model for that backend/role
    expect(config.agents.review.backend).toBe('codex');
    expect(config.agents.review.model).toBe('gpt-5.3-codex-spark');
  });

  // ===== 40. task is optional and undefined by default =====
  it('should have task as undefined when --task is not provided', async () => {
    mockParseArgs.mockReturnValue({ values: {} });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.task).toBeUndefined();
  });

  // ===== 41. task is preserved when provided =====
  it('should preserve task value when --task is provided', async () => {
    mockParseArgs.mockReturnValue({
      values: {
        task: 'Add comprehensive test coverage',
      },
    });
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const config = resolveConfig();

    expect(config.task).toBe('Add comprehensive test coverage');
  });
});
