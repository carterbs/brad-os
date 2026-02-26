import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatElapsed,
  Logger,
  StatusBar,
  statusBar,
} from './log.js';

const { mockAppendFileSync } = vi.hoisted(() => ({
  mockAppendFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  appendFileSync: mockAppendFileSync,
}));

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockAppendFileSync.mockReset();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('sets prefix when workerSlot is provided', async () => {
      const logger = new Logger('/test/log.jsonl', false, 5);
      // Access the prefix via a method that uses it
      logger.info('test');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W5]')
      );
    });

    it('does not set prefix when workerSlot is not provided', async () => {
      const logger = new Logger('/test/log.jsonl', false);
      logger.info('test');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).not.toMatch(/\[W\d+\]/);
    });

    it('sets verbose flag correctly', async () => {
      const logger = new Logger('/test/log.jsonl', true);
      logger.verboseMsg('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('adds the step label to worker prefix after setStep', async () => {
      const logger = new Logger('/test/log.jsonl', false, 1);
      logger.setStep('implement');
      logger.info('running');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W1:impl]')
      );
    });

    it('removes the step label from worker prefix after clearStep', async () => {
      const logger = new Logger('/test/log.jsonl', false, 1);
      logger.setStep('implement');
      logger.clearStep();
      logger.info('idle');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('[W1]');
      expect(call).not.toContain('[W1:impl]');
    });

    it('stores jsonlPath', async () => {
      const logger = new Logger('/test/path.jsonl');
      logger.jsonl({ event: 'error', message: 'test', ts: '12:00:00' });
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        '/test/path.jsonl',
        expect.any(String)
      );
    });
  });

  describe('info', () => {
    it('logs message with timestamp and info formatting', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('test message');
      expect(call).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 3);
      logger.info('test');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W3]')
      );
    });

    it('calls console.log not console.error', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.info('test');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('logs message with yellow color code', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.warn('warning message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('warning message');
      expect(call).toContain('\x1b[33m'); // YELLOW
      expect(call).toContain('\x1b[0m'); // RESET
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 2);
      logger.warn('warning');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W2]')
      );
    });

    it('calls console.log not console.error', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.warn('test');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('logs message with red color code', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0][0] as string;
      expect(call).toContain('error message');
      expect(call).toContain('\x1b[31m'); // RED
      expect(call).toContain('\x1b[0m'); // RESET
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 1);
      logger.error('error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W1]')
      );
    });

    it('calls console.error not console.log', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.error('test');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('logs message with green color code', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.success('success message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('success message');
      expect(call).toContain('\x1b[32m'); // GREEN
      expect(call).toContain('\x1b[0m'); // RESET
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 4);
      logger.success('done');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W4]')
      );
    });
  });

  describe('heading', () => {
    it('logs message with bold color code', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.heading('heading message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('heading message');
      expect(call).toContain('\x1b[1m'); // BOLD
      expect(call).toContain('\x1b[0m'); // RESET
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 6);
      logger.heading('title');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W6]')
      );
    });
  });

  describe('tool', () => {
    it('coalesces repeated tool calls within 300ms into a grouped entry', async () => {
      vi.useFakeTimers();
      try {
        const logger = new Logger('/test/log.jsonl');
        logger.tool('bash', 'first command');
        vi.advanceTimersByTime(100);
        logger.tool('bash', 'second command');

        vi.advanceTimersByTime(199);
        expect(consoleLogSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(consoleLogSpy).toHaveBeenCalledTimes(1);
        const call = consoleLogSpy.mock.calls[0][0] as string;
        expect(call).toContain('×2');
        expect(call).toContain('bash');
        expect(call).toContain('first command');
      } finally {
        vi.useRealTimers();
      }
    });
    it('logs tool name and summary with cyan color', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.tool('fetch', 'Fetched data from API');
      logger.flush();
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('fetch');
      expect(call).toContain('Fetched data from API');
      expect(call).toContain('\x1b[36m'); // CYAN
    });

    it('pads tool name to 6 characters', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.tool('abc', 'summary');
      logger.flush();
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      // The tool name should be padded
      expect(call).toMatch(/abc\s{3}/);
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 2);
      logger.tool('test', 'summary');
      logger.flush();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W2]')
      );
    });
  });

  describe('step tracking', () => {
    it('increments worker tool call counter', async () => {
      const logger = new Logger('/test/log.jsonl', false, 2);
      const updateWorkerSpy = vi.spyOn(statusBar, 'updateWorker');
      logger.incrementToolCalls();
      logger.incrementToolCalls();

      expect(updateWorkerSpy).toHaveBeenCalledTimes(2);
      expect(updateWorkerSpy.mock.calls[0]?.[0]).toBe(2);
      expect(updateWorkerSpy.mock.calls[0]?.[1]).toEqual({ toolCalls: 1 });
      expect(updateWorkerSpy.mock.calls[1]?.[1]).toEqual({ toolCalls: 2 });
    });
  });

  describe('verboseMsg', () => {
    it('logs when verbose is true', async () => {
      const logger = new Logger('/test/log.jsonl', true);
      logger.verboseMsg('verbose message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('verbose message');
    });

    it('does not log when verbose is false', async () => {
      const logger = new Logger('/test/log.jsonl', false);
      logger.verboseMsg('verbose message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('uses dim color when logging', async () => {
      const logger = new Logger('/test/log.jsonl', true);
      logger.verboseMsg('test');
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('\x1b[2m'); // DIM
    });

    it('includes prefix when workerSlot is set and verbose is true', async () => {
      const logger = new Logger('/test/log.jsonl', true, 3);
      logger.verboseMsg('test');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W3]')
      );
    });
  });

  describe('compaction', () => {
    it('calls warn with token count formatted to thousands', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.compaction(5500);
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('6k tokens'); // 5500 rounds to 6k
    });

    it('rounds tokens to nearest thousand', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.compaction(2400);
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('2k tokens');
    });

    it('includes context compacted message', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.compaction(1000);
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('Context compacted');
    });

    it('includes warning symbol', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.compaction(1000);
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('⚠');
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 1);
      logger.compaction(1000);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W1]')
      );
    });
  });

  describe('jsonl', () => {
    it('calls appendFileSync with correct path', async () => {
      const logger = new Logger('/my/test/log.jsonl');
      logger.jsonl({ event: 'error', message: 'test', ts: '12:00:00' });
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        '/my/test/log.jsonl',
        expect.any(String)
      );
    });

    it('writes event as JSON on a single line', async () => {
      const logger = new Logger('/test/log.jsonl');
      const event = {
        event: 'error',
        message: 'test',
        ts: '12:00:00',
      } as const;
      logger.jsonl(event);
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        '/test/log.jsonl',
        expect.stringContaining(JSON.stringify(event))
      );
    });

    it('appends newline after JSON', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.jsonl({ event: 'error', message: 'test', ts: '12:00:00' });
      const call = mockAppendFileSync.mock.calls[0];
      const written = call[1] as string;
      expect(written).toMatch(/\n$/);
    });

    it('enriches event with worker field when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 5);
      const event = { event: 'error', message: 'test', ts: '12:00:00' };
      logger.jsonl(event);
      const call = mockAppendFileSync.mock.calls[0];
      const written = call[1] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.worker).toBe(5);
    });

    it('does not add worker field when workerSlot is not set', async () => {
      const logger = new Logger('/test/log.jsonl');
      const event = { event: 'error', message: 'test', ts: '12:00:00' };
      logger.jsonl(event);
      const call = mockAppendFileSync.mock.calls[0];
      const written = call[1] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.worker).toBeUndefined();
    });

    it('does not overwrite worker field if event already has one', async () => {
      const logger = new Logger('/test/log.jsonl', false, 5);
      const event = {
        event: 'error',
        message: 'test',
        ts: '12:00:00',
        worker: 2,
      } as const;
      logger.jsonl(event);
      const call = mockAppendFileSync.mock.calls[0];
      const written = call[1] as string;
      const parsed = JSON.parse(written.trim());
      expect(parsed.worker).toBe(2); // Original value preserved
    });

    it('handles various event types', async () => {
      const logger = new Logger('/test/log.jsonl');

      const stepEvent = {
        event: 'step_start' as const,
        improvement: 1,
        step: 'plan' as const,
        backend: 'claude' as const,
        ts: '12:00:00',
      };
      logger.jsonl(stepEvent);
      expect(mockAppendFileSync).toHaveBeenCalled();
    });
  });

  describe('stepSummary', () => {
    it('logs step name and duration in seconds', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.stepSummary('plan', {
        backend: 'claude',
        turns: 3,
        costUsd: 1.23,
        tokens: 5000,
        durationMs: 5000,
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('plan');
      expect(call).toContain('5s');
    });

    it('logs turn count', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.stepSummary('implement', {
        backend: 'claude',
        turns: 7,
        costUsd: 2.5,
        tokens: 10000,
        durationMs: 10000,
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('7 turns');
    });

    it('shows cost for claude backend', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.stepSummary('review', {
        backend: 'claude',
        turns: 2,
        costUsd: 0.75,
        tokens: 3000,
        durationMs: 3000,
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('$0.75');
      expect(call).toContain('3k tok');
    });

    it('shows N/A for codex backend', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.stepSummary('backlog-refill', {
        backend: 'codex',
        turns: 1,
        costUsd: 0,
        tokens: 0,
        durationMs: 2000,
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('N/A');
    });

    it('includes checkmark symbol', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.stepSummary('merge', {
        backend: 'claude',
        turns: 1,
        costUsd: 0.5,
        tokens: 2000,
        durationMs: 1000,
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('✓');
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 2);
      logger.stepSummary('plan', {
        backend: 'claude',
        turns: 1,
        costUsd: 0.1,
        tokens: 500,
        durationMs: 1000,
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W2]')
      );
    });

    it('rounds duration to seconds', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.stepSummary('plan', {
        backend: 'claude',
        turns: 1,
        costUsd: 0.1,
        tokens: 500,
        durationMs: 1500,
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('2s'); // 1500ms rounds to 2s
    });

    it('formats cost with 2 decimal places', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.stepSummary('plan', {
        backend: 'claude',
        turns: 1,
        costUsd: 1.256,
        tokens: 500,
        durationMs: 1000,
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toMatch(/\$1\.26/); // 1.256 rounds to 1.26
    });

    it('rounds tokens to thousands', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.stepSummary('plan', {
        backend: 'claude',
        turns: 1,
        costUsd: 0.1,
        tokens: 5500,
        durationMs: 1000,
      });
      const call = consoleLogSpy.mock.calls[0][0] as string;
      expect(call).toContain('6k tok'); // 5500 rounds to 6k
    });
  });

  describe('improvementSummary', () => {
    it('logs box-drawing frame with improvement number', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.improvementSummary(5, []);
      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('Improvement #5 complete');
    });

    it('includes box-drawing characters', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.improvementSummary(1, []);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toMatch(/┏/); // Top-left corner
      expect(output).toMatch(/┗/); // Bottom-left corner
    });

    it('lists each step with duration and turns', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'plan' as const,
          backend: 'claude' as const,
          turns: 3,
          costUsd: 0.5,
          tokens: 2000,
          durationMs: 3000,
        },
        {
          step: 'implement' as const,
          backend: 'claude' as const,
          turns: 5,
          costUsd: 1.0,
          tokens: 4000,
          durationMs: 5000,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('plan:');
      expect(output).toContain('implement:');
      expect(output).toContain('3s');
      expect(output).toContain('5s');
      expect(output).toContain('3 turns');
      expect(output).toContain('5 turns');
    });

    it('shows cost for claude backend steps', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'plan' as const,
          backend: 'claude' as const,
          turns: 1,
          costUsd: 0.75,
          tokens: 3000,
          durationMs: 1000,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toMatch(/\$ 0\.75/);
      expect(output).toContain('3k tok');
    });

    it('shows N/A for codex backend steps', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'backlog-refill' as const,
          backend: 'codex' as const,
          turns: 2,
          costUsd: 0,
          tokens: 0,
          durationMs: 2000,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toMatch(/N\/A.*N\/A/);
      expect(output).toContain('[codex]');
    });

    it('shows totals for mixed backend steps (when claude is present)', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'plan' as const,
          backend: 'claude' as const,
          turns: 2,
          costUsd: 0.5,
          tokens: 2000,
          durationMs: 2000,
        },
        {
          step: 'implement' as const,
          backend: 'claude' as const,
          turns: 3,
          costUsd: 0.75,
          tokens: 3000,
          durationMs: 3000,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('Total:');
      expect(output).toContain('5s'); // 2000 + 3000 = 5000ms
      expect(output).toContain('5 turns'); // 2 + 3
      expect(output).toMatch(/\$ 1\.25/); // 0.5 + 0.75
      expect(output).toContain('5k tok'); // 2000 + 3000
    });

    it('shows totals without cost when only codex steps are present', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'backlog-refill' as const,
          backend: 'codex' as const,
          turns: 1,
          costUsd: 0,
          tokens: 0,
          durationMs: 1000,
        },
        {
          step: 'review' as const,
          backend: 'codex' as const,
          turns: 1,
          costUsd: 0,
          tokens: 0,
          durationMs: 2000,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('Total:');
      expect(output).toContain('3s'); // 1000 + 2000 = 3000ms
      expect(output).toContain('2 turns');
      // Should NOT have cost for codex-only steps
      expect(output).not.toMatch(/Total:.*\$/);
    });

    it('handles empty steps array', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.improvementSummary(1, []);
      expect(consoleLogSpy).toHaveBeenCalled();
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('Improvement #1 complete');
    });

    it('calculates totals correctly from multiple steps', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'plan' as const,
          backend: 'claude' as const,
          turns: 2,
          costUsd: 0.25,
          tokens: 1000,
          durationMs: 1000,
        },
        {
          step: 'implement' as const,
          backend: 'claude' as const,
          turns: 3,
          costUsd: 0.5,
          tokens: 2000,
          durationMs: 2000,
        },
        {
          step: 'review' as const,
          backend: 'claude' as const,
          turns: 1,
          costUsd: 0.25,
          tokens: 1000,
          durationMs: 1000,
        },
      ];
      logger.improvementSummary(2, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('Total:');
      expect(output).toContain('4s'); // (1000 + 2000 + 1000) / 1000
      expect(output).toContain('6 turns'); // 2 + 3 + 1
      expect(output).toMatch(/\$ 1\.00/); // 0.25 + 0.50 + 0.25
      expect(output).toContain('4k tok'); // (1000 + 2000 + 1000) / 1000
    });

    it('pads step names to 15 characters', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'plan' as const,
          backend: 'claude' as const,
          turns: 1,
          costUsd: 0.1,
          tokens: 1000,
          durationMs: 1000,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      // "plan:" should be padded to align columns
      expect(output).toContain('plan:');
    });

    it('includes prefix when workerSlot is set', async () => {
      const logger = new Logger('/test/log.jsonl', false, 3);
      logger.improvementSummary(1, []);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      expect(calls.some((c) => c.includes('[W3]'))).toBe(true);
    });

    it('handles high improvement numbers', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.improvementSummary(999, []);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('Improvement #999 complete');
    });

    it('formats duration correctly for sub-second completions', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'plan' as const,
          backend: 'claude' as const,
          turns: 1,
          costUsd: 0.05,
          tokens: 500,
          durationMs: 400,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('0s'); // 400ms rounds to 0s
    });

    it('formats costs with 2 decimal places', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'plan' as const,
          backend: 'claude' as const,
          turns: 1,
          costUsd: 0.126,
          tokens: 1000,
          durationMs: 1000,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toMatch(/\$ 0\.13/); // 0.126 rounds to 0.13
    });

    it('rounds tokens to thousands correctly', async () => {
      const logger = new Logger('/test/log.jsonl');
      const steps = [
        {
          step: 'plan' as const,
          backend: 'claude' as const,
          turns: 1,
          costUsd: 0.1,
          tokens: 4700,
          durationMs: 1000,
        },
      ];
      logger.improvementSummary(1, steps);
      const calls = consoleLogSpy.mock.calls.map((c) => c[0] as string);
      const output = calls.join('\n');
      expect(output).toContain('5k tok'); // 4700 rounds to 5k
    });
  });

  describe('integration scenarios', () => {
    it('supports chaining multiple log calls', async () => {
      const logger = new Logger('/test/log.jsonl', false, 1);
      logger.heading('Starting process');
      logger.info('Processing items');
      logger.tool('fetch', 'Got data');
      logger.success('Complete');
      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
    });

    it('logs to both console and jsonl separately', async () => {
      const logger = new Logger('/test/log.jsonl');
      logger.info('console message');
      logger.jsonl({
        event: 'error',
        message: 'jsonl message',
        ts: '12:00:00',
      });
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(mockAppendFileSync).toHaveBeenCalled();
    });

    it('maintains prefix consistency across all methods', async () => {
      const logger = new Logger('/test/log.jsonl', true, 5);
      logger.info('test');
      logger.warn('test');
      logger.error('test');
      logger.success('test');
      logger.heading('test');
      logger.tool('name', 'summary');
      logger.verboseMsg('test');
      logger.compaction(1000);

      // All calls except error should be to console.log
      const logCalls = consoleLogSpy.mock.calls.length;
      const errorCalls = consoleErrorSpy.mock.calls.length;
      expect(logCalls).toBe(7); // All except error
      expect(errorCalls).toBe(1); // Only error
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W5]')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[W5]')
      );
    });
  });

  describe('formatElapsed', () => {
    it('formats sub-second durations as seconds', async () => {
      expect(formatElapsed(999)).toBe('0s');
    });

    it('formats second durations as seconds', async () => {
      expect(formatElapsed(1000)).toBe('1s');
    });

    it('formats minute durations as mm:ss', async () => {
      expect(formatElapsed(61_000)).toBe('1m01s');
    });
  });

  describe('StatusBar', () => {
    it('writeLine logs directly when isTTY is false', () => {
      const previousIsTTY = process.stdout.isTTY;
      process.stdout.isTTY = false;
      const bar = new StatusBar();
      const writeSpy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      try {
        bar.writeLine('status plain');
        expect(consoleLogSpy).toHaveBeenCalledWith('status plain');
        expect(writeSpy).not.toHaveBeenCalled();
      } finally {
        writeSpy.mockRestore();
        process.stdout.isTTY = previousIsTTY;
      }
    });

    it('writeError logs directly to stderr when isTTY is false', () => {
      const previousIsTTY = process.stdout.isTTY;
      process.stdout.isTTY = false;
      const bar = new StatusBar();
      const writeSpy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      try {
        bar.writeError('status plain error');
        expect(consoleErrorSpy).toHaveBeenCalledWith('status plain error');
        expect(writeSpy).not.toHaveBeenCalled();
      } finally {
        writeSpy.mockRestore();
        process.stdout.isTTY = previousIsTTY;
      }
    });
  });
});
