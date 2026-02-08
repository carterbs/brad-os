/**
 * Cycling Coach Service
 *
 * Integrates with OpenAI to generate personalized cycling training recommendations
 * based on recovery data, training load, and periodization.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { info, warn, error as logError } from 'firebase-functions/logger';
import type {
  CyclingCoachRequest,
  CyclingCoachResponse,
  SessionRecommendation,
} from '../shared.js';

const OPENAI_MODEL = 'gpt-4o';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the system prompt for the cycling coach.
 */
export function buildSystemPrompt(trainingPhilosophy: string): string {
  return `You are an AI cycling coach implementing the evidence-based training framework below.

## Training Philosophy
${trainingPhilosophy}

## Your Role
- Prescribe today's session based on the framework, recovery data, and training load
- For Tuesday (Session 1): VO2max intervals - adjust interval count based on recovery
- For Thursday (Session 2): Threshold/sweet spot - adjust duration based on recovery
- For Saturday (Session 3): ALWAYS prescribe "fun" - no structured workout
- When recovery is poor: Reduce volume, not intensity
- When overreaching detected: Suggest recovery ride or day off
- Consider lifting schedule when prescribing intensity

## Decision Framework
1. Check session type (vo2max/threshold/fun)
2. Assess recovery state and load
3. Consider week in block (periodization phase)
4. Account for lifting interference
5. Prescribe appropriate volume for the day

## Power Zones (% of FTP)
- Z1 Active Recovery: <55%
- Z2 Endurance: 56-75%
- Z3 Tempo: 76-90%
- Z4 Lactate Threshold: 91-105%
- Z5 VO2max: 106-120%
- Z6 Anaerobic: 121-150%

## Response Format
Respond with a valid JSON object matching this exact schema:
{
  "session": {
    "type": "vo2max" | "threshold" | "fun" | "recovery" | "off",
    "durationMinutes": number,
    "intervals": {
      "protocol": string,
      "count": number,
      "workSeconds": number,
      "restSeconds": number,
      "targetPowerPercent": { "min": number, "max": number }
    } | null,
    "targetTSS": { "min": number, "max": number },
    "targetZones": string
  },
  "reasoning": string,
  "coachingTips": string[],
  "warnings": [{ "type": string, "message": string }] | null,
  "suggestFTPTest": boolean
}

Important notes:
- intervals should be null for fun, recovery, or off sessions
- targetZones should describe the power zones to target (e.g., "Z5-Z6 for work intervals, Z1-Z2 for recovery")
- reasoning should explain why you made this prescription
- coachingTips should be 2-3 actionable tips for the session
- warnings should flag any concerns (low recovery, high fatigue, FTP may be stale)
- suggestFTPTest should be true if FTP hasn't been tested in 8+ weeks`;
}

/**
 * Validates that a parsed response matches the CyclingCoachResponse shape.
 */
function isValidCoachResponse(data: unknown): data is CyclingCoachResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check required fields
  if (typeof obj['reasoning'] !== 'string') {
    return false;
  }

  // Check session object
  const session = obj['session'];
  if (typeof session !== 'object' || session === null) {
    return false;
  }

  const sessionObj = session as Record<string, unknown>;
  const validTypes = ['vo2max', 'threshold', 'fun', 'recovery', 'off'];
  if (!validTypes.includes(sessionObj['type'] as string)) {
    return false;
  }

  if (typeof sessionObj['durationMinutes'] !== 'number') {
    return false;
  }

  // Check targetTSS
  const targetTSS = sessionObj['targetTSS'];
  if (typeof targetTSS !== 'object' || targetTSS === null) {
    return false;
  }
  const tssObj = targetTSS as Record<string, unknown>;
  if (typeof tssObj['min'] !== 'number' || typeof tssObj['max'] !== 'number') {
    return false;
  }

  if (typeof sessionObj['targetZones'] !== 'string') {
    return false;
  }

  // Check optional fields
  if (obj['coachingTips'] !== undefined && !Array.isArray(obj['coachingTips'])) {
    return false;
  }

  if (obj['warnings'] !== undefined && obj['warnings'] !== null && !Array.isArray(obj['warnings'])) {
    return false;
  }

  return true;
}

/**
 * Calls the OpenAI API with retry and exponential backoff.
 */
