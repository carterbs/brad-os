import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import type { MealPlanSession, CritiqueResponse, CritiqueOperation } from '../shared.js';
import type { MealType } from '../shared.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

    const bStr = breakfast?.meal_name !== null && breakfast?.meal_name !== undefined
      ? `${breakfast.meal_name} (${breakfast.meal_id ?? 'null'})` : 'Empty';
    const lStr = lunch?.meal_name !== null && lunch?.meal_name !== undefined
      ? `${lunch.meal_name} (${lunch.meal_id ?? 'null'})` : 'Empty';
    const dStr = dinner?.meal_name !== null && dinner?.meal_name !== undefined
      ? `${dinner.meal_name} (${dinner.meal_id ?? 'null'})` : 'Empty';

    planGridRows.push(`${dayName} | ${bStr} | ${lStr} | ${dStr}`);
  }
  const planGrid = `Day | Breakfast | Lunch | Dinner\n${planGridRows.join('\n')}`;

  return `You are a meal planning assistant. The user has a weekly meal plan and wants to make changes.

Available meals:
${mealTable}

Current plan:
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
  - "new_meal_id": The ID of the replacement meal (from the available meals list), or null to remove

Only include operations for slots that need to change. Respond ONLY with valid JSON.`;
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

  let responseContent: string;
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages,
    });

    const choice = response.choices[0];
    responseContent = choice?.message?.content ?? '';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`OpenAI API call failed: ${message}`);
  }

  try {
    const parsed: unknown = JSON.parse(responseContent);
    if (isValidCritiqueResponse(parsed)) {
      return {
        explanation: parsed.explanation,
        operations: parsed.operations.map((op: CritiqueOperation) => ({
          day_index: op.day_index,
          meal_type: op.meal_type,
          new_meal_id: op.new_meal_id,
        })),
      };
    }

    return {
      explanation: "I couldn't process that request. Please try again.",
      operations: [],
    };
  } catch {
    return {
      explanation: "I couldn't process that request. Please try again.",
      operations: [],
    };
  }
}
