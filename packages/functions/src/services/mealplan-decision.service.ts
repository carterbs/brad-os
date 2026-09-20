import type { CritiqueContext, CritiqueOperation, CritiqueResponse, JevAnswer, JevQuestion, Meal, MealPlanEntry, MealPlanSession } from '../shared.js';
import { AppError } from '../types/errors.js';
import { logger } from '../runtime/logger.js';
import { evaluateJev } from './mealplan-jev.service.js';
import { feasibleChoices } from './mealplan-feasibility.service.js';
import { applyOperations } from './mealplan-operations.service.js';
import { PREP_AHEAD_POLICY } from './mealplan-prep-policy.service.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const POLICY = {
  intent: 'Apply the latest occurrence of the request, even when its text repeats an earlier turn: try again rejects the CURRENT assignment. Only recorded assignment operations were applied. Empty assistant operations mean no assignments changed; they may represent clarification, failed validation, acknowledgment or an already-satisfied request. When the user resolves a clarification and asks to proceed, carry out the still-authorized pending clauses of that request, including clauses not restated. Latest instructions that narrow or cancel an earlier request take precedence. Never replay actually completed edits. An explicit do not change, leave it for now, or future preference overrides the usual food-rejection replacement convention. Keep every unrelated slot exactly unchanged. Food rejection (disliked, eaten recently, want something different) otherwise means replace and keep filled, not clear. Clear only explicitly unneeded meals or days. Removing a whole day includes every audience/track present.',
  references: 'previous_assignments records pre-edit food, not a blanket rejection list: swaps and calendar removals are not dislikes. Explicitly requesting a previously rejected dish again overrides the earlier rejection. Rejecting a dish rejects that dish identity, not every other dish sharing an ingredient; a category rejection must be explicit. Resolve names and pronouns using current_plan and conversation_history. Day abbreviations sat/thurs etc are weekdays. Resolve swaps using pre-edit current_plan, then later instructions in order. A follow-up such as try again targets the preceding changed meal, never replays completed removals. If multiple targets remain plausible, clarify. Unqualified breakfast is ambiguous when both audiences exist, unless history or a unique named dish resolves it.',
  evidence: 'context.original_request is the original user statement. interpretation and calendar_context are separately supplied context; do not let an inference override explicit user words. Calendar information alone does not request a removal or edit. Ingredient/allergy/nutrition guarantees require evidence not present in this catalog. Familiar dish names plus effort/prep_ahead can support plausible serving-time choices, but do not prove ingredient guarantees. No-cook means no cooking at serving time; do not silently substitute merely less effort.',
  preferences: 'Choose food fitting the latest request and relevant prior rejections. Family suitability differs from Brad personal taste. Prefer last_planned older than 21 days relative to planning_date, then least-recent suitable fallback. last_planned is planning history, not consumption. Usually prefer breakfast/lunch effort <=2 and dinner Mon3-5 Tue-Thu3-6 Sat4-8 Sun4-10. These effort and recency targets are flexible preferences; explicit requests and transfers take priority. Prefer small serving-time effort on busy evenings.',
  variety: 'For each audience separately, avoid introducing multiple variants of the same core dish in a week, even with different catalog IDs. Changing a protein or modifier alone may still be the same dish; merely sharing an ingredient, cuisine, or broad food category is not. Existing core-dish repetition may remain or move without increasing its count. An explicit user request for the particular dish or repeated core dish overrides this usual variety preference. Adult breakfast variety is exempt when its catalog has fewer than seven unique choices.',
  mandatory: 'Never invent meals or change meal type/audience. No new repeated meal IDs, except adult breakfasts if fewer than seven unique adult breakfasts exist in catalog. Existing repeated foods may move without increasing their occurrence count in the saved plan. ' + PREP_AHEAD_POLICY + ' At most two red-meat dinners, or no increase if already above two. Do not introduce a new consecutive red-meat dinner pair. Evaluate all edits together. Do not relax these policies silently or change unrelated slots to satisfy them.',
  approval: 'Critique cannot finalize, create shopping lists, delete catalog meals, or invent recipes. Acknowledgement/approval alone is no meal edit.',
};

