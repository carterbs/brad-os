import type { z } from 'zod';
import {
  jevQuestionsSchema,
  jevResponseSchema,
} from '../schemas/mealplan-jev.schema.js';
import type { JevQuestion, JevAnswer } from '../shared.js';
import { logger } from '../runtime/logger.js';
import { AppError } from '../types/errors.js';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_MODEL = 'jev-1.13.0';
const MAX_ATTEMPTS = 3;
// Conservative character heuristic, not a token-limit guarantee; provider limit errors fail closed.
const MAX_REQUEST_CHARACTERS = 100000;
const MAX_CHOICE_OPTIONS = 255;
const PROBABILITY_SUM_TOLERANCE = 0.00001;

function timeoutError(): AppError {
  return new AppError(504, 'JEV_TIMEOUT', 'Meal-plan evaluation exceeded its time limit. Please try again.');
}

function invalidResponse(): AppError {
  return new AppError(502, 'JEV_INVALID_RESPONSE', 'Meal-plan evaluation returned an invalid response. No changes were made.');
}

function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) throw timeoutError();
}

/** Apply the same deadline to network IO, body reads, and retry delays. */
function withSignal<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(timeoutError());
      return;
    }
    const abort = (): void => reject(timeoutError());
    signal.addEventListener('abort', abort, { once: true });
    let pending: Promise<T>;
    try {
      pending = operation();
    } catch (error: unknown) {
      signal.removeEventListener('abort', abort);
      reject(error);
      return;
    }
    pending.then(
      (value: T): void => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown): void => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(timeoutError());
      return;
    }
    const abort = (): void => {
      clearTimeout(timer);
      reject(timeoutError());
    };
    const timer = setTimeout((): void => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, Math.min(delayMs, 2147483647));
    signal.addEventListener('abort', abort, { once: true });
  });
}

function retryDelay(headers: Headers | undefined, attempt: number): number {
  const fallback = 250 * 2 ** (attempt - 1);
  const milliseconds = headers?.get('retry-after-ms');
  if (milliseconds !== undefined && milliseconds !== null && milliseconds.trim() !== '') {
    const value = Number(milliseconds);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const retryAfter = headers?.get('retry-after');
  if (retryAfter === undefined || retryAfter === null || retryAfter.trim() === '') return fallback;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : fallback;
  const timestamp = Date.parse(retryAfter);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : fallback;
}

function serializeRequest(
  model: string,
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>
): string {
  const parsedQuestions = jevQuestionsSchema.safeParse(questions);
  if (!parsedQuestions.success || Object.keys(parsedQuestions.data).length === 0) {
    throw new AppError(500, 'JEV_INVALID_REQUEST', 'Meal-plan evaluation questions are invalid.');
  }
  for (const question of Object.values(parsedQuestions.data)) {
    if (question.type !== 'choice') continue;
    const count = Object.keys(question.criteria).length;
    if (count === 0) {
      throw new AppError(500, 'JEV_INVALID_REQUEST', 'Meal-plan evaluation requires at least one choice option.');
    }
    if (count > MAX_CHOICE_OPTIONS) {
      throw new AppError(502, 'JEV_REQUEST_TOO_LARGE', 'Meal-plan evaluation has too many choices. Please narrow the request.');
    }
  }
  let body: string;
  try {
    body = JSON.stringify({ model, state, questions: parsedQuestions.data });
  } catch {
    throw new AppError(500, 'JEV_INVALID_REQUEST', 'Meal-plan evaluation context is invalid.');
  }
  if (body.length > MAX_REQUEST_CHARACTERS) {
    throw new AppError(502, 'JEV_REQUEST_TOO_LARGE', 'Meal-plan evaluation context is too large. Please narrow the request.');
  }
  return body;
}

function validateAnswers(
  payload: unknown,
  model: string,
  questions: Record<string, JevQuestion>
): z.infer<typeof jevResponseSchema> {
  const parsed = jevResponseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.model !== model) throw invalidResponse();
  const { answers } = parsed.data;
  const names = Object.keys(questions);
  if (Object.keys(answers).length !== names.length) throw invalidResponse();
  for (const [name, question] of Object.entries(questions)) {
    if (!Object.hasOwn(answers, name)) throw invalidResponse();
    const answer = answers[name];
    if (answer === undefined || answer.type !== question.type) throw invalidResponse();
    if (question.type !== 'choice' || answer.type !== 'choice') continue;
    const options = Object.keys(question.criteria);
    if (!Object.hasOwn(question.criteria, answer.choice) || Object.keys(answer.probabilities).length !== options.length) {
      throw invalidResponse();
    }
    let sum = 0;
    let maximum = 0;
    for (const option of options) {
      if (!Object.hasOwn(answer.probabilities, option)) throw invalidResponse();
      const probability = answer.probabilities[option];
      if (probability === undefined) throw invalidResponse();
      sum += probability;
      maximum = Math.max(maximum, probability);
    }
    if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE || answer.probabilities[answer.choice] !== maximum) {
      throw invalidResponse();
    }
  }
  return parsed.data;
}

