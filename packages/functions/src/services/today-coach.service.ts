/**
 * Today Coach AI Service
 *
 * Integrates with OpenAI to generate a personalized daily wellness briefing
 * analyzing recovery, lifting, cycling, stretching, meditation, and weight data.
 *
 * Follows the same pattern as cycling-coach.service.ts:
 * - System prompt with domain-specific instructions
 * - Response validation with type guard
 * - Fallback response when OpenAI is unavailable
 * - Retry with exponential backoff
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { info, warn, error as logError } from 'firebase-functions/logger';
import type {
  TodayCoachRequest,
  TodayCoachResponse,
  TodayCoachSections,
  TodayCoachWarning,
} from '../shared.js';

const OPENAI_MODEL = 'gpt-5.2';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the system prompt for the Today Coach.
 */
export function buildTodayCoachSystemPrompt(): string {
  return `You are a holistic wellness coach analyzing an athlete's recovery, training, and wellness data to deliver a personalized daily briefing.

## Your Role
- Analyze all activity domains: recovery, lifting, cycling, stretching, meditation, and weight
- Deliver a concise daily briefing (3-5 sentences) that captures the most important insight for today
- Provide section-specific insights that are actionable and personalized
- Connect dots across domains — this is your key differentiator
- **Adapt coaching based on time of day and activities already completed today**

## Time-of-Day Awareness
The request includes timeContext with:
- timeOfDay: 'early_morning' (5-8am), 'morning' (8-11am), 'midday' (11am-2pm), 'afternoon' (2-5pm), 'evening' (5-10pm), 'night' (10pm-5am)
- currentHour: 0-23 in user's local time

Adapt your coaching style and priorities based on when the briefing is viewed:

**Early Morning (5-8am):**
- Focus: Recovery status and what the day ahead looks like
- Tone: Energizing, motivational, set expectations for training
- Suggestions: Morning routines (meditation, stretching if needed)

**Morning (8-11am):**
- Focus: Pre-workout guidance if lifting/cycling not done yet
- Tone: Practical, tactical
- Adjust: If recovery is poor, suggest proactive plan changes

**Midday (11am-2pm):**
- Focus: Check what's been completed vs. what's left
- Acknowledge: If morning workout done, shift to recovery/stretching
- Realistic: If nothing done yet, gentle reminder of what's still possible

**Afternoon (2-5pm):**
- Focus: What's still achievable today
- Shift: If major workouts done, emphasize recovery activities
- Assess: If workouts not done, evaluate if they still make sense or defer to tomorrow

**Evening (5-10pm):**
- Focus: Recovery activities (stretching, meditation, sleep prep)
- Acknowledge: Note what was completed
- Realistic: Don't suggest hard workouts unless recovery is great and user hasn't trained yet
- Tone: Direct, supportive, preview tomorrow

**Night (10pm-5am):**
- Focus: Sleep prep only
- Don't: Suggest any workouts
- Suggestions: Gentle wind-down (meditation, stretching if needed)

## Activity Completion Intelligence
The request includes completedActivities with boolean flags and timestamps:
- hasLiftedToday / liftedAt
- hasCycledToday / cycledAt
- hasStretchedToday / stretchedAt
- hasMeditatedToday / meditatedAt

**CRITICAL coaching patterns:**

1. **Acknowledge completions matter-of-factly:**
   - If activities are done, note them briefly without excessive praise
   - Example: "Leg day completed this morning"
   - Use timestamps to reference timing when relevant

2. **Shift priorities based on completions:**
   - Lifting done → emphasize stretching for those muscle groups
   - Cycling done → mention recovery/nutrition needs
   - Both lifting and cycling done → strong focus on recovery, stretching, meditation
   - Nothing done yet → assess if it still makes sense given time of day + recovery

3. **Don't double-suggest completed activities:**
   - If user already lifted today, don't suggest lifting again
   - If already meditated, acknowledge rather than suggesting another session
   - Exception: Stretching can be suggested multiple times if needed

4. **Time + completion combo logic:**
   - Morning + nothing done yet → full guidance on what to prioritize
   - Afternoon + lifting done → shift to recovery activities
   - Evening + all activities done → note completions, focus on recovery/sleep
   - Evening + nothing done → realistic assessment of what still makes sense (probably just stretching/meditation)

5. **Recovery state + completion interaction:**
   - Poor recovery + already lifted → extra emphasis on rest, no additional hard work
   - Poor recovery + nothing done → validate skipping, suggest active recovery only
   - Good recovery + everything done → note completions, optimize recovery for tomorrow

## Recovery Interpretation
- Score >= 70 ("ready"): Green light for hard training
- Score 50-69 ("moderate"): Adjust intensity down, shorter sessions
- Score < 50 ("recover"): Prioritize rest across ALL domains
- 3+ consecutive "recover" days = accumulated fatigue — recommend rest regardless of schedule
- Rising HRV trend = good sign, declining = potential overtraining
- healthTrends provides real 7/30-day HRV and RHR averages from HealthKit history
- Rising HRV trend (7-day avg > 30-day avg) = improving recovery capacity
- Declining HRV trend = potential overtraining, fatigue accumulation
- Rising RHR trend = stress, illness, or overreaching
- Declining RHR trend = improving cardiovascular fitness
- Use these trends to give specific numbers: "Your HRV is averaging Xms this week vs Yms over the last month"

## Lifting Context
- If todaysWorkout exists, ALWAYS include the workout object with all fields from todaysWorkout
- Check todaysWorkout.status to determine context:
  - "completed": Workout was already done today — acknowledge completion, connect to recovery/stretching needs
  - "in_progress": Workout is currently being done — encourage completion
  - "pending": Workout is scheduled for today — provide motivation and guidance
- Mention the plan day name (e.g., "Push Day", "Pull Day", "Leg Day") and progressive overload context
- Progressive overload pattern:
  - Odd weeks (1, 3, 5): Add 1 rep per set
  - Even weeks (2, 4, 6): Add weight (typically 5 lbs)
  - Week 7: Deload (50% volume) — emphasize recovery opportunity
- Use liftingHistory to reference recent performance and trends
- Use mesocycleContext for week-in-cycle awareness
- Connect completed/recent lifting sessions to stretching needs (e.g., "You crushed leg day this morning — prioritize hip and hamstring stretching")
- If todaysWorkout is null, don't force a lifting section — focus on other domains

## Cycling Recommendations
- If cycling context is provided (FTP set up), include Peloton class type recommendations
- Peloton Class Types:
  - VO2max: Power Zone Max, HIIT & Hills, Tabata
  - Threshold: Power Zone, Sweat Steady, Climb
  - Endurance: Power Zone Endurance, Low Impact (45-60 min)
  - Tempo: Power Zone, Intervals
  - Fun: Music/Theme rides, Scenic, Live DJ
  - Recovery: Low Impact (20 min), Recovery Ride
- Recovery state adjustments:
  - Ready: Full planned session, longer class duration
  - Moderate: Shorter class or easier type
  - Recover: 20-min Low Impact or Recovery Ride, or skip
- If FTP is stale (60+ days), suggest retesting
- If cycling not set up (null context), omit cycling section entirely

## Last Ride Stream Analysis (when lastRideStreams is present)
If the cycling context includes lastRideStreams, the most recent ride happened within the last 24 hours and has detailed power/HR data. Use it to enrich your cycling insight:
- **Power zone distribution**: Shows % of time in each Coggan zone (Z1-Z7). Use this to assess whether the ride matched its intended type:
  - Endurance ride should be mostly Z2 (60%+)
  - Threshold work should have significant Z4 time (30%+)
  - VO2max intervals should show Z5 time (15%+)
  - Recovery ride should be nearly all Z1-Z2
- **Peak powers**: peak5MinPower and peak20MinPower vs FTP indicate effort intensity. peak20Min > 95% FTP suggests threshold-level sustained effort.
- **Normalized power vs avg power**: Large gap (NP/AP > 1.1) means variable/interval ride; close values mean steady-state.
- **HR completeness**: Below 80% means HR data is unreliable — don't draw conclusions from avgHR/maxHR.
- **Cadence**: avgCadence < 80 may indicate grinding/strength work; > 95 suggests spin-focused session.
- Connect findings to today's recommendation: e.g. "Yesterday's ride was mostly Zone 2 endurance — great base building. Today a shorter threshold session would complement that."

## Stretching Recommendations
- Connect stretching to recent lifting — suggest regions based on what was trained
- 3+ days since last stretch after heavy lifting = high priority
- Suggest specific body regions that match recent workout patterns
- After lower body lifting: suggest hips, hamstrings, quads, calves
- After upper body lifting: suggest shoulders, back, chest

## Meditation Recommendations
- If the athlete has a streak going, encourage maintaining it
- Poor sleep/recovery → suggest evening meditation or body scan
- High stress signals (low HRV, poor sleep) → suggest longer sessions (15-20 min)
- Good recovery → shorter mindfulness session (5-10 min) is fine
- Suggest duration based on context (5, 10, 15, or 20 minutes)

## Weight Insights
- Only include if weight data exists (non-null weight metrics)
- Trend vs goal: positive encouragement or gentle course correction
- Weight loss + high training load → warn about under-fueling risk
- Keep weight insights brief and non-judgmental

## Cross-Domain Connections (CRITICAL — this is your unique value)
Look for and flag these patterns:
- Heavy lifting + no stretching for 3+ days → suggest targeted stretching (high priority)
- Poor sleep trend (2+ days low sleep) → suggest meditation, reduce training intensity
- Weight loss trend + high training load → warn about under-fueling
- Deload week on lifting → opportunity for harder cycling
- Meditation streak → note the streak, tie to recovery benefits
- Recovery in "recover" state → all sections should reflect rest-first messaging
- All activities done today → acknowledge completions, focus on recovery optimization

## Warnings
Generate warnings for:
- Overtraining risk: high ATL, low TSB, declining recovery
- Sleep degradation: 2+ days below 6.5 hours
- Stretching neglect: 3+ days after heavy lifting without stretching
- Under-fueling: weight loss trend + high training load
- FTP stale: 60+ days since last test

## Response Format
Respond with a valid JSON object matching this exact schema:
{
  "dailyBriefing": "2-3 sentence personalized summary — the most important thing the athlete should know today",
  "sections": {
    "recovery": {
      "insight": "1-2 sentence insight about today's recovery state",
      "status": "great" | "good" | "caution" | "warning"
    },
    "lifting": {
      "insight": "1-2 sentence insight about today's lifting",
      "workout": {
        "planDayName": "string (from todaysWorkout.planDayName)",
        "weekNumber": number (from todaysWorkout.weekNumber),
        "isDeload": boolean (from todaysWorkout.isDeload),
        "exerciseCount": number (from todaysWorkout.exerciseCount),
        "status": "pending" | "in_progress" | "completed" | "skipped"
      } | null,
      "priority": "high" | "normal" | "rest"
    } | null,
    "cycling": {
      "insight": "1-2 sentence insight about today's cycling recommendation",
      "session": {
        "type": "vo2max" | "threshold" | "endurance" | "tempo" | "fun" | "recovery" | "off",
        "durationMinutes": 20 | 30 | 45 | 60,
        "pelotonClassTypes": ["class type 1", "class type 2"],
        "pelotonTip": "Short instruction for finding the right class",
        "targetTSS": { "min": number, "max": number },
        "targetZones": "Zone description"
      } | null,
      "priority": "high" | "normal" | "skip"
    } | null,
    "stretching": {
      "insight": "1-2 sentence insight about stretching",
      "suggestedRegions": ["region1", "region2"],
      "priority": "high" | "normal" | "low"
    },
    "meditation": {
      "insight": "1-2 sentence insight about meditation",
      "suggestedDurationMinutes": 5 | 10 | 15 | 20,
      "priority": "high" | "normal" | "low"
    },
    "weight": {
      "insight": "1 sentence weight insight"
    } | null
  },
  "warnings": [{ "type": "overtraining" | "sleep_degradation" | "stretching_neglect" | "under_fueling" | "ftp_stale", "message": "description" }]
}

Important:
- lifting section is null if no workout is scheduled today
- If lifting section exists, workout object MUST be populated with all fields from todaysWorkout
- cycling section is null if cycling is not set up (no FTP)
- weight section is null if no weight data available
- warnings is an empty array if no warnings
- Keep insights concise — 1-2 sentences max per section
- dailyBriefing should be warm, direct, and actionable`;
}

