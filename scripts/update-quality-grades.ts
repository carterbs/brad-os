#!/usr/bin/env tsx
/**
 * Automated Quality Grade Recalculation
 *
 * Counts tests per domain, detects untested files, calculates grades,
 * and regenerates docs/quality-grades.md.
 *
 * Usage: npx tsx scripts/update-quality-grades.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(import.meta.dirname ?? __dirname, '..');
const FUNCTIONS_SRC = path.join(ROOT_DIR, 'packages/functions/src');
const IOS_TESTS_DIR = path.join(ROOT_DIR, 'ios/BradOS/BradOSCore/Tests/BradOSCoreTests');
const QUALITY_GRADES_PATH = path.join(ROOT_DIR, 'docs/quality-grades.md');
const COVERAGE_SUMMARY_PATH = path.join(ROOT_DIR, 'packages/functions/coverage/coverage-summary.json');

// ── Handler-to-feature map (mirrors lint-architecture.ts checkOrphanFeatures) ─

const HANDLER_FEATURE_MAP: Record<string, string> = {
  'exercises': 'lifting',
  'plans': 'lifting',
  'mesocycles': 'lifting',
  'workouts': 'lifting',
  'workoutSets': 'lifting',
  'stretches': 'stretching',
  'stretchSessions': 'stretching',
  'meditationSessions': 'meditation',
  'guidedMeditations': 'meditation',
  'tts': 'meditation',
  'health-sync': 'health',
  'health': 'health',
  'calendar': 'calendar',
  'today-coach': 'today',
  'cycling': 'cycling',
  'cycling-coach': 'cycling',
  'strava-webhook': 'cycling',
  'mealplans': 'meal-planning',
  'meals': 'meal-planning',
  'recipes': 'meal-planning',
  'ingredients': 'meal-planning',
  'barcodes': 'meal-planning',
  'mealplan-debug': 'meal-planning',
};

// Map service files to domains based on naming conventions
const SERVICE_DOMAIN_MAP: Record<string, string> = {
  'calendar.service': 'calendar',
  'cycling-coach.service': 'cycling',
  'efficiency-factor.service': 'cycling',
  'firestore-cycling.service': 'cycling',
  'firestore-recovery.service': 'health',
  'lifting-context.service': 'cycling',
  'mealplan-critique.service': 'meal-planning',
  'mealplan-generation.service': 'meal-planning',
  'mealplan-operations.service': 'meal-planning',
  'mesocycle.service': 'lifting',
  'dynamic-progression.service': 'lifting',
  'plan-modification.service': 'lifting',
  'progression.service': 'lifting',
  'strava.service': 'cycling',
  'today-coach.service': 'today',
  'today-coach-data.service': 'today',
  'training-load.service': 'cycling',
  'vo2max.service': 'cycling',
  'workout.service': 'lifting',
  'workout-set.service': 'lifting',
};

// Map repository files to domains
const REPO_DOMAIN_MAP: Record<string, string> = {
  'exercise.repository': 'lifting',
  'plan.repository': 'lifting',
  'plan-day.repository': 'lifting',
  'plan-day-exercise.repository': 'lifting',
  'mesocycle.repository': 'lifting',
  'workout.repository': 'lifting',
  'workout-set.repository': 'lifting',
  'stretch.repository': 'stretching',
  'stretchSession.repository': 'stretching',
  'meditationSession.repository': 'meditation',
  'guided-meditation.repository': 'meditation',
  'meal.repository': 'meal-planning',
  'recipe.repository': 'meal-planning',
  'ingredient.repository': 'meal-planning',
  'barcode.repository': 'meal-planning',
  'mealplan-session.repository': 'meal-planning',
};

// Map iOS test files to domains
const IOS_TEST_DOMAIN_MAP: Record<string, string> = {
  'ExerciseTests': 'lifting',
  'MesocycleTests': 'lifting',
  'PlanTests': 'lifting',
  'WorkoutTests': 'lifting',
  'ExercisesViewModelTests': 'lifting',
  'WorkoutStateManagerTests': 'lifting',
  'MealPlanActionTests': 'meal-planning',
  'MealPlanDecodingTests': 'meal-planning',
  'ShoppingListFormatterTests': 'meal-planning',
  'ShoppingListBuilderTests': 'meal-planning',
  'MealPlanCacheServiceTests': 'meal-planning',
  'RecipeCacheServiceTests': 'meal-planning',
  'RemindersServiceTests': 'meal-planning',
  'StretchSessionTests': 'stretching',
  'StretchUrgencyTests': 'stretching',
  'MeditationSessionTests': 'meditation',
  'CalendarViewModelTests': 'calendar',
  'DashboardViewModelTests': 'today',
  'ProfileViewModelTests': 'profile',
  'APIErrorTests': 'shared',
  'DateHelpersTests': 'shared',
  'LoadStateTests': 'shared',
  'TestHelpers': 'shared',
};

// Risk assessment for untested files
const HIGH_RISK_PATTERNS = ['today-coach', 'openai', 'ai', 'coach'];
const MEDIUM_RISK_PATTERNS = ['firestore', 'crud', 'recovery', 'sync', 'guided'];
const LOW_RISK_PATTERNS = ['debug', 'barcode', 'tts'];

// ── Collect functions ─────────────────────────────────────────────────────────

function collectFiles(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      results.push(...collectFiles(fullPath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Backend test counting ────────────────────────────────────────────────────

interface DomainTestCounts {
  handlers: string[];
  services: string[];
  repositories: string[];
  integration: string[];
  schemas: string[];
  total: number;
  testCaseCount: number;
  assertionCount: number;
}

function countBackendTests(): Map<string, DomainTestCounts> {
  const domainCounts = new Map<string, DomainTestCounts>();

  function ensureDomain(domain: string): DomainTestCounts {
    if (!domainCounts.has(domain)) {
      domainCounts.set(domain, {
        handlers: [],
        services: [],
        repositories: [],
        integration: [],
        schemas: [],
        total: 0,
        testCaseCount: 0,
        assertionCount: 0,
      });
    }
    return domainCounts.get(domain)!;
  }

  function countAssertions(testFile: string, counts: DomainTestCounts): void {
    const content = fs.readFileSync(testFile, 'utf-8');
    const testCases = (content.match(/\b(it|test)\s*\(/g) ?? []).length;
    const assertions = (content.match(/\bexpect\s*\(/g) ?? []).length;
    counts.testCaseCount += testCases;
    counts.assertionCount += assertions;
  }

  // Collect all test files
  const allTestFiles = collectFiles(FUNCTIONS_SRC, '.test.ts');

  for (const testFile of allTestFiles) {
    const rel = path.relative(FUNCTIONS_SRC, testFile);
    const parts = rel.split(path.sep);
    const basename = path.basename(testFile, '.test.ts');

    // Integration tests: __tests__/integration/*.integration.test.ts
    if (parts[0] === '__tests__' && parts[1] === 'integration') {
      const integrationName = basename.replace('.integration', '');
      const domain = HANDLER_FEATURE_MAP[integrationName];
      if (domain) {
        const counts = ensureDomain(domain);
        counts.integration.push(integrationName);
        counts.total++;
        countAssertions(testFile, counts);
      }
      continue;
    }

    // Handler tests: handlers/*.test.ts
    if (parts[0] === 'handlers') {
      const domain = HANDLER_FEATURE_MAP[basename];
      if (domain) {
        const counts = ensureDomain(domain);
        counts.handlers.push(basename);
        counts.total++;
        countAssertions(testFile, counts);
      }
      continue;
    }

    // Service tests: services/*.service.test.ts
    if (parts[0] === 'services') {
      const domain = SERVICE_DOMAIN_MAP[basename];
      if (domain) {
        const counts = ensureDomain(domain);
        counts.services.push(basename.replace('.service', ''));
        counts.total++;
        countAssertions(testFile, counts);
      }
      continue;
    }

    // Repository tests: repositories/*.repository.test.ts
    if (parts[0] === 'repositories') {
      const domain = REPO_DOMAIN_MAP[basename];
      if (domain) {
        const counts = ensureDomain(domain);
        counts.repositories.push(basename.replace('.repository', ''));
        counts.total++;
        countAssertions(testFile, counts);
      }
      continue;
    }

    // Schema tests: schemas/*.schema.test.ts
    if (parts[0] === 'schemas') {
      // Try to map schema to domain by name
      const schemaName = basename.replace('.schema', '');
      // Heuristic: check if the schema name maps to a known domain's handler
      let domain: string | undefined;
      for (const [handler, feat] of Object.entries(HANDLER_FEATURE_MAP)) {
        if (handler.includes(schemaName) || schemaName.includes(handler.replace(/s$/, ''))) {
          domain = feat;
          break;
        }
      }
      if (domain) {
        const counts = ensureDomain(domain);
        counts.schemas.push(schemaName);
        counts.total++;
        countAssertions(testFile, counts);
      }
      continue;
    }

    // Top-level test files (e.g., shared.test.ts) - count under 'other'
    if (parts.length === 1) {
      const counts = ensureDomain('other');
      counts.handlers.push(basename);
      counts.total++;
      countAssertions(testFile, counts);
    }
  }

  return domainCounts;
}

// ── iOS test counting ────────────────────────────────────────────────────────

function countIosTests(): Map<string, string[]> {
  const domainTests = new Map<string, string[]>();

  if (!fs.existsSync(IOS_TESTS_DIR)) return domainTests;

  const testFiles = collectFiles(IOS_TESTS_DIR, '.swift');

  for (const testFile of testFiles) {
    const basename = path.basename(testFile, '.swift');
    const domain = IOS_TEST_DOMAIN_MAP[basename];

    if (domain) {
      if (!domainTests.has(domain)) {
        domainTests.set(domain, []);
      }
      domainTests.get(domain)!.push(basename);
    } else {
      // Try to map unknown test files by name patterns
      const mapped = mapIosTestByName(basename);
      if (mapped) {
        if (!domainTests.has(mapped)) {
          domainTests.set(mapped, []);
        }
        domainTests.get(mapped)!.push(basename);
      }
    }
  }

  return domainTests;
}

function mapIosTestByName(name: string): string | null {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('exercise') || lowerName.includes('workout') || lowerName.includes('mesocycle') || lowerName.includes('plan') || lowerName.includes('lifting')) return 'lifting';
  if (lowerName.includes('meal') || lowerName.includes('recipe') || lowerName.includes('shopping') || lowerName.includes('ingredient')) return 'meal-planning';
  if (lowerName.includes('stretch')) return 'stretching';
  if (lowerName.includes('meditation')) return 'meditation';
  if (lowerName.includes('cycling') || lowerName.includes('strava')) return 'cycling';
  if (lowerName.includes('calendar')) return 'calendar';
  if (lowerName.includes('today') || lowerName.includes('dashboard')) return 'today';
  if (lowerName.includes('profile') || lowerName.includes('settings')) return 'profile';
  if (lowerName.includes('health')) return 'health';
  return null;
}

// ── Untested file detection ─────────────────────────────────────────────────

interface UntestedFile {
  file: string;
  domain: string;
  risk: 'High' | 'Medium' | 'Low';
  description: string;
}

function detectUntestedFiles(): UntestedFile[] {
  const untested: UntestedFile[] = [];
  const handlersDir = path.join(FUNCTIONS_SRC, 'handlers');
  const servicesDir = path.join(FUNCTIONS_SRC, 'services');

  // Check handlers
  if (fs.existsSync(handlersDir)) {
    const handlerFiles = fs.readdirSync(handlersDir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts')
    );

    for (const file of handlerFiles) {
      const name = file.replace('.ts', '');
      const testFile = path.join(handlersDir, `${name}.test.ts`);
      const integrationTestFile = path.join(FUNCTIONS_SRC, '__tests__/integration', `${name}.integration.test.ts`);

      if (!fs.existsSync(testFile) && !fs.existsSync(integrationTestFile)) {
        const domain = HANDLER_FEATURE_MAP[name] ?? 'unknown';
        untested.push({
          file: `handlers/${file}`,
          domain: formatDomainName(domain),
          risk: assessRisk(name, 'handler'),
          description: getHandlerDescription(name),
        });
      }
    }
  }

  // Check services
  if (fs.existsSync(servicesDir)) {
    const serviceFiles = fs.readdirSync(servicesDir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.spec.ts') && f !== 'index.ts'
    );

    for (const file of serviceFiles) {
      const name = file.replace('.ts', '');
      const testFile = path.join(servicesDir, `${name}.test.ts`);

      if (!fs.existsSync(testFile)) {
        const domain = SERVICE_DOMAIN_MAP[name] ?? 'unknown';
        untested.push({
          file: `services/${file}`,
          domain: formatDomainName(domain),
          risk: assessRisk(name, 'service'),
          description: getServiceDescription(name),
        });
      }
    }
  }

  return untested;
}

function assessRisk(name: string, _type: 'handler' | 'service'): 'High' | 'Medium' | 'Low' {
  const lowerName = name.toLowerCase();
  if (HIGH_RISK_PATTERNS.some((p) => lowerName.includes(p))) return 'High';
  if (LOW_RISK_PATTERNS.some((p) => lowerName.includes(p))) return 'Low';
  if (MEDIUM_RISK_PATTERNS.some((p) => lowerName.includes(p))) return 'Medium';
  return 'Medium';
}

function getHandlerDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'guidedMeditations': 'browse/fetch guided scripts',
    'today-coach': 'AI-powered daily briefing',
    'tts': 'thin wrapper around TTS API',
    'mealplan-debug': 'debug UI only',
    'barcodes': 'uses createResourceRouter (generated CRUD)',
    'cycling-coach': 'AI-powered cycling coaching',
  };
  return descriptions[name] ?? 'handler with routes';
}

function getServiceDescription(name: string): string {
  const descriptions: Record<string, string> = {
    'firestore-recovery.service': 'all health data CRUD',
    'firestore-cycling.service': 'all cycling data CRUD',
    'today-coach.service': 'OpenAI integration',
    'today-coach-data.service': 'aggregates all domain data',
    'lifting-context.service': 'feeds cycling coach + today briefing with lifting data',
  };
  return descriptions[name] ?? 'service logic';
}

// ── Grade calculation ────────────────────────────────────────────────────────

type Grade = 'A' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

interface DomainGrade {
  domain: string;
  grade: Grade;
  backendTestCount: number;
  iosTestCount: number;
  testLevel: string;
  iosLevel: string;
  apiComplete: string;
  iosComplete: string;
  coveragePct: number | null;
  assertionCount: number;
  density: string;
  notes: string;
}

function testCountLevel(count: number): string {
  if (count >= 10) return 'High';
  if (count >= 4) return 'Medium';
  return 'Low';
}

function calculateGrade(
  backendCount: number,
  iosCount: number,
  hasUntested: boolean,
  hasUntestedHighRisk: boolean,
  isSharedDomain: boolean,
  apiComplete: string,
  coveragePct: number | null,
  testCaseCount: number,
  assertionCount: number,
): Grade {
  let baseGrade: Grade;

  if (isSharedDomain) {
    baseGrade = 'B-';
  } else {
    const backendLevel = testCountLevel(backendCount);
    const iosLevel = testCountLevel(iosCount);
    const apiPartial = apiComplete !== 'Yes';

    if (backendLevel === 'High' && !hasUntested && !apiPartial) {
      baseGrade = (iosLevel === 'High' || iosLevel === 'Medium') ? 'A' : 'B+';
    } else if (backendLevel === 'High' && hasUntested && !hasUntestedHighRisk) {
      baseGrade = (iosLevel === 'High' || iosLevel === 'Medium') ? 'B+' : 'B';
    } else if (backendLevel === 'Medium') {
      if (hasUntestedHighRisk) baseGrade = 'C+';
      else if (iosLevel === 'High') baseGrade = 'B+';
      else if (iosLevel === 'Medium') baseGrade = 'B';
      else baseGrade = 'B-';
    } else if (backendLevel === 'High' && hasUntestedHighRisk) {
      baseGrade = 'B';
    } else if (backendLevel === 'Low') {
      if (hasUntestedHighRisk) {
        baseGrade = backendCount === 0 ? 'C' : 'C+';
      } else if (apiPartial) {
        baseGrade = 'C+';
      } else if (hasUntested && backendCount > 0) {
        baseGrade = 'C+';
      } else if (backendCount > 0 && !hasUntested) {
        baseGrade = 'B-';
      } else if (iosCount >= 1) {
        baseGrade = 'C';
      } else {
        baseGrade = 'C';
      }
    } else {
      baseGrade = 'C';
    }
  }

  // Coverage penalty: below 50% line coverage downgrades one notch
  if (coveragePct !== null && coveragePct < 50) {
    const gradeOrder: Grade[] = ['A', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
    const idx = gradeOrder.indexOf(baseGrade);
    if (idx >= 0 && idx < gradeOrder.length - 1) {
      baseGrade = gradeOrder[idx + 1]!;
    }
  }

  // Assertion density adjustment (±1 sub-grade)
  const density = testCaseCount > 0
    ? assertionCount / testCaseCount
    : 0;

  if (density >= 2.0) {
    // Thorough tests — positive adjustment (e.g., B → B+)
    const gradeOrder: Grade[] = ['A', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
    const idx = gradeOrder.indexOf(baseGrade);
    if (idx > 0) {
      baseGrade = gradeOrder[idx - 1]!;
    }
  } else if (density < 1.0 && testCaseCount > 0) {
    // Weak tests — negative adjustment (e.g., B+ → B)
    const gradeOrder: Grade[] = ['A', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
    const idx = gradeOrder.indexOf(baseGrade);
    if (idx >= 0 && idx < gradeOrder.length - 1) {
      baseGrade = gradeOrder[idx + 1]!;
    }
  }

  return baseGrade;
}

// ── Domain metadata (API/iOS completeness) ───────────────────────────────────

interface DomainMeta {
  apiComplete: string;
  iosComplete: string;
  isShared: boolean;
  customNotes?: string;
}

const DOMAIN_META: Record<string, DomainMeta> = {
  'lifting': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: false },
  'meal-planning': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: false },
  'cycling': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: false },
  'stretching': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: false },
  'calendar': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: false },
  'meditation': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: false },
  'health': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: false, customNotes: 'Health Sync' },
  'today': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: false },
  'history': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: true, customNotes: 'Reuses Calendar backend/ViewModel. No additional tests needed, but filter logic is untested.' },
  'profile': { apiComplete: 'Yes', iosComplete: 'Yes', isShared: true, customNotes: 'Settings hub, no own backend. Relies on health-sync and cycling backends.' },
};

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatDomainName(domain: string): string {
  const names: Record<string, string> = {
    'lifting': 'Lifting',
    'meal-planning': 'Meal Planning',
    'cycling': 'Cycling',
    'stretching': 'Stretching',
    'calendar': 'Calendar',
    'meditation': 'Meditation',
    'health': 'Health Sync',
    'today': 'Today',
    'history': 'History',
    'profile': 'Profile',
    'other': 'Other',
    'unknown': 'Unknown',
  };
  return names[domain] ?? domain;
}

// ── Coverage data parsing ────────────────────────────────────────────────────

interface CoverageSummaryEntry {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

interface CoverageSummaryFile {
  lines: CoverageSummaryEntry;
  statements: CoverageSummaryEntry;
  functions: CoverageSummaryEntry;
  branches: CoverageSummaryEntry;
}

function parseCoverageData(): Map<string, CoverageSummaryFile> | null {
  if (!fs.existsSync(COVERAGE_SUMMARY_PATH)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(COVERAGE_SUMMARY_PATH, 'utf-8')) as Record<string, CoverageSummaryFile>;
    const fileMap = new Map<string, CoverageSummaryFile>();
    for (const [filePath, data] of Object.entries(raw)) {
      if (filePath === 'total') continue;
      fileMap.set(filePath, data);
    }
    return fileMap;
  } catch {
    return null;
  }
}

function aggregateDomainCoverage(coverageData: Map<string, CoverageSummaryFile> | null): Map<string, number> {
  const domainCoverage = new Map<string, number>();
  if (!coverageData) return domainCoverage;

  // Group files by domain using existing maps
  const domainLines = new Map<string, { total: number; covered: number }>();

  for (const [filePath, data] of coverageData) {
    // Extract relative path from absolute
    const srcIdx = filePath.indexOf('packages/functions/src/');
    if (srcIdx === -1) continue;
    const relPath = filePath.slice(srcIdx + 'packages/functions/src/'.length);
    const parts = relPath.split('/');
    if (parts.length < 2) continue;

    const dir = parts[0]!;
    const fileName = parts[1]!.replace('.ts', '');

    let domain: string | undefined;
    if (dir === 'handlers') {
      domain = HANDLER_FEATURE_MAP[fileName];
    } else if (dir === 'services') {
      domain = SERVICE_DOMAIN_MAP[fileName];
    } else if (dir === 'repositories') {
      domain = REPO_DOMAIN_MAP[fileName];
    }

    if (!domain) continue;

    const existing = domainLines.get(domain) ?? { total: 0, covered: 0 };
    existing.total += data.lines.total;
    existing.covered += data.lines.covered;
    domainLines.set(domain, existing);
  }

  for (const [domain, { total, covered }] of domainLines) {
    if (total > 0) {
      domainCoverage.set(domain, Math.round((covered / total) * 100));
    }
  }

  return domainCoverage;
}

function buildMechanicalNotes(
  domain: string,
  counts: DomainTestCounts | undefined,
  untestedInDomain: UntestedFile[],
): string {
  const meta = DOMAIN_META[domain];
  if (meta?.customNotes && meta.isShared) {
    return meta.customNotes;
  }

  const parts: string[] = [];

  if (counts) {
    const breakdown: string[] = [];
    if (counts.handlers.length > 0) breakdown.push(`${counts.handlers.length} handler`);
    if (counts.services.length > 0) breakdown.push(`${counts.services.length} service`);
    if (counts.repositories.length > 0) breakdown.push(`${counts.repositories.length} repo`);
    if (counts.integration.length > 0) breakdown.push(`${counts.integration.length} integration`);
    if (counts.schemas.length > 0) breakdown.push(`${counts.schemas.length} schema`);
    if (breakdown.length > 0) {
      parts.push(`${breakdown.join(', ')} tests.`);
    }
  }

  if (untestedInDomain.length > 0) {
    const highRisk = untestedInDomain.filter((u) => u.risk === 'High');
    if (highRisk.length > 0) {
      parts.push(`${highRisk.map((u) => `\`${u.file.split('/').pop()?.replace('.ts', '')}\``).join(', ')} untested (high risk).`);
    } else {
      parts.push(`${untestedInDomain.length} untested file(s).`);
    }
  }

  return parts.join(' ');
}

// ── AI-generated annotations via claude -p ──────────────────────────────────

interface AIAnnotations {
  domainNotes: Record<string, string>;
  techDebt: string;
  recentlyCompleted: string;
}

function callClaude(prompt: string): string | null {
  // Strip CLAUDECODE env var so claude -p works when invoked from within a Claude Code session
  const env = { ...process.env };
  delete env['CLAUDECODE'];

  try {
    return execSync('claude -p --model sonnet', {
      input: prompt,
      encoding: 'utf-8',
      timeout: 5 * 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
  } catch (err) {
    console.warn(`  Warning: claude -p failed (${(err as Error).message})`);
    return null;
  }
}

function generateAIAnnotations(
  grades: DomainGrade[],
  untested: UntestedFile[],
  backendTests: Map<string, DomainTestCounts>,
  existingTechDebt: string,
  existingRecentlyCompleted: string,
): AIAnnotations {
  // Build a flat list of all tested files so claude can cross-reference against tech debt claims
  const testedFiles: { file: string; domain: string }[] = [];
  for (const [domain, counts] of backendTests) {
    if (domain === 'other') continue;
    for (const h of counts.handlers) testedFiles.push({ file: `handlers/${h}.test.ts`, domain: formatDomainName(domain) });
    for (const s of counts.services) testedFiles.push({ file: `services/${s}.service.test.ts`, domain: formatDomainName(domain) });
    for (const r of counts.repositories) testedFiles.push({ file: `repositories/${r}.repository.test.ts`, domain: formatDomainName(domain) });
    for (const i of counts.integration) testedFiles.push({ file: `__tests__/integration/${i}.integration.test.ts`, domain: formatDomainName(domain) });
  }

  const metricsForClaude = grades
    .filter((g) => !DOMAIN_META[g.domain]?.isShared)
    .map((g) => ({
      domain: formatDomainName(g.domain),
      key: g.domain,
      grade: g.grade,
      backendTests: g.backendTestCount,
      iosTests: g.iosTestCount,
      coverage: g.coveragePct,
      apiComplete: g.apiComplete,
      untestedFiles: untested
        .filter((u) => u.domain === formatDomainName(g.domain))
        .map((u) => ({ file: u.file, risk: u.risk })),
    }));

  const prompt = `You are updating a quality grades document for a personal wellness iOS + Express app. You have three jobs.

## Job 1: Domain Notes
For each non-shared domain, write ONE short sentence (max 15 words) highlighting its most notable quality characteristic. Don't restate numbers already in the table.

## Job 2: Update Active Tech Debt
IMPORTANT: Start from the EXISTING tech debt section below and make MINIMAL, TARGETED changes:
- If a "- [ ]" item is now resolved (a previously missing test file now exists per the metrics), change it to "- [x]" and move it to recently completed
- Keep ALL subsections (### Backend Refactor, ### Test Coverage Gaps, ### Feature Gaps, ### Other) even if unchanged
- Keep ALL items that are still open — do NOT remove or reword them
- You MAY add new "- [ ]" items if the metrics reveal a gap not already listed
- Do NOT rewrite or simplify existing items

## Job 3: Update Recently Completed
IMPORTANT: Keep ALL existing "- [x]" items exactly as-is. Only ADD newly resolved items moved from tech debt. Append new items at the TOP of the list.

## Current metrics:
${JSON.stringify(metricsForClaude, null, 2)}

## Untested files (no test file exists):
${JSON.stringify(untested.map((u) => ({ file: u.file, domain: u.domain, risk: u.risk })), null, 2)}

## Files that DO have tests (use this to resolve stale tech debt items):
${JSON.stringify(testedFiles, null, 2)}

## Existing Active Tech Debt section (PRESERVE THIS STRUCTURE):
${existingTechDebt}

## Existing Recently Completed section (KEEP ALL ITEMS):
${existingRecentlyCompleted}

## Response format
Return ONLY a JSON object with exactly these three keys, no markdown fences:
{
  "domainNotes": {"lifting": "note", "cycling": "note", ...},
  "techDebt": "full markdown for Active Tech Debt (after ## heading). MUST keep all ### subsections.",
  "recentlyCompleted": "full markdown for Recently Completed (after ## heading). MUST keep all existing items."
}`;

  console.log('  Generating AI annotations via claude -p...');
  const result = callClaude(prompt);

  if (!result) {
    console.warn('  Skipping AI annotations');
    return { domainNotes: {}, techDebt: existingTechDebt, recentlyCompleted: existingRecentlyCompleted };
  }

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('  Warning: could not parse claude response, keeping existing sections');
      return { domainNotes: {}, techDebt: existingTechDebt, recentlyCompleted: existingRecentlyCompleted };
    }
    const parsed = JSON.parse(jsonMatch[0]) as AIAnnotations;

    // Validate structure
    if (!parsed.domainNotes || typeof parsed.domainNotes !== 'object') parsed.domainNotes = {};
    if (!parsed.techDebt || typeof parsed.techDebt !== 'string') parsed.techDebt = existingTechDebt;
    if (!parsed.recentlyCompleted || typeof parsed.recentlyCompleted !== 'string') parsed.recentlyCompleted = existingRecentlyCompleted;

    return parsed;
  } catch {
    console.warn('  Warning: failed to parse AI response JSON, keeping existing sections');
    return { domainNotes: {}, techDebt: existingTechDebt, recentlyCompleted: existingRecentlyCompleted };
  }
}

// ── Build test file inventory section ───────────────────────────────────────

function buildTestInventorySection(
  backendTests: Map<string, DomainTestCounts>,
  iosTests: Map<string, string[]>,
): string {
  const lines: string[] = [];

  lines.push('## Test File Inventory');
  lines.push('');
  lines.push('### Backend (packages/functions/src/)');
  lines.push('');

  // Sort domains by total test count descending
  const sortedDomains = [...backendTests.entries()]
    .filter(([domain]) => domain !== 'other')
    .sort(([, a], [, b]) => b.total - a.total);

  for (const [domain, counts] of sortedDomains) {
    if (counts.total === 0) continue;

    lines.push(`**${formatDomainName(domain)} (${counts.total} test files):**`);

    if (counts.handlers.length > 0) {
      lines.push(`- Handlers: ${counts.handlers.join(', ')}`);
    }
    if (counts.services.length > 0) {
      lines.push(`- Services: ${counts.services.join(', ')}`);
    }
    if (counts.repositories.length > 0) {
      lines.push(`- Repositories: ${counts.repositories.join(', ')}`);
    }
    if (counts.integration.length > 0) {
      lines.push(`- Integration: ${counts.integration.join(', ')}`);
    }
    if (counts.schemas.length > 0) {
      lines.push(`- Schemas: ${counts.schemas.map((s) => `${s}.schema`).join(', ')}`);
    }

    lines.push('');
  }

  // Domains with 0 backend tests
  const allDomainKeys = Object.keys(DOMAIN_META);
  for (const domain of allDomainKeys) {
    if (backendTests.has(domain)) continue;
    if (DOMAIN_META[domain]?.isShared) continue;
    lines.push(`**${formatDomainName(domain)} (0 test files)**`);
    lines.push('');
  }

  // Other tests
  const otherCounts = backendTests.get('other');
  if (otherCounts && otherCounts.total > 0) {
    lines.push(`**Other:** ${otherCounts.handlers.join(', ')} (${otherCounts.total})`);
    lines.push('');
  }

  // iOS section
  lines.push('### iOS (BradOSCore/Tests/)');
  lines.push('');

  const domainOrder = ['lifting', 'meal-planning', 'stretching', 'meditation', 'calendar', 'today', 'profile', 'health', 'cycling'];

  for (const domain of domainOrder) {
    const tests = iosTests.get(domain);
    if (tests && tests.length > 0) {
      lines.push(`- ${formatDomainName(domain)}: ${tests.join(', ')} (${tests.length})`);
    }
  }

  // Shared iOS tests
  const sharedTests = iosTests.get('shared');
  if (sharedTests && sharedTests.length > 0) {
    lines.push(`- Shared: ${sharedTests.join(', ')} (${sharedTests.length})`);
  }

  return lines.join('\n');
}

// ── Build untested files section ────────────────────────────────────────────

function buildUntestedSection(untested: UntestedFile[]): string {
  if (untested.length === 0) {
    return '### Untested Backend Files\n\nAll handler and service files have corresponding tests.';
  }

  const lines: string[] = [];
  lines.push('### Untested Backend Files');
  lines.push('');
  lines.push('These handlers/services have no corresponding test file:');
  lines.push('');
  lines.push('| File | Domain | Risk |');
  lines.push('|------|--------|------|');

  for (const file of untested) {
    lines.push(`| \`${file.file}\` | ${file.domain} | ${file.risk} - ${file.description} |`);
  }

  return lines.join('\n');
}

// ── Check for TODO/FIXME ────────────────────────────────────────────────────

function countTodoComments(): number {
  let count = 0;
  const dirsToCheck = [
    path.join(FUNCTIONS_SRC, 'handlers'),
    path.join(FUNCTIONS_SRC, 'services'),
    path.join(FUNCTIONS_SRC, 'repositories'),
    path.join(FUNCTIONS_SRC, 'types'),
    path.join(FUNCTIONS_SRC, 'schemas'),
  ];

  for (const dir of dirsToCheck) {
    if (!fs.existsSync(dir)) continue;
    const files = collectFiles(dir, '.ts').filter((f) => !f.endsWith('.test.ts'));
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(/\b(TODO|FIXME)\b/g);
      if (matches) count += matches.length;
    }
  }

  return count;
}

// ── Extract manually curated sections ───────────────────────────────────────

function extractCuratedSections(content: string): { techDebt: string; recentlyCompleted: string } {
  const techDebtMatch = content.match(/## Active Tech Debt\n([\s\S]*?)(?=\n---\n|\n## Recently Completed)/);
  const recentlyMatch = content.match(/## Recently Completed\n([\s\S]*?)$/);

  return {
    techDebt: techDebtMatch ? techDebtMatch[1]!.trim() : '',
    recentlyCompleted: recentlyMatch ? recentlyMatch[1]!.trim() : '',
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Calculating quality grades...\n');

  // Read existing file for manually curated sections
  let curatedSections = { techDebt: '', recentlyCompleted: '' };
  if (fs.existsSync(QUALITY_GRADES_PATH)) {
    const existing = fs.readFileSync(QUALITY_GRADES_PATH, 'utf-8');
    curatedSections = extractCuratedSections(existing);
  }

  // Count tests
  const backendTests = countBackendTests();
  const iosTests = countIosTests();
  const untested = detectUntestedFiles();
  const todoCount = countTodoComments();
  const coverageData = parseCoverageData();
  const domainCoverage = aggregateDomainCoverage(coverageData);

  // Calculate grades for each domain
  const grades: DomainGrade[] = [];
  const domainOrder = ['lifting', 'meal-planning', 'cycling', 'stretching', 'calendar', 'meditation', 'health', 'history', 'today', 'profile'];

  for (const domain of domainOrder) {
    const meta = DOMAIN_META[domain];
    if (!meta) continue;

    const backendCounts = backendTests.get(domain);
    const backendCount = backendCounts?.total ?? 0;
    const iosDomainTests = iosTests.get(domain) ?? [];
    const iosCount = iosDomainTests.length;
    const untestedInDomain = untested.filter((u) => {
      const domainName = Object.entries(HANDLER_FEATURE_MAP)
        .find(([, v]) => formatDomainName(v) === u.domain)?.[1]
        ?? Object.entries(SERVICE_DOMAIN_MAP)
          .find(([, v]) => formatDomainName(v) === u.domain)?.[1]
        ?? '';
      return domainName === domain;
    });
    const hasUntestedHandlers = untestedInDomain.some((u) => u.file.startsWith('handlers/'));
    const hasUntestedServices = untestedInDomain.some((u) => u.file.startsWith('services/'));
    const hasUntestedHighRisk = untestedInDomain.some((u) => u.risk === 'High');
    const hasUntested = hasUntestedHandlers || hasUntestedServices;

    const coveragePct = domainCoverage.get(domain) ?? null;
    const domainTestCaseCount = backendCounts?.testCaseCount ?? 0;
    const domainAssertionCount = backendCounts?.assertionCount ?? 0;
    const grade = calculateGrade(backendCount, iosCount, hasUntested, hasUntestedHighRisk, meta.isShared, meta.apiComplete, coveragePct, domainTestCaseCount, domainAssertionCount);

    const densityStr = domainTestCaseCount > 0
      ? (domainAssertionCount / domainTestCaseCount).toFixed(1) + 'x'
      : '—';

    grades.push({
      domain,
      grade,
      backendTestCount: backendCount,
      iosTestCount: iosCount,
      testLevel: meta.isShared ? '(shared)' : `${testCountLevel(backendCount)} (${backendCount})`,
      iosLevel: meta.isShared ? '(shared)' : `${testCountLevel(iosCount)} (${iosCount})`,
      apiComplete: meta.apiComplete,
      iosComplete: meta.iosComplete,
      coveragePct,
      assertionCount: domainAssertionCount,
      density: densityStr,
      notes: buildMechanicalNotes(domain, backendCounts, untestedInDomain),
    });
  }

  // Generate AI-powered annotations (domain notes + tech debt + recently completed)
  const ai = generateAIAnnotations(grades, untested, backendTests, curatedSections.techDebt, curatedSections.recentlyCompleted);
  for (const g of grades) {
    const aiNote = ai.domainNotes[g.domain];
    if (aiNote) {
      g.notes = g.notes ? `${g.notes} ${aiNote}` : aiNote;
    }
  }
  curatedSections.techDebt = ai.techDebt;
  curatedSections.recentlyCompleted = ai.recentlyCompleted;

  // Print summary
  for (const g of grades) {
    const covStr = g.coveragePct !== null ? `${g.coveragePct}%` : '--';
    console.log(`  ${formatDomainName(g.domain).padEnd(16)} ${g.grade.padEnd(4)} Backend: ${g.testLevel.padEnd(10)} iOS: ${g.iosLevel.padEnd(10)} Cov: ${covStr}`);
  }
  console.log('');

  // Build the markdown
  const today = new Date().toISOString().split('T')[0];

  const todoNote = todoCount === 0
    ? 'Zero TODO/FIXME comments were found in the codebase (a positive signal for architecture health across all domains).'
    : `${todoCount} TODO/FIXME comment(s) were found in the codebase.`;

  const gradesTable = grades.map((g) => {
    const covStr = g.coveragePct !== null ? `${g.coveragePct}%` : '--';
    return `| ${formatDomainName(g.domain)} | **${g.grade}** | ${g.testLevel} | ${g.iosLevel} | ${g.assertionCount} | ${g.density} | ${covStr} | ${g.apiComplete} | ${g.iosComplete} | ${g.notes} |`;
  }).join('\n');

  const md = `# Domain Quality Grades

Last updated: ${today}

## Grading Methodology

Grades are based on four dimensions, each weighted equally:

1. **Test Coverage** - Count of backend test files (handler + service + repository + integration) and iOS test files per domain. High = 10+, Medium = 4-9, Low = 0-3.
2. **API Completeness** - Does the backend have all endpoints the iOS app needs? Are there handlers without tests?
3. **iOS Completeness** - Are all views, view models, and services present for the full user flow?
4. **Architecture Health** - Clean layer separation, no TODO/FIXME debt, schemas validated, proper typing.

**Grade scale:**
- **A** - All four dimensions are strong. High test coverage, complete API and iOS, clean architecture.
- **B** - Most dimensions are strong but one area has a gap (e.g., medium test coverage, or one untested handler).
- **C** - Multiple gaps. Low test coverage, missing tests for key services, or incomplete feature.
- **D** - Significant gaps across multiple dimensions. Feature works but is fragile.
- **F** - Broken or non-functional.

${todoNote}

---

## Domain Grades

| Domain | Grade | Backend Tests | iOS Tests | Assertions | Density | Coverage | API Complete | iOS Complete | Notes |
|--------|-------|---------------|-----------|------------|---------|----------|--------------|--------------|-------|
${gradesTable}

---

${buildTestInventorySection(backendTests, iosTests)}

${buildUntestedSection(untested)}

---

## Active Tech Debt

${curatedSections.techDebt}

---

## Recently Completed

${curatedSections.recentlyCompleted}
`;

  fs.writeFileSync(QUALITY_GRADES_PATH, md);
  console.log(`Written to ${path.relative(ROOT_DIR, QUALITY_GRADES_PATH)}`);
}

main();