function label(entry: MealPlanEntry): string {
  return (DAYS[entry.day_index] ?? 'Unknown') + ' ' + (entry.meal_track === 'adult' ? 'Brad/adult' : 'family') + ' ' + entry.meal_type;
}
function noChange(outcome: NonNullable<CritiqueResponse['outcome']>, explanation: string): CritiqueResponse {
  return { outcome, explanation: 'The plan is unchanged. ' + explanation, operations: [] };
}
function answerChoice(answers: Record<string, JevAnswer>, id: string): string {
  const answer = answers[id];
  if (answer?.type !== 'choice') throw new AppError(502, 'JEV_INVALID_RESPONSE', 'Meal-plan selection returned an invalid answer. No changes were made.');
  return answer.choice;
}
async function evaluateBatches(state: Record<string, unknown>, questions: Record<string, JevQuestion>, key: string, signal: AbortSignal): Promise<Record<string, JevAnswer>> {
  const answers: Record<string, JevAnswer> = {};
  let batch: Record<string, JevQuestion> = {};
  for (const [id, question] of Object.entries(questions)) {
    const next = { ...batch, [id]: question };
    if (Object.keys(batch).length > 0 && JSON.stringify({ state, questions: next }).length > 85000) {
      Object.assign(answers, await evaluateJev(state, batch, key, signal));
      batch = {};
    }
    batch[id] = question;
  }
  if (Object.keys(batch).length > 0) Object.assign(answers, await evaluateJev(state, batch, key, signal));
  return answers;
}
function evidence(meal: Meal, index: number): string {
  return ['meal_' + index, meal.id, meal.name, meal.meal_type, meal.audience, meal.effort,
    meal.prep_ahead ? 'yes' : 'no', meal.has_red_meat ? 'yes' : 'no', meal.last_planned ?? 'never'].join(' | ');
}
function planEvidence(plan: MealPlanEntry[]): string[] {
  return plan.map((entry) => label(entry) + ': ' + (entry.meal_name ?? 'empty'));
}
function scopeQuestions(session: MealPlanSession, critique: string, transferPreview?: MealPlanEntry[], classifyRequest = true): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = classifyRequest ? {
    request: { type: 'choice', instructions: 'The latest user message is ' + JSON.stringify(critique) + '. Classify this complete request using current_plan and conversation_history. Only recorded assignment operations have happened. A clarification answer that asks to proceed resumes the whole unfulfilled earlier request, with its remaining clauses intact. Resolve references to the most recent changed food before deciding. Exactly one result applies.', criteria: {
      edit: 'At least one edit is requested, ALL required targets and audiences are unambiguous, and the catalog has the factual evidence needed. Open-ended food choice is allowed.',
      already_satisfied: 'Every requested final assignment already matches the saved current plan; no change is necessary.',
      no_change: 'No current-week edit requested: acknowledgement, approval, context alone, future preferences, or explicit leave this week unchanged. Do not change overrides food rejection.',
      clarify: 'ANY required target or audience remains ambiguous, even if other edits are clear. Unqualified breakfast with two audiences is ambiguous unless a unique dish or prior turn resolves it.',
      insufficient_evidence: 'ANY requested edit requires unavailable verified ingredient, allergen or nutrition facts. Other clear edits cannot be partially applied.',
      infeasible: 'An exact required catalog dish is absent. Do not use this for open-ended choices or joint structural constraints.',
    } },
    transfer_pattern: { type: 'choice', instructions: 'User: ' + JSON.stringify(critique) + '. Does this request explicitly exchange or move existing assignments between named slots?', criteria: {
      ordinary: 'Only replacements, rejections, removals, context or approval. Swap out a meal for something new is an ordinary replacement.',
      transfers: 'An explicit exchange/move between existing slots is requested, including a swap followed by another instruction. Resolve source foods before final slot actions.',
    } },
  } : {};
  session.plan.forEach((entry, index) => {
    questions['scope_' + index] = { type: 'choice', instructions: 'The user says ' + JSON.stringify(critique) + '. ' + (transferPreview ? 'After requested transfers, BEFORE later removals, this slot contains ' + (transferPreview[index]?.meal_name ?? 'empty') + '. Evaluate the final state from the same user message after these exchanges; retain this intermediate food unless a subsequent instruction changes it. ' : '') + 'Resolve this latest request against the WHOLE current plan and conversation. What action is requested for ' + label(entry) + '? Do not bind an unspecified that/it to this slot merely because this question names it. Earlier completed edits are history; repeat try again targets the most recent replacement. A request for a new or different meal means replace the currently saved food on EVERY named day, even if its existing food already looks suitable. A meal-type reference applies across its full day list, without targeting other meal types. A whole-day removal includes all present tracks. Determine the FINAL filled/empty state after every clause. Later removals and parenthetical final-state statements override earlier swaps: a moved food removed afterward leaves its destination empty, not its original source.', criteria: {
      preserve: transferPreview ? 'Keep the intermediate assignment shown after transfers, with no subsequent change to this slot.' : 'This slot is unrelated or explicitly retained; its saved assignment must remain unchanged.',
      replace: 'This particular slot requires a filled different assignment, including rejection, replacement, transfer, swap or filling an empty slot.',
      clear: 'This slot is explicitly unneeded AFTER all instructions, including removal of a food after it has been moved into this slot. Later removal overrides an earlier swap. A food rejection alone instead requires replacement.',
    } };
    const peers = session.plan.filter((other) => other.day_index === entry.day_index && other.meal_type === entry.meal_type);
    if (peers.length > 1 && entry.meal_track === 'family') {
      questions['audience_' + index] = { type: 'choice', instructions: 'The user says ' + JSON.stringify(critique) + '. For ' + DAYS[entry.day_index] + ' ' + entry.meal_type + ', which audience does the latest requested edit target? Both family and Brad/adult slots exist. Resolve from explicit audience words, a unique named current dish or relevant prior edits; do not assume both. Whole-day removal includes both.', criteria: {
        none: 'No edit to this day and meal type.', family: 'Specifically the family slot.', adult: 'Specifically Brad/adult slot.',
        both: 'The request targets both audiences: explicitly both/all, separate instructions naming family and Brad/adult for this same day and meal type, or a whole-day removal. Combine all clauses, even if their actions differ.', ambiguous: 'An edit to this day and meal type is requested, but family versus Brad/adult is unresolved.',
      } };
    }
  });
  return questions;
}
async function transferPreview(session: MealPlanSession, critique: string, state: Record<string, unknown>, key: string, signal: AbortSignal, targets: ReadonlySet<number>): Promise<MealPlanEntry[]> {
  const questions: Record<string, JevQuestion> = {};
  session.plan.forEach((entry, index) => {
    // A preview can resolve food identities only for requested targets. Another
    // saved occurrence of the same dish is not implicitly part of an exchange.
    if (!targets.has(index)) return;
    const criteria: Record<string, string> = { unchanged: 'No explicit move/exchange brings another existing slot food here. Keep the current food for this intermediate preview. Swap out for something new is not a transfer.' };
    session.plan.forEach((source, sourceIndex) => {
      if (sourceIndex !== index && source.meal_type === entry.meal_type && (source.meal_track ?? 'family') === (entry.meal_track ?? 'family') && source.meal_id !== null) criteria['source_' + sourceIndex] = 'Receive the original ' + label(source) + ' food: ' + source.meal_name;
    });
    questions['transfer_' + index] = { type: 'choice', instructions: 'User: ' + JSON.stringify(critique) + '. Consider only explicit exchanges/moves of existing foods. What food reaches ' + label(entry) + ' immediately after those exchanges, BEFORE later removals? Do not perform replacements or removals in this intermediate preview. Resolve all source foods from the original current_plan.', criteria };
  });
  const answers = await evaluateBatches(state, questions, key, signal);
  return session.plan.map((entry, index) => {
    if (!targets.has(index)) return { ...entry };
    const selected = answerChoice(answers, 'transfer_' + index);
    if (selected === 'unchanged') return { ...entry };
    const source = session.plan[Number(selected.replace('source_', ''))];
    if (!source) throw new AppError(502, 'JEV_INVALID_RESPONSE', 'An exchange source could not be resolved.');
    return { ...entry, meal_id: source.meal_id, meal_name: source.meal_name };
  });
}
function operation(entry: MealPlanEntry, mealId: string | null): CritiqueOperation {
  return { day_index: entry.day_index, meal_track: entry.meal_track ?? 'family', meal_type: entry.meal_type, new_meal_id: mealId };
}
function planOperations(session: MealPlanSession, plan: MealPlanEntry[]): CritiqueOperation[] {
  return plan.flatMap((entry, index) => entry.meal_id === session.plan[index]!.meal_id && entry.meal_name === session.plan[index]!.meal_name ? [] : [operation(entry, entry.meal_id)]);
}
function rejectionQuestions(session: MealPlanSession, candidates: Map<number, Meal[]>, critique: string): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  const unique = new Map([...candidates.values()].flat().map((meal) => [meal.id, meal]));
  for (const meal of unique.values()) {
    const knownDisplacements = session.history.flatMap((message, index) => {
      if (message.role !== 'assistant') return [];
      const before = message.previous_assignments?.filter((entry) => entry.meal_id === meal.id) ?? [];
      const user = [...session.history.slice(0, index)].reverse().find((entry) => entry.role === 'user');
      return before.map((entry) => ({ earlier_user_words: user?.content, context: user?.context, original_slot: label(entry), food_before_that_feedback: meal.name,
        replaced_by: session.meals_snapshot.find((item) => item.id === message.operations?.find((op) => op.day_index === entry.day_index && op.meal_type === entry.meal_type && op.meal_track === (entry.meal_track ?? 'family'))?.new_meal_id)?.name ?? 'empty' }));
    });
    questions['rejection_' + session.meals_snapshot.indexOf(meal)] = { type: 'choice', instructions: 'Food under consideration: ' + meal.name + ' (ID ' + meal.id + '). Latest user message: ' + JSON.stringify(critique) + '. Known earlier changes AWAY FROM THIS EXACT FOOD: ' + JSON.stringify(knownDisplacements) + '. Using these records and the conversation, is this food currently rejected for this planning conversation? Earlier recently-had, unwanted, too-familiar, or different-food feedback applies to the original food BEFORE that earlier edit, even after multiple replacement turns. Transfers and calendar removals alone are not rejections. Check all later user messages: an explicit later request to restore this exact food can reverse a rejection.', criteria: {
      available: 'No active rejection of this food. A move, exact assignment, or calendar removal alone is not a rejection. Sharing ingredients with a rejected dish is not rejection unless a category was explicitly excluded.',
      rejected: 'This food was rejected as recently eaten, unwanted, too familiar, or to be replaced with something different in an earlier or current turn, and no later explicit request restores it.',
      restored: 'The user explicitly asks to use this exact previously rejected food again; that later instruction overrides its rejection.',
    } };
  }
  return questions;
}
function acceptableQuestions(session: MealPlanSession, candidates: Map<number, Meal[]>, critique: string): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const [index, meals] of candidates) for (const meal of meals) {
    const mealIndex = session.meals_snapshot.indexOf(meal);
    questions['fit_' + index + '_' + mealIndex] = { type: 'choice', instructions: 'User: ' + JSON.stringify(critique) + '. Judge ONLY ' + meal.name + ' (effort ' + meal.effort + '/10; prep ahead ' + meal.prep_ahead + ') as the replacement for ' + label(session.plan[index]!) + '. Is this food compatible with requirements applying to THIS ONE slot? Resolve exact transfers from the original plan; apply later instructions in order. Other slots/removals are NOT requirements this one food must fulfill. Several candidates may fit. Ignore optional recency/usual effort preferences and whole-week duplicate/prep/red-meat limits. No-cook means no cooking at serving time; earlier cold prep is permitted.', criteria: {
      fits: 'This candidate satisfies this target slot’s required food instructions, exact requested identity/transfer, effort/serving-time needs and explicit rejections. No local requirement rules it out. A simple rejection allows any different compatible food not rejected earlier.',
      violates: 'This candidate violates an explicit requirement for this specific slot: wrong exact/transfer identity, excluded food/category, previously rejected dish, or required effort/serving-time constraint.',
      unverified: 'Determining compatibility requires unavailable factual evidence, such as verified ingredients, allergen safety or nutrition. Do not use this because other slots also need edits.',
    } };

  }
  return questions;
}
function redMeatConflicts(session: MealPlanSession, plan: MealPlanEntry[]): string[] {
  const meals = new Map(session.meals_snapshot.map((meal) => [meal.id, meal]));
  const days = (entries: MealPlanEntry[]): number[] => entries.filter((entry) => entry.meal_type === 'dinner' && entry.meal_id !== null && meals.get(entry.meal_id)?.has_red_meat).map((entry) => entry.day_index);
  const before = days(session.plan); const after = days(plan);
  const conflicts: string[] = [];
  if (after.length > Math.max(2, before.length)) conflicts.push('The proposed week increases red-meat dinners above the allowed count of ' + Math.max(2, before.length) + '.');
  for (const day of after) if (after.includes(day + 1) && !(before.includes(day) && before.includes(day + 1))) conflicts.push('New consecutive red-meat dinners on ' + DAYS[day] + ' and ' + DAYS[day + 1] + '.');
  return conflicts;
}
function explain(session: MealPlanSession, operations: CritiqueOperation[]): string {
  return operations.map((op) => {
    const old = session.plan.find((entry) => entry.day_index === op.day_index && (entry.meal_track ?? 'family') === op.meal_track && entry.meal_type === op.meal_type)!;
    const meal = session.meals_snapshot.find((item) => item.id === op.new_meal_id);
    return label(old) + ': ' + (op.new_meal_id === null ? 'removed ' + (old.meal_name ?? 'meal') : (meal?.name ?? '') + ' (from ' + (old.meal_name ?? 'empty') + ')') + '.';
  }).join(' ').slice(0, 2000);
}
function verificationQuestions(session: MealPlanSession, plan: MealPlanEntry[], actions: string[], critique: string): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {
    requirements: { type: 'choice', instructions: 'User: ' + JSON.stringify(critique) + '. Check ONLY explicit food relationships ACROSS selected replacement slots against proposed_plan. Examples: exactly one chicken and one fish dinner, different proteins on the two changed days, or a requested combined effort limit. Per-food suitability/exclusions/exact identity, target scope, ordered transfers and removals have separate checks. If the request has no cross-slot food requirement, select satisfied. Do not re-evaluate separate removals or individual dish preferences here.', criteria: {
      satisfied: 'There is no cross-slot food requirement, or all such explicit relationships hold across the completed choices.',
      violated: 'The completed choices violate an explicit relationship across foods or a requested combined quantity.',
      missing_evidence: 'An explicit cross-slot requirement depends on unavailable factual evidence.',
    } },
  };
  const selectedFoods = new Map<number, Meal[]>();
  actions.forEach((action, index) => {
    if (action !== 'replace') return;
    const meal = session.meals_snapshot.find((food) => food.id === plan[index]!.meal_id);
    if (meal) selectedFoods.set(index, [meal]);
  });
  Object.assign(questions, acceptableQuestions(session, selectedFoods, critique));
  const adultBreakfastCount = new Set(session.meals_snapshot.filter((meal) => meal.audience === 'adult' && meal.meal_type === 'breakfast').map((meal) => meal.id)).size;
  for (const [index, meals] of selectedFoods) {
    const entry = session.plan[index]!;
    if (entry.meal_track === 'adult' && entry.meal_type === 'breakfast' && adultBreakfastCount < 7) continue;
    questions['family_' + index] = { type: 'choice', instructions: 'Check the core dish of ' + meals[0]!.name + ' chosen for ' + label(entry) + ' against the other meals for the SAME audience in proposed_plan. ' + POLICY.variety + ' Compare current_plan with proposed_plan. Does this choice introduce or increase repetition of that core dish? Different audience tracks do not count against each other. This check concerns dish identity, not ingredient exclusion or whether the user requested this slot.', criteria: {
      distinct: 'No other proposed meal for this audience represents the same core dish. Shared ingredients, cuisine or a broad category alone do not make dishes equivalent.',
      legacy: 'This audience already had multiple instances of this same core dish in current_plan, and the proposed occurrence count does not exceed that original count.',
      requested: 'The original user words explicitly require this particular dish or repeated core dish for this target. A generic replacement request or a meal named only by Doris interpretation does not qualify.',
      new_repeat: 'The proposed plan introduces a second variant of this core dish for this audience, or increases an existing repeated core-dish count.',
    } };
  }
  actions.forEach((action, index) => {
    if (action !== 'clear') return;
    const entry = session.plan[index]!;
    if (entry.meal_id === null && entry.meal_name === plan[index]!.meal_name) return;
    questions['clear_' + index] = { type: 'choice', instructions: 'The user says ' + JSON.stringify(critique) + '. Resolve ordered moves first. Why would ' + label(entry) + ' be empty in the final plan? A whole-day removal includes every meal/audience on that day. A lunch removal does not remove dinner. Use current_plan and conversation for references, including an unfulfilled earlier request that this clarification asks to carry out. An explicit cancellation in that pending request need not be repeated word for word in the clarification.', criteria: {
      explicitly_unneeded: 'The user explicitly removes this meal/day or moves this food away without a replacement. The slot should be empty.',
      food_rejected: 'The user rejects this food or wants another meal; the slot needs a filled replacement.',
      unrelated: 'This slot is not targeted by the latest request and must remain saved as it was.',
      ambiguous: 'The requested final state of this particular slot cannot be resolved.',
    } };
  });
  return questions;
}
function resolvedScope(session: MealPlanSession, actions: string[]): string[] {
  return session.plan.flatMap((entry, index) => actions[index] === 'preserve' ? [] : [label(entry) + ': ' + (actions[index] === 'clear' ? 'final slot empty' : 'final slot filled with a different assignment')]);
}
/** JEV resolves scope, evaluates suitability and chooses foods; code enforces atomic feasibility. */
export async function processJevCritique(savedSession: MealPlanSession, forwardedCritique: string, apiKey: string, context?: CritiqueContext): Promise<CritiqueResponse> {
  // Source precedence is established before inference. The persisted request
  // remains lossless; this separate evidence view presents original user words.
  const critique = context?.original_request?.trim() ? context.original_request : forwardedCritique;
  const session: MealPlanSession = { ...savedSession, history: savedSession.history.map((message) =>
    message.role === 'user' && message.context?.original_request?.trim()
      ? { ...message, content: message.context.original_request, forwarded_content: message.content }
      : message
  ) };
  // Present the current user turn in sequence with recorded results. Keeping it
  // only in a separate latest_request field obscures clarification follow-ups.
  const chronologicalExchange = [...session.history, { role: 'user', content: critique }];
  const timeoutText = process.env['JEV_TIMEOUT_MS'] ?? '30000'; const timeoutMs = Number(timeoutText);
  if (!/^\d+$/.test(timeoutText) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new AppError(500, 'JEV_INVALID_CONFIG', 'JEV_TIMEOUT_MS must be an integer from 1000 to 120000.');
  const signal = AbortSignal.timeout(timeoutMs);
  const state: Record<string, unknown> = {
    latest_request: critique, forwarded_critique: forwardedCritique, context: context ?? {}, rules: POLICY, current_plan: planEvidence(session.plan),
    catalog_columns: 'choice | exact ID | name | meal type | audience | effort 1-10 | prep ahead | red meat | last planned',
    catalog: session.meals_snapshot.map(evidence), conversation_history: session.history, chronological_exchange: chronologicalExchange,
    planning_date: context?.planning_week_start ?? [...session.history].reverse().find((message) => message.context?.planning_week_start)?.context?.planning_week_start ?? session.created_at,
  };
  const scopeState = { latest_request: critique, forwarded_critique: forwardedCritique, context: context ?? {}, current_plan: planEvidence(session.plan), conversation_history: session.history, chronological_exchange: chronologicalExchange,
    catalog_meal_names: session.meals_snapshot.map((meal) => meal.name), rules: { intent: POLICY.intent, references: POLICY.references, evidence: POLICY.evidence } };
  let actions: string[] = [];
  let proposedScope: string[] = [];
  let audienceConflicts: string[] = [];
  let scopeVerified = false;
  let preview: MealPlanEntry[] | undefined;
  for (let round = 0; round < 2; round++) {
    let scope = await evaluateBatches({ ...scopeState, ...(round === 0 ? {} : { rejected_scope: proposedScope, audience_conflicts: audienceConflicts, correction: 'The previous action list omitted a required edit or included an unrelated edit. Reconsider every clause, including ordered moves/removals. Resolve any conflict between audience selection and slot actions using the user words. Preserve earlier completed empty slots.' }), ...(preview ? { after_requested_transfers_before_removals: planEvidence(preview) } : {}) }, scopeQuestions(session, critique, preview, round === 0), apiKey, signal);
    // Request status describes the saved plan, never a hypothetical transfer
    // preview. Reclassifying a correct preview as already satisfied drops edits.
    if (round === 0) {
      const request = answerChoice(scope, 'request');
      if (request === 'no_change' || request === 'already_satisfied') return noChange('no_change_requested', request === 'already_satisfied' ? 'The saved assignments already match this request.' : 'No meal edits were requested.');
      if (request === 'clarify') return noChange('clarification_required', 'Which day, meal and audience should change?');
      if (request === 'insufficient_evidence') return noChange('insufficient_evidence', 'The catalog does not contain the verified ingredient or other factual evidence required by this request.');
      if (request === 'infeasible') return noChange('infeasible', 'The exact requested meal is unavailable in this session catalog.');
      if (request !== 'edit') throw new AppError(502, 'JEV_INVALID_RESPONSE', 'The meal-plan outcome is invalid.');
    }
    if (round === 0 && answerChoice(scope, 'transfer_pattern') === 'transfers') {
      const targets = new Set(session.plan.flatMap((_, index) => answerChoice(scope, 'scope_' + index) === 'preserve' ? [] : [index]));
      preview = await transferPreview(session, critique, scopeState, apiKey, signal, targets);
      scope = await evaluateBatches({ ...scopeState, after_requested_transfers_before_removals: planEvidence(preview) }, scopeQuestions(session, critique, preview, false), apiKey, signal);
    }
    actions = session.plan.map((entry, index) => {
      const action = answerChoice(scope, 'scope_' + index);
      if (action === 'clear' && entry.meal_id === null && entry.meal_name === null) return 'preserve';
      if (action === 'preserve' && preview && preview[index]?.meal_id !== entry.meal_id) return 'replace';
      return action;
    });
    audienceConflicts = [];
    for (const id of Object.keys(scope).filter((key) => key.startsWith('audience_'))) {
      const audience = answerChoice(scope, id);
      const representative = session.plan[Number(id.split('_')[1])]!;
      const active = session.plan.some((entry, index) => entry.day_index === representative.day_index && entry.meal_type === representative.meal_type && actions[index] !== 'preserve');
      if (!active) continue;
      if (audience === 'ambiguous') return noChange('clarification_required', 'Please specify family, Brad/adult or both for ' + DAYS[representative.day_index] + ' ' + representative.meal_type + '.');
      session.plan.forEach((entry, index) => {
        if (entry.day_index !== representative.day_index || entry.meal_type !== representative.meal_type || actions[index] === 'preserve') return;
        if (audience !== 'both' && audience !== (entry.meal_track ?? 'family')) audienceConflicts.push(label(entry) + ' is marked for an edit but the audience judgment is ' + audience + '.');
      });
    }
    proposedScope = resolvedScope(session, actions);
    if (audienceConflicts.length > 0) continue;
    const reviewed = await evaluateJev({ ...scopeState, ...(preview ? { after_requested_transfers_before_removals: planEvidence(preview) } : {}), requested_actions: proposedScope, all_other_slots: 'Preserve exactly as currently saved. Already empty slots remain empty.' }, {
      scope_review: { type: 'choice', instructions: 'The user says ' + JSON.stringify(critique) + '. Check ONLY the list of requested_actions against the complete request resolved from this turn and conversation_history. A clarification that asks to proceed resumes ALL pending clauses of the unfulfilled earlier request; do not discard a clause merely because it is not restated here. Empty prior assistant operations mean those edits were not applied. Actually completed edits must not be replayed. Food selection and swap source identities are checked later. An originally assigned food may move to another slot before its original slot is cleared; do not interpret a final empty slot as deleting its original food everywhere. Does this list include every required nontrivial slot change and omit all unrelated changes? A replace action means that a filled food will be selected later, not that a specific food has already been chosen.', criteria: {
        correct: 'All and only required nontrivial targets appear with the correct final action. Slots already empty need not be listed for an empty request.',
        incorrect: 'A required target is missing, an unrelated target is included, or an action has the wrong final filled/empty state.',
      } },
    }, apiKey, signal);
    if (answerChoice(reviewed, 'scope_review') === 'correct') { scopeVerified = true; break; }
    if (round === 0 && !preview) preview = await transferPreview(session, critique, scopeState, apiKey, signal, new Set(actions.flatMap((action, index) => action === 'preserve' ? [] : [index])));
  }
  if (!scopeVerified) return noChange('validation_failed', 'The complete requested scope could not be verified.');
  if (actions.every((action) => action === 'preserve')) return noChange('no_change_requested', 'The saved assignments already match this request.');
  const plan = session.plan.map((entry, index) => actions[index] === 'preserve' ? { ...entry } : { ...entry, meal_id: null, meal_name: null });
  state['resolved_scope'] = proposedScope;
  const candidates = new Map<number, Meal[]>();
  actions.forEach((action, index) => {
    if (action !== 'replace') return;
    const entry = session.plan[index]!;
    candidates.set(index, session.meals_snapshot.filter((meal) => meal.meal_type === entry.meal_type && meal.audience === (entry.meal_track ?? 'family') && meal.id !== entry.meal_id));
  });
  const rejectionChecks = rejectionQuestions(session, candidates, critique);
  if (Object.keys(rejectionChecks).length > 0) {
    const answers = await evaluateBatches({ latest_request: critique, forwarded_critique: forwardedCritique, context: context ?? {}, current_plan: state['current_plan'], conversation_history: session.history, chronological_exchange: chronologicalExchange, resolved_scope: proposedScope }, rejectionChecks, apiKey, signal);
    const rejected = new Set(session.meals_snapshot.filter((_, index) => answers['rejection_' + index] && answerChoice(answers, 'rejection_' + index) === 'rejected').map((meal) => meal.id));
    state['active_rejected_foods'] = session.meals_snapshot.filter((meal) => rejected.has(meal.id)).map((meal) => ({ id: meal.id, name: meal.name }));
    for (const [index, meals] of candidates) {
      const available = meals.filter((meal) => !rejected.has(meal.id));
      if (available.length === 0) return noChange('validation_failed', 'No unrejected alternative could be verified for ' + label(session.plan[index]!) + '.');
      candidates.set(index, available);
    }
  }
  const fitQuestions = acceptableQuestions(session, candidates, critique);
  if (Object.keys(fitQuestions).length > 0) {
    const fit = await evaluateBatches({ ...state }, fitQuestions, apiKey, signal);
    for (const [index, meals] of candidates) {
      const suitable = meals.filter((meal) => answerChoice(fit, 'fit_' + index + '_' + session.meals_snapshot.indexOf(meal)) === 'fits');
      if (suitable.length === 0) return noChange('validation_failed', 'No suitable food could be verified for ' + label(session.plan[index]!) + '. This does not establish that the request is impossible.');
      candidates.set(index, suitable);
    }
  }
  const suitableCandidates = new Map(candidates);
  for (let repairRound = 0; repairRound < 2; repairRound += 1) {
    while (candidates.size > 0) {
      const possible = feasibleChoices(session, plan, candidates);
      if (possible.status === 'infeasible') return repairRound === 0
        ? noChange('infeasible', possible.explanation ?? 'No complete combination of acceptable catalog meals fits the requested edits while preserving other slots and the duplicate, per-audience prep-ahead and red-meat limits. A different requested scope or catalog choice is needed; retrying the same request cannot bypass these limits.')
        : noChange('validation_failed', 'The proposed food repair has no valid completion while keeping the other proposed assignments fixed. This does not establish that the original request is impossible.');
      if (possible.status === 'unknown') return noChange('validation_failed', 'The complete combination could not be verified within the evaluation limit.');
      const [index, meals] = [...possible.choices.entries()].sort((a, b) => a[1].length - b[1].length)[0]!;
      const entry = session.plan[index]!;
      const criteria = Object.fromEntries(meals.map((meal) => ['meal_' + session.meals_snapshot.indexOf(meal), meal.name]));
      const selected = await evaluateJev({ ...state, assignments_chosen_so_far: planEvidence(plan) }, {
        meal: { type: 'choice', instructions: 'The latest user says ' + JSON.stringify(critique) + '. Choose the actual replacement food for ' + label(entry) + '. Offered foods passed independent suitability and admit a complete structurally valid week. Honor food relationships across targets using assignments_chosen_so_far: filled assignments are fixed, while empty replacement targets are not yet selected. If food_validation_conflicts is present, repair the rejected proposal by changing only this slot; all other proposed foods and removals remain fixed. Choose a food that resolves those conflicts using the current proposal and original request. Choose the best fit to user intent and household effort, recency and family preferences in the supplied evidence. Keep resolved_scope fixed. Use pre-edit current_plan for exact transfers/swaps.', criteria },
      }, apiKey, signal);
      const key = answerChoice(selected, 'meal');
      const meal = meals.find((candidate) => 'meal_' + session.meals_snapshot.indexOf(candidate) === key);
      if (!meal) throw new AppError(502, 'JEV_INVALID_RESPONSE', 'The selected meal is not an eligible catalog choice.');
      plan[index] = { ...entry, meal_id: meal.id, meal_name: meal.name };
      candidates.delete(index);
    }
    state['proposed_plan'] = planEvidence(plan);
    const operations = planOperations(session, plan);
    const verified = applyOperations(session.plan, operations, session.meals_snapshot);
    const structuralConflicts = [...verified.errors, ...redMeatConflicts(session, plan)];
    if (structuralConflicts.length > 0) return noChange('validation_failed', 'The requested edits could not be verified together: ' + structuralConflicts.join(' '));
    const foodConflicts: string[] = [];
    const clearConflicts: string[] = [];
    const questions = verificationQuestions(session, plan, actions, critique);
    if (Object.keys(questions).length > 0) {
      const assignedIds = new Set(operations.map((entry) => entry.new_meal_id));
      const checked = await evaluateBatches({ latest_request: critique, forwarded_critique: forwardedCritique, context: context ?? {}, current_plan: state['current_plan'], conversation_history: session.history, chronological_exchange: chronologicalExchange, planning_date: state['planning_date'], rules: { references: POLICY.references, preferences: POLICY.preferences, evidence: POLICY.evidence }, resolved_scope: proposedScope, requested_changes: operations.map((op) => { const index = session.plan.findIndex((entry) => entry.day_index === op.day_index && (entry.meal_track ?? 'family') === op.meal_track && entry.meal_type === op.meal_type); return label(session.plan[index]!) + ': ' + (session.plan[index]!.meal_name ?? 'empty') + ' -> ' + (plan[index]!.meal_name ?? 'empty'); }), proposed_plan: state['proposed_plan'], chosen_food_details: session.meals_snapshot.flatMap((meal, index) => assignedIds.has(meal.id) ? [evidence(meal, index)] : []) }, questions, apiKey, signal);
      for (const id of Object.keys(questions)) {
        const answer = answerChoice(checked, id);
        if (id === 'requirements') {
          if (answer !== 'satisfied') foodConflicts.push('The selected foods do not satisfy the required relationships across slots (' + answer + ').');
        } else if (id.startsWith('fit_')) {
          const index = Number(id.split('_')[1]);
          if (answer !== 'fits') foodConflicts.push(label(session.plan[index]!) + ': ' + (plan[index]!.meal_name ?? 'empty') + ' did not pass the required food suitability check (' + answer + ').');
        } else if (id.startsWith('family_')) {
          const index = Number(id.split('_')[1]);
          if (!['distinct', 'legacy', 'requested'].includes(answer)) foodConflicts.push(label(session.plan[index]!) + ': ' + (plan[index]!.meal_name ?? 'empty') + ' introduces repetition of the same core dish.');
        } else if (answer !== 'explicitly_unneeded') clearConflicts.push(label(session.plan[Number(id.split('_')[1])]!) + ': explicit removal could not be verified.');
      }
    }
    if (clearConflicts.length > 0) return noChange('validation_failed', 'The requested edits could not be verified together: ' + [...clearConflicts, ...foodConflicts].join(' '));
    if (foodConflicts.length === 0) {
      if (operations.length === 0) return noChange('no_change_requested', 'The saved assignments already match this request.');
      logger.info('mealplan:jev_critique', { operation_count: operations.length });
      return { outcome: 'applied', operations, explanation: explain(session, operations) };
    }
    if (repairRound > 0) return noChange('validation_failed', 'The requested edits could not be verified after one food reconsideration: ' + foodConflicts.join(' '));
    const repairable = new Map<number, Meal[]>();
    for (const [index, meals] of suitableCandidates) {
      const alternatives = meals.filter((meal) => meal.id !== plan[index]!.meal_id);
      if (alternatives.length === 0) continue;
      const repairPlan = plan.map((entry, slot) => slot === index ? { ...entry, meal_id: null, meal_name: null } : { ...entry });
      const possible = feasibleChoices(session, repairPlan, new Map([[index, alternatives]]));
      if (possible.status === 'unknown') return noChange('validation_failed', 'A one-slot food repair could not be verified within the evaluation limit.');
      const allowed = possible.choices.get(index);
      if (possible.status === 'feasible' && allowed && allowed.length > 0) repairable.set(index, allowed);
    }
    if (repairable.size === 0) return noChange('validation_failed', 'No different food can repair one slot while keeping the other proposed assignments fixed. The food requirements remain unverified: ' + foodConflicts.join(' '));
    state['food_validation_conflicts'] = foodConflicts;
    state['rejected_proposal'] = planEvidence(plan);
    const criteria: Record<string, string> = { cannot_repair: 'The conflicts cannot be resolved by changing exactly one offered slot to one of its listed alternatives while keeping every other proposed assignment fixed.' };
    for (const [index, meals] of repairable) criteria['slot_' + index] = 'Reconsider only ' + label(session.plan[index]!) + ', currently ' + plan[index]!.meal_name + '. Available different foods: ' + meals.map((meal) => meal.name).join(', ') + '.';
    const repair = await evaluateJev({ ...state }, {
      repair_target: { type: 'choice', instructions: 'The latest user says ' + JSON.stringify(critique) + '. The completed proposed_plan failed the food checks listed in food_validation_conflicts. Identify one offered replacement slot whose food can be changed to resolve ALL those conflicts. Use this current proposed plan, the original request and conversation history. Every other proposed food, removal, and preserved slot must stay exactly fixed. Each offered alternative is independently suitable and structurally feasible with those fixed assignments. Select cannot_repair if a single offered slot change cannot satisfy the food requirements. This is the only reconsideration attempt.', criteria },
    }, apiKey, signal);
    const target = answerChoice(repair, 'repair_target');
    if (target === 'cannot_repair') return noChange('validation_failed', 'The proposed foods could not be verified and no one-slot repair was identified: ' + foodConflicts.join(' '));
    const index = Number(target.replace('slot_', ''));
    const alternatives = repairable.get(index);
    if (!alternatives || target !== 'slot_' + index) throw new AppError(502, 'JEV_INVALID_RESPONSE', 'The selected food repair is not an eligible target.');
    plan[index] = { ...plan[index]!, meal_id: null, meal_name: null };
    candidates.set(index, alternatives);
  }
  return noChange('validation_failed', 'The requested food requirements could not be verified within the reconsideration limit.');
}
