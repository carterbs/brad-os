import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runStep } from './agent.js';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type {
  RunStepOptions,
  SDKResultSuccess,
  SDKResultError,
  SDKCompactBoundaryMessage,
  SDKAssistantMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { Config } from './types.js';
import type { Logger } from './log.js';

const {
  mockQuery,
  mockSpawn,
  mockReadFileSync,
  mockUnlinkSync,
  mockMkdtempSync,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockSpawn: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockMkdtempSync: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const actual = await vi.importActual<
    typeof import('@anthropic-ai/claude-agent-sdk')
  >('@anthropic-ai/claude-agent-sdk');
  return {
    ...actual,
    query: mockQuery,
  };
});

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process'
    );
  return {
    ...actual,
    spawn: mockSpawn,
  };
});

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    unlinkSync: mockUnlinkSync,
    mkdtempSync: mockMkdtempSync,
  };
});

// Helper to create a mock async iterable
async function* mockAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

// Helper to create mock logger
function createMockLogger(): Logger {
  return {
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
  } as any;
}

// Helper to create mock config
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    target: 1,
    parallelism: 1,
    branchPrefix: 'test',
    maxTurns: 10,
    verbose: false,
    repoDir: '/repo',
    worktreeDir: '/tmp/wt',
    minReviewCycles: 2,
    maxReviewCycles: 3,
    logFile: '/repo/log.jsonl',
    agents: {
      backlog: { backend: 'claude', model: 'opus' },
      plan: { backend: 'claude', model: 'opus' },
      implement: { backend: 'claude', model: 'sonnet' },
      review: { backend: 'claude', model: 'sonnet' },
    },
    ...overrides,
  };
}

// Helper to create mock child process
function createMockChild() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  return child as any;
}

// Helper to make RunStepOptions
function makeOptions(overrides: Partial<RunStepOptions> = {}): RunStepOptions {
  return {
    prompt: 'test prompt',
    stepName: 'implement',
    improvement: 1,
    cwd: '/repo',
    model: 'opus',
    backend: 'claude',
    config: makeConfig(),
    logger: createMockLogger(),
    abortController: new AbortController(),
    ...overrides,
  };
}