/** Native TypeSafe HTTP adapter; never sends meal data or provider bodies to logs. */
export async function evaluateJev(
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>,
  apiKey: string,
  signal: AbortSignal
): Promise<Record<string, JevAnswer>> {
  const model = process.env['JEV_MODEL'] ?? DEFAULT_MODEL;
  if (apiKey.trim() === '' || !/^jev-\d+\.\d+\.\d+$/.test(model) || model.trim() !== model) {
    throw new AppError(500, 'JEV_INVALID_CONFIG', 'Meal-plan evaluation requires an API key and a versioned Jev model.');
  }
  const body = serializeRequest(model, state, questions);
  const questionCount = Object.keys(questions).length;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    checkSignal(signal);
    let response: Response;
    try {
      response = await withSignal(() => fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal,
      }), signal);
    } catch {
      if (signal.aborted) throw timeoutError();
      if (attempt === MAX_ATTEMPTS) {
        throw new AppError(503, 'JEV_UNAVAILABLE', 'Meal-plan evaluation is temporarily unavailable. Please try again.');
      }
      logger.warn('mealplan:jev_retry', { model, question_count: questionCount, attempt });
      await waitForRetry(retryDelay(undefined, attempt), signal);
      continue;
    }
    checkSignal(signal);
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || (response.status >= 500 && response.status <= 599);
      // Do not read, log, or attach the provider's error body.
      void response.body?.cancel().catch((): void => {});
      if (!retryable) {
        throw new AppError(502, 'JEV_REQUEST_REJECTED', 'The meal-plan evaluation service rejected the request. No changes were made.');
      }
      if (attempt === MAX_ATTEMPTS) {
        throw new AppError(503, 'JEV_UNAVAILABLE', 'Meal-plan evaluation is temporarily unavailable. Please try again.');
      }
      logger.warn('mealplan:jev_retry', { model, question_count: questionCount, attempt });
      await waitForRetry(retryDelay(response.headers, attempt), signal);
      continue;
    }
    let payload: unknown;
    try {
      payload = await withSignal(() => response.json() as Promise<unknown>, signal);
    } catch (error: unknown) {
      if (signal.aborted) throw timeoutError();
      if (error instanceof TypeError) {
        if (attempt === MAX_ATTEMPTS) {
          throw new AppError(503, 'JEV_UNAVAILABLE', 'Meal-plan evaluation is temporarily unavailable. Please try again.');
        }
        logger.warn('mealplan:jev_retry', { model, question_count: questionCount, attempt });
        await waitForRetry(retryDelay(undefined, attempt), signal);
        continue;
      }
      throw invalidResponse();
    }
    checkSignal(signal);
    const validated = validateAnswers(payload, model, questions);
    const requestId = response.headers.get('x-typesafe-request-id');
    logger.info('mealplan:jev_request', {
      model,
      question_count: questionCount,
      ...(requestId !== null && /^[a-zA-Z0-9_.:-]{1,128}$/.test(requestId) ? { request_id: requestId } : {}),
      ...(validated.usage === undefined ? {} : validated.usage),
    });
    return validated.answers;
  }
  throw new AppError(503, 'JEV_UNAVAILABLE', 'Meal-plan evaluation is temporarily unavailable. Please try again.');
}
