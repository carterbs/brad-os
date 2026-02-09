/**
 * Cycling Coach Service
 *
 * Integrates with OpenAI to generate personalized cycling training recommendations
 * based on recovery data, training load, and periodization.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions.js';
import { info, warn, error as logError } from 'firebase-functions/logger';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CyclingCoachRequest,
  CyclingCoachResponse,
  SessionRecommendation,
  GenerateScheduleRequest,
  GenerateScheduleResponse,
  WeeklySession,
  PhaseSummary,
} from '../shared.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  return `You are an AI cycling coach for an athlete who trains on a Peloton bike. Recommend Peloton class types — never prescribe specific interval protocols.

## Training Philosophy
${trainingPhilosophy}

## Your Role
- Recommend today's Peloton class type based on the next session in their weekly queue, recovery data, and training load
- The athlete's schedule is a queue of sessions ordered by priority. Recommend the NEXT session, regardless of what day it is.
- Never reference missed days or imply the athlete is behind schedule.
- When recovery is poor: Suggest an easier class type or shorter duration — or rest.
- When overreaching detected: Suggest a Recovery Ride or day off.
- Consider lifting schedule: If heavy lower body yesterday, recommend Low Impact or Recovery Ride instead of a hard session.

## Peloton Class Types
- Power Zone Max, HIIT & Hills, Tabata — for VO2max / high intensity
- Power Zone, Sweat Steady, Climb — for threshold / sweet spot
- Power Zone Endurance, Low Impact (long) — for endurance / base
- Power Zone, Intervals — for tempo
- Music/Theme rides, Scenic, Live DJ — for fun
- Low Impact, Recovery Ride — for recovery

## Decision Framework
1. Check the next session in the weekly queue
2. Assess recovery state and training load
3. Consider week in block (periodization phase)
4. Account for lifting interference
5. Recommend appropriate Peloton class type and duration

## Recovery-Based Adjustments (Peloton-framed)
- Ready (score >= 70): Full planned session. Go for the longer class duration.
- Moderate (score 50-69): Swap for a shorter class, or a slightly easier class type.
- Recover (score < 50): Skip the planned session. Take a 20-min Low Impact or Recovery Ride. Come back tomorrow.

## Response Format
Respond with a valid JSON object matching this exact schema:
{
  "session": {
    "type": "vo2max" | "threshold" | "endurance" | "tempo" | "fun" | "recovery" | "off",
    "durationMinutes": number,
    "pelotonClassTypes": ["Power Zone Max", "HIIT & Hills"],
    "pelotonTip": "Search for a 30-min PZ Max class. Push hard in the efforts.",
    "targetTSS": { "min": number, "max": number },
    "targetZones": string
  },
  "reasoning": string,
  "coachingTips": string[],
  "warnings": [{ "type": string, "message": string }] | null,
  "suggestFTPTest": boolean
}

Important notes:
- pelotonClassTypes should list 2-3 Peloton class types that match the session intent
- pelotonTip should be a short, friendly instruction for finding and riding the right class
- durationMinutes should be 20, 30, 45, or 60
- targetZones should describe power zones to target (e.g., "Zones 5-6 during efforts, Zone 1-2 recovery")
- reasoning should explain why you made this recommendation
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
  const validTypes = ['vo2max', 'threshold', 'endurance', 'tempo', 'fun', 'recovery', 'off'];
  if (!validTypes.includes(sessionObj['type'] as string)) {
    return false;
  }

  if (typeof sessionObj['durationMinutes'] !== 'number') {
    return false;
  }

  // Check Peloton fields (required in new format)
  if (!Array.isArray(sessionObj['pelotonClassTypes'])) {
    return false;
  }
  if (typeof sessionObj['pelotonTip'] !== 'string') {
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
  messages: ChatCompletionMessageParam[],
  responseFormat?: ChatCompletionCreateParamsNonStreaming['response_format'],
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const start = Date.now();
      const response = await client.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: responseFormat ?? { type: 'json_object' },
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
        peloton_class_types: parsed.session.pelotonClassTypes,
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

  // Default sessions based on day using Peloton class types
  const defaults: Record<string, SessionRecommendation> = {
    vo2max: {
      type: 'vo2max',
      durationMinutes: 30,
      pelotonClassTypes: ['Power Zone Max', 'HIIT & Hills', 'Tabata'],
      pelotonTip: 'Search for a 30-min Power Zone Max class. Push hard during the efforts.',
      targetTSS: { min: 40, max: 60 },
      targetZones: 'Zones 5-6 during efforts, Zone 1-2 recovery',
    },
    threshold: {
      type: 'threshold',
      durationMinutes: 45,
      pelotonClassTypes: ['Power Zone', 'Sweat Steady', 'Climb'],
      pelotonTip: 'Search for a 45-min Power Zone class. Hold steady in zones 3-4.',
      targetTSS: { min: 50, max: 70 },
      targetZones: 'Zone 4 sustained, Zone 2 recovery',
    },
    fun: {
      type: 'fun',
      durationMinutes: 30,
      pelotonClassTypes: ['Music', 'Theme', 'Scenic', 'Live DJ'],
      pelotonTip: 'Pick whatever class looks fun. No structure needed — just enjoy the ride.',
      targetTSS: { min: 30, max: 80 },
      targetZones: 'Whatever feels good — Zone 2-4',
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

// ============ Schedule Generation ============

/**
 * Builds the system prompt for schedule generation.
 */