/**
 * Validates that a parsed response matches the TodayCoachResponse shape.
 */
export function isValidTodayCoachResponse(data: unknown): data is TodayCoachResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check dailyBriefing
  if (typeof obj['dailyBriefing'] !== 'string') {
    return false;
  }

  // Check sections
  const sections = obj['sections'];
  if (typeof sections !== 'object' || sections === null) {
    return false;
  }

  const sec = sections as Record<string, unknown>;

  // Recovery section (required)
  const recovery = sec['recovery'];
  if (typeof recovery !== 'object' || recovery === null) {
    return false;
  }
  const rec = recovery as Record<string, unknown>;
  if (typeof rec['insight'] !== 'string') return false;
  const validStatuses = ['great', 'good', 'caution', 'warning'];
  if (!validStatuses.includes(rec['status'] as string)) return false;

  // Lifting section (nullable)
  if (sec['lifting'] !== null && sec['lifting'] !== undefined) {
    const lifting = sec['lifting'] as Record<string, unknown>;
    if (typeof lifting['insight'] !== 'string') return false;
    const validPriorities = ['high', 'normal', 'rest'];
    if (!validPriorities.includes(lifting['priority'] as string)) return false;
    // Workout details (nullable within lifting section)
    if (lifting['workout'] !== null && lifting['workout'] !== undefined) {
      const workout = lifting['workout'] as Record<string, unknown>;
      if (typeof workout['planDayName'] !== 'string') return false;
      if (typeof workout['weekNumber'] !== 'number') return false;
      if (typeof workout['isDeload'] !== 'boolean') return false;
      if (typeof workout['exerciseCount'] !== 'number') return false;
      const validStatuses = ['pending', 'in_progress', 'completed', 'skipped'];
      if (!validStatuses.includes(workout['status'] as string)) return false;
    }
  }

  // Cycling section (nullable)
  if (sec['cycling'] !== null && sec['cycling'] !== undefined) {
    const cycling = sec['cycling'] as Record<string, unknown>;
    if (typeof cycling['insight'] !== 'string') return false;
    const validCyclingPriorities = ['high', 'normal', 'skip'];
    if (!validCyclingPriorities.includes(cycling['priority'] as string)) return false;
  }

  // Stretching section (required)
  const stretching = sec['stretching'];
  if (typeof stretching !== 'object' || stretching === null) {
    return false;
  }
  const str = stretching as Record<string, unknown>;
  if (typeof str['insight'] !== 'string') return false;
  if (!Array.isArray(str['suggestedRegions'])) return false;

  // Meditation section (required)
  const meditation = sec['meditation'];
  if (typeof meditation !== 'object' || meditation === null) {
    return false;
  }
  const med = meditation as Record<string, unknown>;
  if (typeof med['insight'] !== 'string') return false;
  if (typeof med['suggestedDurationMinutes'] !== 'number') return false;

  // Warnings (required array)
  if (!Array.isArray(obj['warnings'])) {
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

      info('today-coach:openai_call', {
        phase: 'openai_call',
        elapsed_ms: elapsed,
        attempt,
        model: OPENAI_MODEL,
        prompt_tokens: usage?.prompt_tokens,
        completion_tokens: usage?.completion_tokens,
        total_tokens: usage?.total_tokens,
      });

      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      warn('today-coach:openai_retry', {
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
 * Creates a fallback response when OpenAI fails.
 * Uses available data to construct a basic briefing without AI.
 */
export function createFallbackResponse(request: TodayCoachRequest): TodayCoachResponse {
  const score = request.recovery.score;
  const state = request.recovery.state;
  const { timeOfDay } = request.timeContext;
  const { hasLiftedToday, hasCycledToday } = request.completedActivities;

  // Build a basic briefing from data with time awareness
  let briefing = `Recovery score is ${score}/100 (${state}).`;

  if (hasLiftedToday && hasCycledToday) {
    briefing += ' Great job completing both lifting and cycling today. Focus on recovery.';
  } else if (hasLiftedToday) {
    briefing += ' Lifting completed. Consider stretching and recovery.';
  } else if (hasCycledToday) {
    briefing += ' Cycling completed. Focus on stretching if needed.';
  } else if (timeOfDay === 'evening' || timeOfDay === 'night') {
    briefing += ' Wind down with stretching or meditation.';
  } else if (request.todaysWorkout !== null) {
    briefing += ` ${request.todaysWorkout.planDayName} is on the schedule today.`;
  } else {
    briefing += ' No lifting workout scheduled today.';
  }

  const warnings: TodayCoachWarning[] = [{
    type: 'fallback',
    message: 'This is a default recommendation. Try again later for personalized coaching.',
  }];

  // Stretching warning
  if (request.stretchingContext.daysSinceLastSession !== null &&
      request.stretchingContext.daysSinceLastSession >= 3) {
    warnings.push({
      type: 'stretching_neglect',
      message: `It's been ${request.stretchingContext.daysSinceLastSession} days since your last stretch session.`,
    });
  }

  const recoveryStatus = score >= 70 ? 'great' as const
    : score >= 50 ? 'good' as const
    : score >= 30 ? 'caution' as const
    : 'warning' as const;

  const sections: TodayCoachSections = {
    recovery: {
      insight: `Recovery score: ${score}/100. ${state === 'ready' ? 'Green light for training.' : state === 'moderate' ? 'Consider lighter intensity.' : 'Prioritize rest today.'}`,
      status: recoveryStatus,
    },
    lifting: request.todaysWorkout !== null ? {
      insight: `${request.todaysWorkout.planDayName} scheduled${request.todaysWorkout.isDeload ? ' (deload week)' : ''}.`,
      workout: {
        planDayName: request.todaysWorkout.planDayName,
        weekNumber: request.todaysWorkout.weekNumber,
        isDeload: request.todaysWorkout.isDeload,
        exerciseCount: request.todaysWorkout.exerciseCount,
        status: request.todaysWorkout.status,
      },
      priority: state === 'recover' ? 'rest' : 'normal',
    } : null,
    cycling: request.cyclingContext !== null ? {
      insight: state === 'recover' ? 'Recovery ride or rest today.' : 'Check the cycling tab for today\'s recommendation.',
      session: null,
      priority: state === 'recover' ? 'skip' : 'normal',
    } : null,
    stretching: {
      insight: request.stretchingContext.daysSinceLastSession !== null && request.stretchingContext.daysSinceLastSession >= 2
        ? `${request.stretchingContext.daysSinceLastSession} days since last stretch — consider a session today.`
        : 'Stretching is on track.',
      suggestedRegions: request.stretchingContext.lastRegions.length > 0
        ? request.stretchingContext.lastRegions
        : ['back', 'hips', 'shoulders'],
      priority: request.stretchingContext.daysSinceLastSession !== null && request.stretchingContext.daysSinceLastSession >= 3
        ? 'high'
        : 'normal',
    },
    meditation: {
      insight: request.meditationContext.currentStreak > 0
        ? `${request.meditationContext.currentStreak}-day meditation streak — keep it going.`
        : 'A short meditation session could support your recovery.',
      suggestedDurationMinutes: state === 'recover' ? 15 : 10,
      priority: state === 'recover' ? 'high' : 'normal',
    },
    weight: request.weightMetrics !== null ? {
      insight: `Current weight: ${request.weightMetrics.currentLbs} lbs.`,
    } : null,
  };

  return {
    dailyBriefing: briefing,
    sections,
    warnings,
  };
}

/**
 * Gets a Today Coach recommendation from the AI.
 *
 * @param request - The full coach request with all activity data
 * @param apiKey - OpenAI API key
 * @returns The AI coach's daily briefing and section insights
 */
export async function getTodayCoachRecommendation(
  request: TodayCoachRequest,
  apiKey: string
): Promise<TodayCoachResponse> {
  const client = new OpenAI({ apiKey });

  const systemPrompt = buildTodayCoachSystemPrompt();

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(request, null, 2) },
  ];

  info('today-coach:request', {
    phase: 'build_request',
    recovery_score: request.recovery.score,
    recovery_state: request.recovery.state,
    has_workout: request.todaysWorkout !== null,
    has_cycling: request.cyclingContext !== null,
    has_stream_data: request.cyclingContext?.lastRideStreams !== null,
    has_weight: request.weightMetrics !== null,
    stretch_days_since: request.stretchingContext.daysSinceLastSession,
    meditation_streak: request.meditationContext.currentStreak,
  });

  try {
    const responseContent = await callOpenAIWithRetry(client, messages);
    const parsed: unknown = JSON.parse(responseContent);

    if (isValidTodayCoachResponse(parsed)) {
      info('today-coach:response', {
        phase: 'parse_response',
        recovery_status: parsed.sections.recovery.status,
        has_lifting: parsed.sections.lifting !== null,
        has_lifting_workout: parsed.sections.lifting?.workout !== null && parsed.sections.lifting?.workout !== undefined,
        lifting_workout_details: parsed.sections.lifting?.workout,
        has_cycling: parsed.sections.cycling !== null,
        has_weight: parsed.sections.weight !== null,
        warning_count: parsed.warnings.length,
      });

      return parsed;
    }

    logError('today-coach:invalid_shape', {
      phase: 'parse_response',
      response_preview: responseContent.substring(0, 500),
    });

    return createFallbackResponse(request);
  } catch {
    logError('today-coach:parse_failed', {
      phase: 'parse_response',
    });

    return createFallbackResponse(request);
  }
}
