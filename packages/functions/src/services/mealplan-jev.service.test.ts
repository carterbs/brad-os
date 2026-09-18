import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../types/errors.js';
import type { JevQuestion } from '../shared.js';
import { evaluateJev } from './mealplan-jev.service.js';

const { mockFetch, mockInfo, mockWarning } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockInfo: vi.fn(),
  mockWarning: vi.fn(),
}));

vi.mock('../runtime/logger.js', () => ({
  logger: { info: mockInfo, warn: mockWarning, error: vi.fn() },
}));

const questions: Record<string, JevQuestion> = {
  action: {
    type: 'choice',
    instructions: 'What change is requested?',
    criteria: { keep: 'No change', replace: 'Choose another meal' },
  },
  suitable: { type: 'noul', instructions: 'Does the meal fit?' },
};

function validPayload(): Record<string, unknown> {
  return {
    model: 'jev-1.13.0',
    answers: {
      action: {
        type: 'choice', choice: 'replace', confidence: 0.9,
        probabilities: { keep: 0.1, replace: 0.9 },
      },
      suitable: { type: 'noul', noul: 0.95 },
    },
    usage: { input_tokens: 100, output_tokens: 10 },
  };
}

function jsonResponse(payload: unknown = validPayload(), status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}

function evaluate(signal: AbortSignal = new AbortController().signal): ReturnType<typeof evaluateJev> {
  return evaluateJev({ feedback: 'private meal feedback' }, questions, 'private-api-key', signal);
}

async function expectFailure(code: string, statusCode: number, signal?: AbortSignal): Promise<void> {
  await expect(evaluate(signal)).rejects.toMatchObject({ code, statusCode });
}