export function buildScheduleGenerationPrompt(): string {
  try {
    const promptPath = resolve(__dirname, '../prompts/schedule-generation-system.md');
    return readFileSync(promptPath, 'utf-8');
  } catch {
    // Fallback inline prompt if file not found
    return `You are an AI cycling coach that creates personalized weekly training schedules for Peloton users.

Generate an ordered list of weekly sessions. Sessions are a queue — hardest/most important first, fun last.
The user trains on Peloton, so recommend Peloton class types (Power Zone Max, Power Zone, Power Zone Endurance, HIIT & Hills, Sweat Steady, Climb, Low Impact, Recovery, Music/Theme rides).
Do NOT prescribe specific interval protocols — the Peloton instructor handles that.

sessionType MUST be one of these exact strings: "vo2max", "threshold", "endurance", "tempo", "fun", "recovery".

Respond with valid JSON matching this schema:
{
  "sessions": [{ "order": number, "sessionType": "vo2max"|"threshold"|"endurance"|"tempo"|"fun"|"recovery", "pelotonClassTypes": string[], "suggestedDurationMinutes": number, "description": string }],
  "weeklyPlan": { "totalEstimatedHours": number, "phases": [{ "name": string, "weeks": string, "description": string }] },
  "rationale": string
}`;
  }
}

const VALID_SESSION_TYPES = new Set(['vo2max', 'threshold', 'endurance', 'tempo', 'fun', 'recovery']);

/**
 * Validates the shape of a schedule generation response.
 * @param data - The parsed AI response
 * @param expectedSessionCount - The number of sessions that should be in the response
 */
export function isValidScheduleResponse(
  data: unknown,
  expectedSessionCount: number,
): data is GenerateScheduleResponse {
  if (typeof data !== 'object' || data === null) return false;

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj['sessions'])) return false;
  if (typeof obj['rationale'] !== 'string') return false;

  // Validate session count matches expected
  if (obj['sessions'].length !== expectedSessionCount) return false;

  const weeklyPlan = obj['weeklyPlan'];
  if (typeof weeklyPlan !== 'object' || weeklyPlan === null) return false;
  const planObj = weeklyPlan as Record<string, unknown>;
  if (typeof planObj['totalEstimatedHours'] !== 'number') return false;
  if (!Array.isArray(planObj['phases'])) return false;

  // Validate each session has required fields with correct types
  for (const session of obj['sessions'] as unknown[]) {
    if (typeof session !== 'object' || session === null) return false;
    const s = session as Record<string, unknown>;
    if (typeof s['order'] !== 'number') return false;
    if (typeof s['sessionType'] !== 'string') return false;
    if (!VALID_SESSION_TYPES.has(s['sessionType'])) return false;
    if (!Array.isArray(s['pelotonClassTypes'])) return false;
    if (typeof s['suggestedDurationMinutes'] !== 'number') return false;
    if (typeof s['description'] !== 'string') return false;
  }

  return true;
}

/**
 * Creates a fallback schedule response when AI generation fails.
 */
