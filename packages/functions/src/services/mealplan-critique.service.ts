import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { info, warn, error as logError } from 'firebase-functions/logger';
import type { MealPlanSession, CritiqueResponse, CritiqueOperation } from '../shared.js';
import type { MealType } from '../shared.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const OPENAI_MODEL = 'gpt-5.2';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Builds the system message for the OpenAI API call.
 * Contains the meal table, current plan grid, constraints, and output format.
 */
export function buildSystemMessage(session: MealPlanSession): string {
  // Build meal table
  const mealTableRows = session.meals_snapshot.map(
    (m) => `${m.id} | ${m.name} | ${m.meal_type} | ${m.effort} | ${m.has_red_meat ? 'Yes' : 'No'}`
  );
  const mealTable = `ID | Name | Type | Effort | Red Meat\n${mealTableRows.join('\n')}`;

  // Build plan grid
  const planGridRows: string[] = [];
  for (let day = 0; day < 7; day++) {
    const dayName = DAY_NAMES[day] ?? `Day ${day}`;
    const breakfast = session.plan.find((e) => e.day_index === day && e.meal_type === 'breakfast');
    const lunch = session.plan.find((e) => e.day_index === day && e.meal_type === 'lunch');
    const dinner = session.plan.find((e) => e.day_index === day && e.meal_type === 'dinner');

    const bStr = breakfast?.meal_id != null ? `[${breakfast.meal_id}] ${breakfast.meal_name}` : 'Empty';
    const lStr = lunch?.meal_id != null ? `[${lunch.meal_id}] ${lunch.meal_name}` : 'Empty';
    const dStr = dinner?.meal_id != null ? `[${dinner.meal_id}] ${dinner.meal_name}` : dinner?.meal_name ?? 'Empty';

    planGridRows.push(`${dayName} | ${bStr} | ${lStr} | ${dStr}`);
  }
  const planGrid = `Day | Breakfast | Lunch | Dinner\n${planGridRows.join('\n')}`;

  return `You are a meal planning assistant. The user has a weekly meal plan and wants to make changes.

Available meals:
${mealTable}

Current plan (already reflects ALL previous changes — do NOT re-apply past requests):
${planGrid}

Constraints:
- Max 2 red meat dinners per week, non-consecutive days
- No meal repeated (no meal ID appears twice in entire plan)
- Breakfast and lunch effort must be <= 2
- Dinner effort varies by day: Mon 3-5, Tue-Thu 3-6, Fri is eating out (null), Sat 4-8, Sun 4-10

When the user asks for changes, respond with a JSON object containing:
- "explanation": A brief explanation of what changes you made and why
- "operations": An array of operations to apply. Each operation has:
  - "day_index": 0-6 (Monday=0, Sunday=6)
  - "meal_type": "breakfast", "lunch", or "dinner"
  - "new_meal_id": ONLY the raw meal ID string (e.g. "meal_30"), or null to remove a slot. The ID must exactly match an ID from the Available meals table above.

IMPORTANT: new_meal_id must be ONLY the ID like "meal_30". Do NOT include the meal name in the ID field.

CRITICAL: The conversation history below shows previous requests and responses. Those changes have ALREADY been applied — the "Current plan" above is the up-to-date state. Only respond to the user's LATEST message. Do NOT re-apply or repeat operations from earlier turns. The history is there so you know what was already discussed (e.g. if the user said "no spaghetti" earlier, don't suggest spaghetti now).

Only include operations for slots that actually need to change based on the latest message. If the user says the plan looks good or doesn't request changes, return empty operations.
Respond ONLY with valid JSON.`;
}

/**
 * Builds the messages array for the OpenAI API call.
 */
export function buildMessages(
  session: MealPlanSession,
  critique: string
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system' as const, content: buildSystemMessage(session) },
  ];

  for (const entry of session.history) {
    messages.push({
      role: entry.role,
      content: entry.content,
    });
  }

  messages.push({ role: 'user' as const, content: critique });

  return messages;
}

/**
 * Validates that a parsed response matches the CritiqueResponse shape.
 */
function isValidCritiqueResponse(data: unknown): data is CritiqueResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj['explanation'] !== 'string') {
    return false;
  }

  if (!Array.isArray(obj['operations'])) {
    return false;
  }

  const validMealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];

  for (const op of obj['operations'] as unknown[]) {
    if (typeof op !== 'object' || op === null) {
      return false;
    }
    const opObj = op as Record<string, unknown>;
    if (typeof opObj['day_index'] !== 'number') {
      return false;
    }
    if (typeof opObj['meal_type'] !== 'string' || !validMealTypes.includes(opObj['meal_type'] as MealType)) {
      return false;
    }
    if (opObj['new_meal_id'] !== null && typeof opObj['new_meal_id'] !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

      info('critique:openai_call', {
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
      warn('critique:openai_retry', {
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
 * Processes a user critique by sending it to OpenAI and returning
 * the structured response with explanation and operations.
 */
export async function processCritique(
  session: MealPlanSession,
  critique: string,
  apiKey: string
): Promise<CritiqueResponse> {
  const client = new OpenAI({ apiKey });
  const messages = buildMessages(session, critique);

  const totalChars = messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
  info('critique:messages_built', {
    phase: 'build_messages',
    message_count: messages.length,
    total_chars: totalChars,
    history_entries: session.history.length,
    meals_in_snapshot: session.meals_snapshot.length,
    model: OPENAI_MODEL,
  });

  const responseContent = await callOpenAIWithRetry(client, messages);

  try {
    const parsed: unknown = JSON.parse(responseContent);
    if (isValidCritiqueResponse(parsed)) {
      info('critique:parsed_ok', {
        phase: 'parse_response',
        operation_count: parsed.operations.length,
      });
      return {
        explanation: parsed.explanation,
        operations: parsed.operations.map((op: CritiqueOperation) => ({
          day_index: op.day_index,
          meal_type: op.meal_type,
          new_meal_id: op.new_meal_id,
        })),
      };
    }

    logError('critique:invalid_shape', {
      phase: 'parse_response',
      response_preview: responseContent.substring(0, 500),
    });
    return {
      explanation: "I couldn't process that request. Please try again.",
      operations: [],
    };
  } catch {
    logError('critique:json_parse_failed', {
      phase: 'parse_response',
      response_preview: responseContent.substring(0, 500),
    });
    return {
      explanation: "I couldn't process that request. Please try again.",
      operations: [],
    };
  }
}