describe('mealplan Jev HTTP adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('JEV_MODEL', 'jev-1.13.0');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uses the native endpoint, pinned model, named typed questions and shared signal', async () => {
    const signal = new AbortController().signal;
    mockFetch.mockResolvedValue(jsonResponse(undefined, 200, { 'x-typesafe-request-id': 'request-123' }));
    const answers = await evaluate(signal);
    expect(answers).toEqual(validPayload()['answers']);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(signal);
    expect(init.headers).toEqual({ Authorization: 'Bearer private-api-key', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'jev-1.13.0', state: { feedback: 'private meal feedback' }, questions,
    });
    expect(mockInfo).toHaveBeenCalledWith('mealplan:jev_request', expect.objectContaining({
      model: 'jev-1.13.0', question_count: 2, request_id: 'request-123',
      input_tokens: 100, output_tokens: 10,
    }));
  });

  it('defaults to the exact current model and accepts omitted optional usage', async () => {
    delete process.env['JEV_MODEL'];
    const payload = validPayload();
    delete payload['usage'];
    mockFetch.mockResolvedValue(jsonResponse(payload));
    await expect(evaluate()).resolves.toEqual(payload['answers']);
    const [, init] = mockFetch.mock.calls[0] as [unknown, RequestInit];
    expect(JSON.parse(init.body as string).model).toBe('jev-1.13.0');
  });

  it.each(['jev-latest', 'jev-preview', 'jev', 'other-1.13.0', '', 'jev-1.13.0\n', 'jev-1.13.0\r'])('rejects alias or invalid model %j before a request', async (model) => {
    vi.stubEnv('JEV_MODEL', model);
    await expectFailure('JEV_INVALID_CONFIG', 500);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a missing API key without exposing input', async () => {
    await expect(evaluateJev({}, questions, ' ', new AbortController().signal)).rejects.toMatchObject({
      code: 'JEV_INVALID_CONFIG', statusCode: 500,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects oversized snapshots and choice option counts without truncation or network calls', async () => {
    await expect(evaluateJev({ feedback: 'x'.repeat(100001) }, questions, 'key', new AbortController().signal))
      .rejects.toMatchObject({ code: 'JEV_REQUEST_TOO_LARGE', statusCode: 502 });
    const criteria = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [String(i), 'Meal']));
    await expect(evaluateJev({}, { action: { type: 'choice', instructions: 'Pick', criteria } }, 'key', new AbortController().signal))
      .rejects.toMatchObject({ code: 'JEV_REQUEST_TOO_LARGE', statusCode: 502 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects empty questions and empty choice criteria', async () => {
    await expect(evaluateJev({}, {}, 'key', new AbortController().signal))
      .rejects.toMatchObject({ code: 'JEV_INVALID_REQUEST', statusCode: 500 });
    await expect(evaluateJev({}, { empty: { type: 'choice', instructions: 'Pick', criteria: {} } }, 'key', new AbortController().signal))
      .rejects.toMatchObject({ code: 'JEV_INVALID_REQUEST', statusCode: 500 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('accepts 255 choice options and preserves explicit noul rubrics', async () => {
    const criteria = Object.fromEntries(Array.from({ length: 255 }, (_, i) => [String(i), `Meal ${i}`]));
    const probabilities = Object.fromEntries(Object.keys(criteria).map((option) => [option, option === '0' ? 1 : 0]));
    const boundedQuestions: Record<string, JevQuestion> = {
      meal: { type: 'choice', instructions: 'Pick a meal', criteria },
      suitable: { type: 'noul', instructions: 'Suitable?', criteria: { true: 'Fits', false: 'Does not fit' } },
    };
    mockFetch.mockResolvedValue(jsonResponse({
      model: 'jev-1.13.0',
      answers: { meal: { type: 'choice', choice: '0', confidence: 1, probabilities }, suitable: { type: 'noul', noul: 1 } },
    }));
    await expect(evaluateJev({}, boundedQuestions, 'key', new AbortController().signal)).resolves.toHaveProperty('meal.choice', '0');
    const [, init] = mockFetch.mock.calls[0] as [unknown, RequestInit];
    expect(JSON.parse(init.body as string).questions).toEqual(boundedQuestions);
  });

  it.each([400, 401, 403, 422])('does not retry HTTP %i or expose provider bodies', async (status) => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'private-api-key private meal feedback' }, status));
    await expectFailure('JEV_REQUEST_REJECTED', 502);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([mockInfo.mock.calls, mockWarning.mock.calls])).not.toContain('private');
  });

  it.each([408, 429, 500, 529])('retries HTTP %i and succeeds within three attempts', async (status) => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, status)).mockResolvedValueOnce(jsonResponse());
    const pending = evaluate();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual(validPayload()['answers']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops after three network failures and sanitizes exception messages', async () => {
    vi.useFakeTimers();
    mockFetch.mockRejectedValue(new Error('private-api-key private meal feedback'));
    const pending = expectFailure('JEV_UNAVAILABLE', 503);
    await vi.runAllTimersAsync();
    await pending;
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(JSON.stringify([mockInfo.mock.calls, mockWarning.mock.calls])).not.toContain('private');
  });

  it('retries a network failure while reading a successful response body', async () => {
    vi.useFakeTimers();
    const interrupted = jsonResponse();
    vi.spyOn(interrupted, 'json').mockRejectedValue(new TypeError('private network failure'));
    mockFetch.mockResolvedValueOnce(interrupted).mockResolvedValueOnce(jsonResponse());
    const pending = evaluate();
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual(validPayload()['answers']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([mockInfo.mock.calls, mockWarning.mock.calls])).not.toContain('private');
  });

  it('stops after three retryable HTTP failures', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(() => jsonResponse({}, 500));
    const pending = expectFailure('JEV_UNAVAILABLE', 503);
    await vi.runAllTimersAsync();
    await pending;
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    { 'retry-after': '2' },
    { 'retry-after-ms': '2000' },
    { 'retry-after': 'Thu, 01 Jan 2026 00:00:02 GMT' },
  ])('honors a server delay %j', async (headers) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 429, headers)).mockResolvedValueOnce(jsonResponse());
    const pending = evaluate();
    await vi.advanceTimersByTimeAsync(1999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual(validPayload()['answers']);
  });

  it('ignores malformed or negative retry headers and uses bounded backoff', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after-ms': 'invalid', 'retry-after': '-1' }))
      .mockResolvedValueOnce(jsonResponse());
    const pending = evaluate();
    await vi.advanceTimersByTimeAsync(249);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual(validPayload()['answers']);
  });

  it('does not fetch when the shared signal is already cancelled', async () => {
    const controller = new AbortController();
    controller.abort(new Error('private reason'));
    await expectFailure('JEV_TIMEOUT', 504, controller.signal);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cancels an in-flight request even if a fetch implementation never resolves', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(() => new Promise<Response>(() => {}));
    const pending = expectFailure('JEV_TIMEOUT', 504, controller.signal);
    await Promise.resolve();
    controller.abort();
    await pending;
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('cancels backoff instead of granting each retry a fresh deadline', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mockFetch.mockResolvedValue(jsonResponse({}, 429, { 'retry-after': '10' }));
    const pending = expectFailure('JEV_TIMEOUT', 504, controller.signal);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await pending;
    await vi.runAllTimersAsync();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels while reading the response body', async () => {
    const controller = new AbortController();
    const response = jsonResponse();
    vi.spyOn(response, 'json').mockImplementation(() => new Promise<unknown>(() => {}));
    mockFetch.mockResolvedValue(response);
    const pending = expectFailure('JEV_TIMEOUT', 504, controller.signal);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await pending;
  });

  it.each([
    null, {}, { model: 'jev-1.13.0', answers: {} },
    { ...validPayload(), model: 'jev-1.12.0' },
    { ...validPayload(), answers: { action: { type: 'noul', noul: 0.9 }, suitable: { type: 'noul', noul: 0.9 } } },
    { ...validPayload(), answers: { ...validPayload()['answers'] as object, extra: { type: 'noul', noul: 1 } } },
  ])('rejects malformed, missing, mistyped, or unexpected heads', async (payload) => {
    mockFetch.mockResolvedValue(jsonResponse(payload));
    await expectFailure('JEV_INVALID_RESPONSE', 502);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON without logging its body', async () => {
    mockFetch.mockResolvedValue(new Response('private-api-key malformed response'));
    await expectFailure('JEV_INVALID_RESPONSE', 502);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([mockInfo.mock.calls, mockWarning.mock.calls])).not.toContain('private');
  });

  it.each([
    { type: 'choice', choice: 'invented', confidence: 0.9, probabilities: { keep: 0.1, replace: 0.9 } },
    { type: 'choice', choice: 'keep', confidence: 0.9, probabilities: { keep: 0.1, replace: 0.9 } },
    { type: 'choice', choice: 'replace', confidence: -0.1, probabilities: { keep: 0.1, replace: 0.9 } },
    { type: 'choice', choice: 'replace', confidence: 1.1, probabilities: { keep: 0.1, replace: 0.9 } },
    { type: 'choice', choice: 'replace', confidence: 0.9, probabilities: { replace: 1 } },
    { type: 'choice', choice: 'replace', confidence: 0.9, probabilities: { keep: 0.1, replace: 0.9, extra: 0 } },
    { type: 'choice', choice: 'replace', confidence: 0.9, probabilities: { keep: 0.1, replace: 0.8 } },
    { type: 'choice', choice: 'replace', confidence: 0.9, probabilities: { keep: -0.1, replace: 1.1 } },
    { type: 'choice', choice: 'replace', confidence: 0.9, probabilities: { keep: '0.1', replace: 0.9 } },
  ])('rejects invalid choice distributions or confidence', async (action) => {
    const payload = validPayload();
    payload['answers'] = { action, suitable: { type: 'noul', noul: 0.9 } };
    mockFetch.mockResolvedValue(jsonResponse(payload));
    await expectFailure('JEV_INVALID_RESPONSE', 502);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1, '0.9'])('rejects nonfinite or invalid noul %j', async (noul) => {
    const payload = validPayload();
    payload['answers'] = { ...payload['answers'] as object, suitable: { type: 'noul', noul } };
    mockFetch.mockResolvedValue({ ...jsonResponse(), ok: true, headers: new Headers(), json: async (): Promise<unknown> => payload });
    await expectFailure('JEV_INVALID_RESPONSE', 502);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects nonfinite choice probabilities and confidence %j', async (invalid) => {
    for (const action of [
      { type: 'choice', choice: 'replace', confidence: invalid, probabilities: { keep: 0.1, replace: 0.9 } },
      { type: 'choice', choice: 'replace', confidence: 0.9, probabilities: { keep: invalid, replace: 0.9 } },
    ]) {
      const payload = validPayload();
      payload['answers'] = { action, suitable: { type: 'noul', noul: 0.9 } };
      const response = jsonResponse();
      vi.spyOn(response, 'json').mockResolvedValue(payload);
      mockFetch.mockResolvedValueOnce(response);
      await expectFailure('JEV_INVALID_RESPONSE', 502);
    }
  });

  it('accepts ties for highest probability and insignificant distribution rounding', async () => {
    for (const probabilities of [{ keep: 0.5, replace: 0.5 }, { keep: 0.5, replace: 0.5000001 }]) {
      const payload = validPayload();
      payload['answers'] = {
        action: { type: 'choice', choice: 'replace', confidence: 0, probabilities },
        suitable: { type: 'noul', noul: 0 },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(payload));
      await expect(evaluate()).resolves.toEqual(payload['answers']);
    }
  });

  it('never returns provider text or secrets as error details', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'private-api-key' }, 401));
    try {
      await evaluate();
      expect.fail('expected adapter failure');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AppError);
      expect(JSON.stringify(error)).not.toContain('private');
      expect((error as AppError).message).not.toContain('private');
      expect((error as AppError).details).toBeUndefined();
    }
  });
});