async function callOpenAIWithRetry(
  client: OpenAI,
  messages: ChatCompletionMessageParam[]
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const start = Date.now();
      const response = await client.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages,
      });
      const elapsed = Date.now() - start;

      const choice = response.choices[0];
      const content = choice?.message?.content ?? '';
      const usage = response.usage;

      info('cycling-coach:openai_call', {
        phase: 'openai_call',
        elapsed_ms: elapsed,
        attempt,
        model: OPENAI_MODEL,
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens,
        total_tokens: usage?.total_tokens,
        message_count: messages.length,
      });

      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      warn('cycling-coach:openai_retry', {
        phase: 'openai_call',
        attempt,
        max_retries: MAX_RETRIES,
        error_message: message,
      });

      if (attempt === MAX_RETRIES) {
        throw new Error(`OpenAI API call failed after ${MAX_RETRIES} attempts: ${message}`);
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw new Error('OpenAI API call failed: exhausted retries');
}

/**
 * Gets a cycling training recommendation from the AI coach.
 *
 * @param request - The coach request with recovery, training load, and athlete data
 * @param trainingPhilosophy - The training philosophy document to use as context
 * @param apiKey - OpenAI API key
 * @returns The AI coach's recommendation
 */
export async function getCyclingRecommendation(
  request: CyclingCoachRequest,
  trainingPhilosophy: string,
  apiKey: string
): Promise<CyclingCoachResponse> {
  const client = new OpenAI({ apiKey });

  const systemPrompt = buildSystemPrompt(trainingPhilosophy);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(request, null, 2) },
  ];

  info('cycling-coach:request', {
    phase: 'build_request',
    recovery_score: request.recovery.score,
    recovery_state: request.recovery.state,
    session_type: request.schedule.sessionType,
    day_of_week: request.schedule.dayOfWeek,
    week_in_block: request.athlete.weekInBlock,
    atl: request.trainingLoad.atl,
    ctl: request.trainingLoad.ctl,
    tsb: request.trainingLoad.tsb,
    ftp: request.athlete.ftp,
  });

  const responseContent = await callOpenAIWithRetry(client, messages);

  try {
    const parsed: unknown = JSON.parse(responseContent);

    if (isValidCoachResponse(parsed)) {
      info('cycling-coach:response', {
        phase: 'parse_response',
        session_type: parsed.session.type,
        duration_minutes: parsed.session.durationMinutes,
        has_intervals: parsed.session.intervals !== null && parsed.session.intervals !== undefined,
        warning_count: parsed.warnings?.length ?? 0,
        suggest_ftp_test: parsed.suggestFTPTest ?? false,
      });

      return {
        session: parsed.session,
        reasoning: parsed.reasoning,
        coachingTips: parsed.coachingTips,
        warnings: parsed.warnings,
        suggestFTPTest: parsed.suggestFTPTest,
      };
    }

    logError('cycling-coach:invalid_shape', {
      phase: 'parse_response',
      response_preview: responseContent.substring(0, 500),
    });

    // Return a fallback response
    return createFallbackResponse(request);
  } catch {
    logError('cycling-coach:json_parse_failed', {
      phase: 'parse_response',
      response_preview: responseContent.substring(0, 500),
    });

    return createFallbackResponse(request);
  }
}

/**
 * Creates a fallback response when OpenAI fails.
 */
function createFallbackResponse(request: CyclingCoachRequest): CyclingCoachResponse {
  const sessionType = request.schedule.sessionType;

  // Default sessions based on day
  const defaults: Record<string, SessionRecommendation> = {
    vo2max: {
      type: 'vo2max',
      durationMinutes: 45,
      intervals: {
        protocol: '30/30 Billat',
        count: 10,
        workSeconds: 30,
        restSeconds: 30,
        targetPowerPercent: { min: 110, max: 120 },
      },
      targetTSS: { min: 40, max: 60 },
      targetZones: 'Z5-Z6 for work intervals, Z1-Z2 for recovery',
    },
    threshold: {
      type: 'threshold',
      durationMinutes: 50,
      intervals: {
        protocol: 'Sweet Spot',
        count: 3,
        workSeconds: 600,
        restSeconds: 300,
        targetPowerPercent: { min: 88, max: 94 },
      },
      targetTSS: { min: 50, max: 70 },
      targetZones: 'Z4 for work intervals, Z2 for recovery',
    },
    fun: {
      type: 'fun',
      durationMinutes: 60,
      targetTSS: { min: 30, max: 80 },
      targetZones: 'Whatever feels good - Z2-Z4',
    },
  };

  const defaultSession = defaults[sessionType] ?? defaults['fun'];
  if (!defaultSession) {
    throw new Error('No default session available');
  }

  return {
    session: defaultSession,
    reasoning: 'Unable to generate personalized recommendation. Using default session for today.',
    coachingTips: [
      'Listen to your body and adjust intensity as needed',
      'Stay hydrated throughout the session',
    ],
    warnings: [
      {
        type: 'fallback',
        message: 'This is a default recommendation. Try again later for personalized coaching.',
      },
    ],
  };
}
