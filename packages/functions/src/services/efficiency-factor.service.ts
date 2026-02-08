/**
 * Efficiency Factor Service
 *
 * Calculates Efficiency Factor (EF) for cycling activities.
 * EF = Normalized Power / Average Heart Rate
 *
 * EF is a measure of aerobic fitness:
 * - 1.10-1.30: Beginner
 * - 1.30-1.50: Intermediate
 * - 1.50-2.0+: Well-trained
 *
 * Rising EF over weeks indicates improving aerobic fitness.
 * Best measured on Zone 2 steady rides (IF < 0.88).
 */

/**
 * Calculate Efficiency Factor for a ride.
 *
 * @param normalizedPower - Normalized power in watts
 * @param avgHeartRate - Average heart rate in bpm
 * @returns EF value, or null if heart rate data is missing/invalid
 */
export function calculateEF(
  normalizedPower: number,
  avgHeartRate: number
): number | null {
  if (avgHeartRate <= 0 || normalizedPower <= 0) {
    return null;
  }

  const ef = normalizedPower / avgHeartRate;
  return Math.round(ef * 100) / 100; // Round to 2 decimal places
}

/**
 * Categorize an Efficiency Factor value.
 *
 * @param ef - Efficiency Factor value
 * @returns Category string
 */
export function categorizeEF(
  ef: number
): 'beginner' | 'intermediate' | 'trained' | 'well_trained' {
  if (ef >= 1.5) return 'well_trained';
  if (ef >= 1.3) return 'trained';
  if (ef >= 1.1) return 'intermediate';
  return 'beginner';
}