function createFallbackSchedule(request: GenerateScheduleRequest): GenerateScheduleResponse {
  interface SessionTemplate {
    sessionType: string;
    pelotonClassTypes: string[];
    duration: number;
    description: string;
  }

  const sessionTemplates: Record<string, SessionTemplate> = {
    vo2max: { sessionType: 'vo2max', pelotonClassTypes: ['Power Zone Max', 'HIIT & Hills'], duration: 30, description: 'High-intensity — search for a PZ Max or HIIT class' },
    threshold: { sessionType: 'threshold', pelotonClassTypes: ['Power Zone', 'Sweat Steady'], duration: 45, description: 'Sustained effort — search for a Power Zone or Sweat Steady class' },
    endurance: { sessionType: 'endurance', pelotonClassTypes: ['Power Zone Endurance', 'Low Impact'], duration: 45, description: 'Aerobic base — search for a PZ Endurance or long Low Impact class' },
    tempo: { sessionType: 'tempo', pelotonClassTypes: ['Power Zone', 'Intervals'], duration: 30, description: 'Moderate push — search for a Power Zone or Intervals class' },
    fun: { sessionType: 'fun', pelotonClassTypes: ['Music', 'Theme', 'Scenic'], duration: 30, description: 'Fun ride — whatever you enjoy' },
  };

  const funTemplate: SessionTemplate = sessionTemplates['fun'] as SessionTemplate;

  // Build sessions based on count
  const sessionOrderMap: Record<number, string[]> = {
    2: ['vo2max', 'fun'],
    3: ['vo2max', 'threshold', 'fun'],
    4: ['vo2max', 'threshold', 'endurance', 'fun'],
    5: ['vo2max', 'threshold', 'endurance', 'tempo', 'fun'],
  };

  const order = sessionOrderMap[request.sessionsPerWeek] ?? ['vo2max', 'threshold', 'fun'];

  const sessions: WeeklySession[] = order.map((type, index) => {
    const template = sessionTemplates[type] ?? funTemplate;
    return {
      order: index + 1,
      sessionType: template.sessionType,
      pelotonClassTypes: template.pelotonClassTypes,
      suggestedDurationMinutes: template.duration,
      description: template.description,
    };
  });

  const totalHours = sessions.reduce((sum, s) => sum + s.suggestedDurationMinutes, 0) / 60;

  const phases: PhaseSummary[] = [
    { name: 'Adaptation', weeks: '1-2', description: 'Start with shorter classes. Get your legs used to structured work.' },
    { name: 'Build', weeks: '3-4', description: 'Increase class duration. Push a bit harder in intensity sessions.' },
    { name: 'Recovery', weeks: '5', description: 'Shorter classes, easier intensity. Let your body absorb the training.' },
    { name: 'Peak', weeks: '6-7', description: 'Longest classes, highest intensity. You are at your strongest.' },
    { name: 'Test', weeks: '8', description: 'FTP retest and easy riding. See how much you have improved.' },
  ];

  return {
    sessions,
    weeklyPlan: { totalEstimatedHours: Math.round(totalHours * 10) / 10, phases },
    rationale: 'Default schedule generated. Try again for a personalized plan.',
  };
}

/** Structured output schema for schedule generation — enforces sessionType enum at API level. */
const SCHEDULE_RESPONSE_FORMAT: ChatCompletionCreateParamsNonStreaming['response_format'] = {
  type: 'json_schema',
  json_schema: {
    name: 'schedule_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order: { type: 'number' },
              sessionType: { type: 'string', enum: ['vo2max', 'threshold', 'endurance', 'tempo', 'fun', 'recovery'] },
              pelotonClassTypes: { type: 'array', items: { type: 'string' } },
              suggestedDurationMinutes: { type: 'number' },
              description: { type: 'string' },
            },
            required: ['order', 'sessionType', 'pelotonClassTypes', 'suggestedDurationMinutes', 'description'],
            additionalProperties: false,
          },
        },
        weeklyPlan: {
          type: 'object',
          properties: {
            totalEstimatedHours: { type: 'number' },
            phases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  weeks: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['name', 'weeks', 'description'],
                additionalProperties: false,
              },
            },
          },
          required: ['totalEstimatedHours', 'phases'],
          additionalProperties: false,
        },
        rationale: { type: 'string' },
      },
      required: ['sessions', 'weeklyPlan', 'rationale'],
      additionalProperties: false,
    },
  },
};

/**
 * Generate a weekly training schedule using AI.
 *
 * @param request - The schedule generation request
 * @param apiKey - OpenAI API key
 * @returns The generated schedule response
 */
export async function generateSchedule(
  request: GenerateScheduleRequest,
  apiKey: string
): Promise<GenerateScheduleResponse> {
  const client = new OpenAI({ apiKey });

  const systemPrompt = buildScheduleGenerationPrompt();
  const userMessage = JSON.stringify(request, null, 2);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  info('cycling-coach:generate_schedule', {
    phase: 'build_request',
    sessions_per_week: request.sessionsPerWeek,
    experience_level: request.experienceLevel,
    weekly_hours: request.weeklyHoursAvailable,
    goals: request.goals,
  });

  try {
    const responseContent = await callOpenAIWithRetry(client, messages, SCHEDULE_RESPONSE_FORMAT);
    const parsed: unknown = JSON.parse(responseContent);

    if (isValidScheduleResponse(parsed, request.sessionsPerWeek)) {
      info('cycling-coach:schedule_generated', {
        phase: 'parse_response',
        session_count: parsed.sessions.length,
        total_hours: parsed.weeklyPlan.totalEstimatedHours,
      });
      return parsed;
    }

    logError('cycling-coach:schedule_invalid_shape', {
      phase: 'parse_response',
      response_preview: responseContent.substring(0, 500),
    });

    return createFallbackSchedule(request);
  } catch {
    logError('cycling-coach:schedule_generation_failed', {
      phase: 'generate_schedule',
    });

    return createFallbackSchedule(request);
  }
}