describe('agent.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('runStep', () => {
    it('dispatches to claude backend', async () => {
      const options = makeOptions({ backend: 'claude' });
      mockQuery.mockReturnValue(
        mockAsyncIterable([
          {
            type: 'result',
            subtype: 'success',
            result: 'output',
            num_turns: 1,
            total_cost_usd: 0.01,
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        ])
      );

      const result = await runStep(options);

      expect(mockQuery).toHaveBeenCalled();
      expect(result.backend).toBe('claude');
      expect(result.success).toBe(true);
    });

    it('dispatches to codex backend', async () => {
      const options = makeOptions({ backend: 'codex' });
      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/test');
      mockReadFileSync.mockReturnValue('codex output');

      const promise = runStep(options);

      vi.runAllTimersAsync();
      mockChild.emit('close', 0);

      const result = await promise;

      expect(mockSpawn).toHaveBeenCalledWith('codex', expect.any(Array), {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect(result.backend).toBe('codex');
    });
  });

  describe('runStepClaude', () => {
    it('successful step with result', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        stepName: 'implement',
      });

      const resultMessage: SDKResultSuccess = {
        type: 'result',
        subtype: 'success',
        result: 'Implementation complete',
        num_turns: 3,
        total_cost_usd: 0.05,
        usage: { input_tokens: 1000, output_tokens: 500 },
      };

      mockQuery.mockReturnValue(mockAsyncIterable([resultMessage]));

      const result = await runStep(options);

      expect(result.success).toBe(true);
      expect(result.outputText).toBe('Implementation complete');
      expect(result.turns).toBe(3);
      expect(result.costUsd).toBe(0.05);
      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
      expect(result.backend).toBe('claude');
      expect(logger.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'step_start' })
      );
      expect(logger.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'step_end' })
      );
    });

    it('failed step with error subtype', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'claude', logger });

      const errorMessage: SDKResultError = {
        type: 'result',
        subtype: 'error',
        errors: ['tool execution failed', 'permissions denied'],
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockQuery.mockReturnValue(mockAsyncIterable([errorMessage]));

      const result = await runStep(options);

      expect(result.success).toBe(false);
      expect(result.outputText).toBe('');
      expect(result.turns).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('ended with error')
      );
    });

    it('no result message received', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'claude', logger });

      mockQuery.mockReturnValue(mockAsyncIterable([]));

      const result = await runStep(options);

      expect(result.success).toBe(false);
      expect(result.outputText).toBe('');
      expect(result.turns).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('no result message')
      );
    });

    it('handles compaction message', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'claude', logger });

      const compactionMessage: SDKCompactBoundaryMessage = {
        type: 'system',
        subtype: 'compact_boundary',
        compact_metadata: {
          pre_tokens: 50000,
        },
      };

      const resultMessage: SDKResultSuccess = {
        type: 'result',
        subtype: 'success',
        result: 'done',
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockQuery.mockReturnValue(
        mockAsyncIterable([compactionMessage, resultMessage])
      );

      await runStep(options);

      expect(logger.compaction).toHaveBeenCalledWith(50000);
      expect(logger.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'compaction', pre_tokens: 50000 })
      );
    });

    it('logs verbose assistant messages when enabled', async () => {
      const logger = createMockLogger();
      const config = makeConfig({ verbose: true });
      const options = makeOptions({
        backend: 'claude',
        logger,
        config,
      });

      const assistantMessage: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'This is my reasoning for the implementation...',
            },
          ],
        },
      };

      const resultMessage: SDKResultSuccess = {
        type: 'result',
        subtype: 'success',
        result: 'done',
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockQuery.mockReturnValue(
        mockAsyncIterable([assistantMessage, resultMessage])
      );

      await runStep(options);

      expect(logger.verboseMsg).toHaveBeenCalledWith(
        expect.stringContaining('This is my reasoning')
      );
    });

    it('skips verbose logging when verbose is false', async () => {
      const logger = createMockLogger();
      const config = makeConfig({ verbose: false });
      const options = makeOptions({
        backend: 'claude',
        logger,
        config,
      });

      const assistantMessage: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'This is reasoning',
            },
          ],
        },
      };

      const resultMessage: SDKResultSuccess = {
        type: 'result',
        subtype: 'success',
        result: 'done',
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockQuery.mockReturnValue(
        mockAsyncIterable([assistantMessage, resultMessage])
      );

      await runStep(options);

      expect(logger.verboseMsg).not.toHaveBeenCalled();
    });

    it('passes pre-tool hook to query', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'claude', logger });

      mockQuery.mockReturnValue(
        mockAsyncIterable([
          {
            type: 'result',
            subtype: 'success',
            result: 'done',
            num_turns: 1,
            total_cost_usd: 0.01,
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        ])
      );

      await runStep(options);

      expect(mockQuery).toHaveBeenCalled();
      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.options.hooks.PreToolUse).toBeDefined();
    });

    it('passes post-tool hook to query', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'claude', logger });

      mockQuery.mockReturnValue(
        mockAsyncIterable([
          {
            type: 'result',
            subtype: 'success',
            result: 'done',
            num_turns: 1,
            total_cost_usd: 0.01,
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        ])
      );

      await runStep(options);

      expect(mockQuery).toHaveBeenCalled();
      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.options.hooks.PostToolUse).toBeDefined();
    });

    it('handles thrown error from query', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'claude', logger });

      mockQuery.mockImplementation(() => {
        throw new Error('SDK connection failed');
      });

      const result = await runStep(options);

      expect(result.success).toBe(false);
      expect(result.outputText).toBe('');
      expect(result.turns).toBe(0);
      expect(result.costUsd).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('SDK connection failed')
      );
    });

    it('handles thrown non-Error value from query', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'claude', logger });

      mockQuery.mockImplementation(() => {
        // Throw a non-Error value to test the String(err) branch
        throw 'string error message';
      });

      const result = await runStep(options);

      expect(result.success).toBe(false);
      expect(result.outputText).toBe('');
      expect(result.turns).toBe(0);
      expect(result.costUsd).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('string error message')
      );
    });

    it('respects abort signal', async () => {
      const abortController = new AbortController();
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        abortController,
      });

      abortController.abort();

      mockQuery.mockReturnValue(
        mockAsyncIterable([
          {
            type: 'result',
            subtype: 'success',
            result: 'done',
            num_turns: 1,
            total_cost_usd: 0.01,
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        ])
      );

      await runStep(options);

      expect(mockQuery).toHaveBeenCalled();
      const queryCall = mockQuery.mock.calls[0][0];
      expect(queryCall.options.abortController).toBe(abortController);
    });

    it('truncates verbose messages to 200 chars', async () => {
      const logger = createMockLogger();
      const config = makeConfig({ verbose: true });
      const options = makeOptions({
        backend: 'claude',
        logger,
        config,
      });

      const longText = 'a'.repeat(300) + ' this part should be cut off';

      const assistantMessage: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: longText,
            },
          ],
        },
      };

      const resultMessage: SDKResultSuccess = {
        type: 'result',
        subtype: 'success',
        result: 'done',
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockQuery.mockReturnValue(
        mockAsyncIterable([assistantMessage, resultMessage])
      );

      await runStep(options);

      expect(logger.verboseMsg).toHaveBeenCalledWith(expect.any(String));
      const call = (logger.verboseMsg as any).mock.calls[0][0];
      expect(call.length).toBe(200);
    });

    it('records duration time', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'claude', logger });

      mockQuery.mockReturnValue(
        mockAsyncIterable([
          {
            type: 'result',
            subtype: 'success',
            result: 'done',
            num_turns: 1,
            total_cost_usd: 0.01,
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        ])
      );

      const result = await runStep(options);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('logs step_start event', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        stepName: 'implement',
        improvement: 5,
      });

      mockQuery.mockReturnValue(
        mockAsyncIterable([
          {
            type: 'result',
            subtype: 'success',
            result: 'done',
            num_turns: 1,
            total_cost_usd: 0.01,
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        ])
      );

      await runStep(options);

      expect(logger.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'step_start',
          step: 'implement',
          improvement: 5,
          backend: 'claude',
        })
      );
    });

    it('handles assistant message without text content', async () => {
      const logger = createMockLogger();
      const config = makeConfig({ verbose: true });
      const options = makeOptions({
        backend: 'claude',
        logger,
        config,
      });

      const assistantMessage: SDKAssistantMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-123',
              name: 'Bash',
              input: {},
            },
          ],
        },
      };

      const resultMessage: SDKResultSuccess = {
        type: 'result',
        subtype: 'success',
        result: 'done',
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      mockQuery.mockReturnValue(
        mockAsyncIterable([assistantMessage, resultMessage])
      );

      await runStep(options);

      expect(logger.verboseMsg).not.toHaveBeenCalled();
    });
  });

  describe('runStepCodex', () => {
    it('successful codex step', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
        model: 'codex-002',
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('Codex implementation result');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              num_turns: 2,
              usage: { input_tokens: 500, output_tokens: 250 },
              last_agent_message: 'Implementation complete',
            }) + '\n'
          )
        );
      }, 0);

      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 10);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.backend).toBe('codex');
      expect(result.turns).toBe(1);
      expect(result.inputTokens).toBe(500);
      expect(result.outputTokens).toBe(250);
    });

    it('codex step with output file', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('Content from output file');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              usage: { input_tokens: 100, output_tokens: 50 },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toBe('Content from output file');
      expect(mockReadFileSync).toHaveBeenCalled();
    });

    it('codex step falls back to last agent message', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', content: 'Fallback message' },
            }) + '\n'
          )
        );
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              usage: { input_tokens: 100, output_tokens: 50 },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toBe('Fallback message');
    });

    it('codex spawn error', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.emit('error', new Error('spawn ENOENT: codex not found'));
        mockChild.emit('close', 1);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('codex turn.failed event', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.failed',
              error: { message: 'Tool execution failed' },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('codex non-zero exit code', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.emit('close', 1);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
    });

    it('codex abort signal kills child process', async () => {
      const abortController = new AbortController();
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
        abortController,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        abortController.abort();
      }, 5);

      setTimeout(() => {
        expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
        mockChild.emit('close', 0);
      }, 10);

      vi.runAllTimersAsync();
      await promise;

      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('codex command_execution tool logging', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.started',
              item: { type: 'command_execution', command: 'npm run build' },
            }) + '\n'
          )
        );
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'command_execution' },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      expect(logger.tool).toHaveBeenCalledWith('Bash', 'npm run build');
      expect(logger.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'tool_call',
          tool: 'Bash',
        })
      );
    });

    it('codex verbose mode logs agent messages', async () => {
      const logger = createMockLogger();
      const config = makeConfig({ verbose: true });
      const options = makeOptions({
        backend: 'codex',
        logger,
        config,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'Verbose agent reasoning' },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      expect(logger.verboseMsg).toHaveBeenCalledWith(
        expect.stringContaining('Verbose agent')
      );
    });

    it('codex error events in stream', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'error',
              message: 'Tool execution timed out',
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
    });

    it('codex logs step_start and step_end events', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
        stepName: 'plan',
        improvement: 2,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      expect(logger.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'step_start',
          step: 'plan',
          backend: 'codex',
          improvement: 2,
        })
      );
      expect(logger.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'step_end',
          step: 'plan',
          backend: 'codex',
        })
      );
    });

    it('codex handles long command truncation', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      const longCmd = 'npm install ' + 'package-name '.repeat(20);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.started',
              item: { type: 'command_execution', command: longCmd },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      const toolCall = (logger.tool as any).mock.calls.find(
        (call: any) => call[0] === 'Bash'
      );
      expect(toolCall).toBeDefined();
      expect(toolCall[1]).toMatch(/\.\.\./);
      expect(toolCall[1].length).toBeLessThanOrEqual(63);
    });

    it('codex handles stderr with verbose mode', async () => {
      const logger = createMockLogger();
      const config = makeConfig({ verbose: true });
      const options = makeOptions({
        backend: 'codex',
        logger,
        config,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stderr.emit(
          'data',
          Buffer.from('Warning: deprecated package\n')
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      expect(logger.verboseMsg).toHaveBeenCalled();
    });

    it('codex handles multiline JSONL output', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        const jsonl =
          JSON.stringify({
            type: 'turn.completed',
            usage: { input_tokens: 100, output_tokens: 50 },
          }) +
          '\n' +
          JSON.stringify({
            type: 'turn.completed',
            usage: { input_tokens: 200, output_tokens: 100 },
          }) +
          '\n';
        mockChild.stdout.emit('data', Buffer.from(jsonl));
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.inputTokens).toBe(300);
      expect(result.outputTokens).toBe(150);
      expect(result.turns).toBe(2);
    });

    it('codex accumulates multiple command events', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.started',
              item: { type: 'command_execution', command: 'npm install' },
            }) + '\n'
          )
        );
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'command_execution' },
            }) + '\n'
          )
        );
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.started',
              item: { type: 'command_execution', command: 'npm run test' },
            }) + '\n'
          )
        );
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'command_execution' },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      expect(logger.tool).toHaveBeenCalledWith('Bash', 'npm install');
      expect(logger.tool).toHaveBeenCalledWith('Bash', 'npm run test');
    });

    it('codex handles agent_message in item.completed', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: {
                type: 'agent_message',
                message: { content: 'Agent thinking...' },
              },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toContain('Agent thinking');
    });

    it('codex handles review_output type', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'review_output',
              review_output: 'Review approved with suggestions',
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toContain('Review approved');
    });

    it('codex handles turn.failed with nested error message', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.failed',
              error: { message: 'Nested error message' },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('turn_failed=true')
      );
    });

    it('codex handles turn.failed without error field', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.failed',
              message: 'Top level message',
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
    });

    it('codex stdin receives prompt', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
        prompt: 'Test prompt content',
      });

      const mockChild = createMockChild();
      const writeSpyFn = vi.spyOn(mockChild.stdin, 'write');
      const endSpyFn = vi.spyOn(mockChild.stdin, 'end');
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      expect(writeSpyFn).toHaveBeenCalledWith('Test prompt content');
      expect(endSpyFn).toHaveBeenCalled();
    });

    it('codex cleans up output file on success', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('output content');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/codex-test/output.txt');
    });

    it('codex ignores cleanup errors', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('output');
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeDefined();
    });

    it('codex emits turn.completed with no usage', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.turns).toBe(1);
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });

    it('codex stderr filtering in error detail', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stderr.emit(
          'data',
          Buffer.from(
            'Some debug output\nERROR: connection failed\nMore debug\n'
          )
        );
        mockChild.emit('close', 1);
      }, 0);

      vi.runAllTimersAsync();
      await promise;

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: connection failed')
      );
    });

    it('codex handles malformed JSON lines gracefully', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            'This is not valid JSON\n' +
              JSON.stringify({
                type: 'turn.completed',
                usage: { input_tokens: 100, output_tokens: 50 },
              }) +
              '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.turns).toBe(1);
    });

    it('codex turn.failed with no error or message field uses fallback', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.failed',
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('codex handles error event with empty message', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'error',
              message: '',
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
    });

    it('codex handles buffered output at close', async () => {
      const logger = createMockLogger();
      const options = makeOptions({ backend: 'codex', logger });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        const bufferedData = JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 100, output_tokens: 50 },
        });
        mockChild.stdout.emit('data', Buffer.from(bufferedData));
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.turns).toBe(1);
    });
  });

  describe('summarizeToolInput', () => {
    it('summarizes Read tool with file_path', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          await preHook({
            tool_name: 'Read',
            tool_input: { file_path: '/repo/src/file.ts' },
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('Read', 'src/file.ts');
    });

    it('summarizes Grep tool with pattern and path', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          await preHook({
            tool_name: 'Grep',
            tool_input: { pattern: 'export const', path: '/repo/src' },
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith(
        'Grep',
        expect.stringContaining('export const')
      );
    });

    it('summarizes Bash tool with long command (truncated)', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          const longCmd = 'npm install ' + 'some-long-package-name-'.repeat(10);
          await preHook({
            tool_name: 'Bash',
            tool_input: { command: longCmd },
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      const toolCall = (logger_mock.tool as any).mock.calls.find(
        (call: any) => call[0] === 'Bash'
      );
      expect(toolCall[1]).toMatch(/\.\.\.$/);
    });

    it('summarizes Task tool with description', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          await preHook({
            tool_name: 'Task',
            tool_input: { description: 'Run all tests in parallel' },
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith(
        'Task',
        'Run all tests in parallel'
      );
    });

    it('unknown tool returns empty string', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          await preHook({
            tool_name: 'UnknownTool',
            tool_input: { someField: 'value' },
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('UnknownTool', '');
    });

    it('handles Read/Write/Edit with non-string file_path', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          // file_path is not a string - should return ""
          await preHook({
            tool_name: 'Read',
            tool_input: { file_path: 123 }, // Not a string
          });
          // Also test Edit and Write
          await preHook({
            tool_name: 'Edit',
            tool_input: { file_path: null }, // null instead of string
          });
          await preHook({
            tool_name: 'Write',
            tool_input: { file_path: {} }, // object instead of string
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      // All three should have been called with empty string
      expect(logger_mock.tool).toHaveBeenCalledWith('Read', '');
      expect(logger_mock.tool).toHaveBeenCalledWith('Edit', '');
      expect(logger_mock.tool).toHaveBeenCalledWith('Write', '');
    });

    it('handles Glob with non-string pattern', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          // pattern is not a string - should return ""
          await preHook({
            tool_name: 'Glob',
            tool_input: { pattern: 42 }, // Not a string
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('Glob', '');
    });

    it('handles Grep with non-string pattern or path', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          // pattern is not a string - should use "" and default path to "."
          await preHook({
            tool_name: 'Grep',
            tool_input: { pattern: null, path: '/repo/src' },
          });
          // path is not a string - should use default "."
          await preHook({
            tool_name: 'Grep',
            tool_input: { pattern: 'export', path: false },
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('Grep', '"" in src');
      expect(logger_mock.tool).toHaveBeenCalledWith('Grep', '"export" in .');
    });

    it('handles Bash with non-string command', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          // command is not a string - should return ""
          await preHook({
            tool_name: 'Bash',
            tool_input: { command: 99 }, // Not a string
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('Bash', '');
    });

    it('handles Task with non-string description', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          // description is not a string - should return ""
          await preHook({
            tool_name: 'Task',
            tool_input: { description: ['array', 'not', 'string'] }, // Not a string
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('Task', '');
    });
  });

  describe('extractTextContent', () => {
    it('extracts string directly', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'direct string' },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toContain('direct string');
    });

    it('extracts from object with text key', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'extracted text' },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toContain('extracted text');
    });

    it('extracts from array of strings', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: {
                type: 'agent_message',
                content: ['line 1', 'line 2'],
              },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toContain('line 1');
    });

    it('handles null/undefined values', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: null },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toBe('');
    });

    it('limits depth to 5 levels', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        const deeplyNested = {
          type: 'item.completed',
          item: {
            type: 'agent_message',
            content: {
              level1: {
                level2: {
                  level3: {
                    level4: {
                      level5: {
                        level6: 'too deep',
                      },
                    },
                  },
                },
              },
            },
          },
        };
        mockChild.stdout.emit(
          'data',
          Buffer.from(JSON.stringify(deeplyNested) + '\n')
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.outputText).toBe('');
    });

    it('handles non-object/non-array/non-string values', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        // Send various non-object/non-array/non-string values
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: {
                type: 'agent_message',
                message: 123, // number
                content: true, // boolean
                text: false, // boolean
              },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      // Non-string primitives should be ignored/return ""
      expect(result.outputText).toBe('');
    });

    it('pre-tool hook with undefined tool_input', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        stepName: 'review',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          // Call with undefined tool_input - should use {} as fallback
          await preHook({
            tool_name: 'CustomTool',
            // tool_input is undefined
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('CustomTool', '');
      expect(logger_mock.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'tool_call', tool: 'CustomTool' })
      );
    });

    it('invokes post-tool hook after tool execution', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        stepName: 'implement',
      });

      let capturedPostHook: any = null;

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        capturedPostHook =
          callArgs?.options?.hooks?.PostToolUse?.[0]?.hooks?.[0];

        if (capturedPostHook) {
          await capturedPostHook({
            tool_name: 'Read',
            tool_input: { file_path: '/repo/test.ts' },
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
      });

      expect(logger_mock.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'tool_result', tool: 'Read' })
      );
    });

    it('post-tool hook uses unknown when tool_name is undefined', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        stepName: 'implement',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const postHook = callArgs?.options?.hooks?.PostToolUse?.[0]?.hooks?.[0];

        if (postHook) {
          // Call with undefined tool_name - should default to "unknown"
          await postHook({
            tool_input: { file_path: '/repo/test.ts' },
            // tool_name is undefined
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
      });

      expect(logger_mock.jsonl).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'tool_result', tool: 'unknown' })
      );
    });

    it('ignores invalid JSON lines in codex stdout', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('output from codex');

      const promise = runStep(options);

      setTimeout(() => {
        // Send invalid JSON (malformed)
        mockChild.stdout.emit('data', Buffer.from('not valid json\n'));
        // Send valid JSON
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              usage: { input_tokens: 100, output_tokens: 50 },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      // Should still succeed and have the output file content
      expect(result.success).toBe(true);
      expect(result.outputText).toBe('output from codex');
    });

    it('handles turn.failed event with fallback error message', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
        stepName: 'implement',
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        // Send turn.failed event with no error message or event.message
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.failed',
              error: {}, // No message field
              // No message field at event level either
            }) + '\n'
          )
        );
        mockChild.emit('close', 1);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          '(code=1, turn_completed=false, turn_failed=true)'
        )
      );
    });
  });

  describe('summarizeToolInput edge cases', () => {
    it('Read tool with non-string file_path', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          await preHook({
            tool_name: 'Read',
            tool_input: { file_path: 123 }, // Non-string
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('Read', '');
    });

    it('Glob tool with non-string pattern', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'claude',
        logger,
        cwd: '/repo',
      });

      mockQuery.mockImplementation(async function* () {
        const callArgs = mockQuery.mock.calls[0][0];
        const preHook = callArgs?.options?.hooks?.PreToolUse?.[0]?.hooks?.[0];

        if (preHook) {
          await preHook({
            tool_name: 'Glob',
            tool_input: { pattern: null }, // Non-string
          });
        }

        yield {
          type: 'result',
          subtype: 'success',
          result: 'done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      });

      const logger_mock = createMockLogger();
      await runStep({
        ...options,
        logger: logger_mock,
        cwd: '/repo',
      });

      expect(logger_mock.tool).toHaveBeenCalledWith('Glob', '');
    });

    it('codex turn.completed with undefined usage', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('output');

      const promise = runStep(options);

      setTimeout(() => {
        // Send turn.completed without usage field - should use 0 via ??
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              // No usage field
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });

    it('codex turn.completed with partial usage (missing input_tokens or output_tokens)', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('output');

      const promise = runStep(options);

      setTimeout(() => {
        // Send turn.completed with usage object that has undefined fields
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              usage: {
                // Only input_tokens, no output_tokens
                input_tokens: 150,
              },
            }) + '\n'
          )
        );
        // Send another turn.completed with undefined input_tokens
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              usage: {
                // Only output_tokens, no input_tokens
                output_tokens: 75,
              },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.inputTokens).toBe(150); // First turn's input_tokens
      expect(result.outputTokens).toBe(75); // Second turn's output_tokens
    });

    it('codex handles empty stdout buffer at close', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('final output');

      const promise = runStep(options);

      setTimeout(() => {
        // Send data that leaves an incomplete line in buffer
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              usage: { input_tokens: 100, output_tokens: 50 },
            })
          )
        );
        // Close without emitting final newline - buffer will be empty when checked
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.outputText).toBe('final output');
    });

    it('codex handles non-object item in tool logging', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('');

      const promise = runStep(options);

      setTimeout(() => {
        // Send item.started with undefined command
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.started',
              item: { type: 'command_execution', command: undefined },
            }) + '\n'
          )
        );
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'command_execution' },
            }) + '\n'
          )
        );
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              usage: { input_tokens: 100, output_tokens: 50 },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      // Command should default to "" when undefined
      expect(logger.tool).toHaveBeenCalledWith('Bash', '');
    });

    it('codex stdout buffer with empty split result', async () => {
      const logger = createMockLogger();
      const options = makeOptions({
        backend: 'codex',
        logger,
      });

      const mockChild = createMockChild();
      mockSpawn.mockReturnValue(mockChild);
      mockMkdtempSync.mockReturnValue('/tmp/codex-test');
      mockReadFileSync.mockReturnValue('output');

      const promise = runStep(options);

      setTimeout(() => {
        // Send empty data - split("\n") will result in array with single empty string
        // When we pop that, we get "", and ?? "" keeps it as ""
        mockChild.stdout.emit('data', Buffer.from(''));
        // Then send valid JSON
        mockChild.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'turn.completed',
              usage: { input_tokens: 100, output_tokens: 50 },
            }) + '\n'
          )
        );
        mockChild.emit('close', 0);
      }, 0);

      vi.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.outputText).toBe('output');
    });
  });
});
