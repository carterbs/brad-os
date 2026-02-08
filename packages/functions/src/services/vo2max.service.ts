/**
 * VO2 Max Estimation Service
 *
 * Estimates VO2 max from cycling power data using the ACSM formula:
 * VO2 max (mL/kg/min) = [(10.8 × watts) / weight_kg] + 7
 *
 * Supports multiple estimation methods:
 * - FTP-derived: VO2max_power = FTP / 0.80, then apply formula
 * - Peak 5-min power: Direct VO2 max proxy (most accurate)
 * - Peak 20-min power: 95% as FTP approximation
 */

import type { VO2MaxMethod } from '../shared.js';

/**
 * Estimate VO2 max from FTP using the ACSM formula.
 *
 * Uses the relationship: VO2 max power ≈ FTP / 0.80
 * Then: VO2 max = [(10.8 × watts) / weight_kg] + 7
 *
 * @param ftpWatts - Functional Threshold Power in watts
 * @param weightKg - Body weight in kilograms
 * @returns Estimated VO2 max in mL/kg/min, or null if inputs are invalid
 */
export function estimateVO2MaxFromFTP(
  ftpWatts: number,
  weightKg: number
): number | null {
  if (ftpWatts <= 0 || weightKg <= 0) {
    return null;
  }

  const vo2MaxPower = ftpWatts / 0.8;
  return applyACSMFormula(vo2MaxPower, weightKg);
}

/**
 * Estimate VO2 max from peak power (5-min or 20-min) using the ACSM formula.
 *
 * For 5-min power, use directly as VO2 max power.
 * For 20-min power, multiply by 0.95 to approximate FTP, then divide by 0.80.
 *
 * @param peakWatts - Peak power output in watts
 * @param weightKg - Body weight in kilograms
 * @param method - The peak power method used
 * @returns Estimated VO2 max in mL/kg/min, or null if inputs are invalid
 */
export function estimateVO2MaxFromPeakPower(
  peakWatts: number,
  weightKg: number,
  method: VO2MaxMethod = 'peak_5min'
): number | null {
  if (peakWatts <= 0 || weightKg <= 0) {
    return null;
  }

  let vo2MaxPower: number;
  if (method === 'peak_20min') {
    // 20-min power * 0.95 = estimated FTP, then FTP / 0.80 = VO2 max power
    const estimatedFTP = peakWatts * 0.95;
    vo2MaxPower = estimatedFTP / 0.8;
  } else {
    // 5-min power is directly representative of VO2 max power
    vo2MaxPower = peakWatts;
  }

  return applyACSMFormula(vo2MaxPower, weightKg);
}

/**
 * Apply the ACSM cycling VO2 max formula.
 *
 * VO2 max (mL/kg/min) = [(10.8 × watts) / weight_kg] + 7
 *
 * @param watts - Power output in watts
 * @param weightKg - Body weight in kilograms
 * @returns VO2 max in mL/kg/min, rounded to 1 decimal place
 */
export function applyACSMFormula(watts: number, weightKg: number): number {
  const vo2max = (10.8 * watts) / weightKg + 7;
  return Math.round(vo2max * 10) / 10;
}

/**
 * Categorize a VO2 max value into a fitness level.
 *
 * Categories based on general male cycling population:
 * - Poor: < 35
 * - Fair: 35-45
 * - Good: 45-55
 * - Excellent: 55-65
 * - Elite: 65+
 *
 * @param vo2max - VO2 max value in mL/kg/min
 * @returns Fitness category string
 */
export function categorizeVO2Max(
  vo2max: number
): 'poor' | 'fair' | 'good' | 'excellent' | 'elite' {
  if (vo2max >= 65) return 'elite';
  if (vo2max >= 55) return 'excellent';
  if (vo2max >= 45) return 'good';
  if (vo2max >= 35) return 'fair';
  return 'poor';
}
