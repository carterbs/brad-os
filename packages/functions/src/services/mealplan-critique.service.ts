import type { CritiqueContext, CritiqueResponse, MealPlanSession } from '../shared.js';
import { AppError } from '../types/errors.js';
import { processJevCritique } from './mealplan-decision.service.js';
import { processCritique as processGptCritique } from './mealplan-gpt.service.js';

/** Explicit rollback only: service failures never silently switch providers. */
export async function processCritique(session: MealPlanSession, critique: string, apiKey: string, context?: CritiqueContext): Promise<CritiqueResponse> {
  const provider = process.env['MEALPLAN_CRITIQUE_PROVIDER'] ?? 'jev';
  if (provider === 'gpt') {
    const message = context ? critique + '\nAdditional context (original words take precedence over interpretation):\n' + JSON.stringify(context) : critique;
    return processGptCritique(session, message, apiKey);
  }
  if (provider !== 'jev') throw new AppError(500, 'MEALPLAN_INVALID_PROVIDER', 'MEALPLAN_CRITIQUE_PROVIDER must be jev or gpt.');
  return processJevCritique(session, critique, apiKey, context);
}
