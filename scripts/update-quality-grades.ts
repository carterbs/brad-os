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

const ROOT_DIR = path.resolve(import.meta.dirname ?? __dirname, '..');
const FUNCTIONS_SRC = path.join(ROOT_DIR, 'packages/functions/src');
const IOS_TESTS_DIR = path.join(ROOT_DIR, 'ios/BradOS/BradOSCore/Tests/BradOSCoreTests');
const QUALITY_GRADES_PATH = path.join(ROOT_DIR, 'docs/quality-grades.md');

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
const LOW_RISK_PATTERNS = ['debug', 'barcode', 'tts', 'context', 'lifting-context'];

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
      });
    }
    return domainCounts.get(domain)!;
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
      }
      continue;
    }

    // Top-level test files (e.g., shared.test.ts) - count under 'other'
    if (parts.length === 1) {
      const counts = ensureDomain('other');
      counts.handlers.push(basename);
      counts.total++;
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
    'lifting-context.service': 'reads lifting schedule for coach',
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
): Grade {
  if (isSharedDomain) {
    // Shared domains grade based on whether they have their own iOS tests
    // History reuses Calendar backend; Profile is a settings hub
    return 'B-';
  }

  const backendLevel = testCountLevel(backendCount);
  const iosLevel = testCountLevel(iosCount);
  const apiPartial = apiComplete !== 'Yes';

  // A: High backend + Medium+ iOS + no untested files + complete API
  if (backendLevel === 'High' && !hasUntested && !apiPartial) {
    if (iosLevel === 'High' || iosLevel === 'Medium') return 'A';
    return 'B+';
  }

  // B+ range: High backend with minor gaps
  if (backendLevel === 'High' && hasUntested && !hasUntestedHighRisk) {
    if (iosLevel === 'High') return 'B+';
    if (iosLevel === 'Medium') return 'B+';
    return 'B';
  }

  // B range: Medium backend
  if (backendLevel === 'Medium') {
    if (hasUntestedHighRisk) return 'C+';
    if (iosLevel === 'High') return 'B+';
    if (iosLevel === 'Medium') return 'B';
    return 'B-';
  }

  // High backend with high-risk untested
  if (backendLevel === 'High' && hasUntestedHighRisk) {
    return 'B';
  }

  // C range: Low backend
  if (backendLevel === 'Low') {
    if (hasUntestedHighRisk) {
      if (backendCount === 0) return 'C';
      return 'C+';
    }
    if (apiPartial) return 'C+';
    // Low tests with untested files = C+
    if (hasUntested && backendCount > 0) return 'C+';
    if (backendCount > 0 && !hasUntested) return 'B-';
    if (iosCount >= 1) return 'C';
    return 'C';
  }

  return 'C';
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
  'meditation': { apiComplete: 'Partial', iosComplete: 'Yes', isShared: false },
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

function buildNotes(
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

  // Add domain-specific context
  const domainContext: Record<string, string> = {
    'lifting': 'Most mature domain. Full progressive overload system.',
    'meal-planning': 'Widget + cache + AI critique flow complete.',
    'cycling': 'Complex Strava + AI coach system.',
    'stretching': 'TTS audio pipeline untested on backend.',
    'calendar': 'Lightweight aggregation layer. Adequate for scope.',
    'meditation': '`guidedMeditations` and `tts` handlers have zero tests.',
    'health': 'No iOS unit tests.',
    'today': '`today-coach` handler has zero tests. `today-coach.service.ts` and `today-coach-data.service.ts` untested.',
  };

  if (domainContext[domain]) {
    parts.push(domainContext[domain]!);
  }

  return parts.join(' ');
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

    const grade = calculateGrade(backendCount, iosCount, hasUntested, hasUntestedHighRisk, meta.isShared, meta.apiComplete);

    grades.push({
      domain,
      grade,
      backendTestCount: backendCount,
      iosTestCount: iosCount,
      testLevel: meta.isShared ? '(shared)' : `${testCountLevel(backendCount)} (${backendCount})`,
      iosLevel: meta.isShared ? '(shared)' : `${testCountLevel(iosCount)} (${iosCount})`,
      apiComplete: meta.apiComplete,
      iosComplete: meta.iosComplete,
      notes: buildNotes(domain, backendCounts, untestedInDomain),
    });
  }

  // Print summary
  for (const g of grades) {
    console.log(`  ${formatDomainName(g.domain).padEnd(16)} ${g.grade.padEnd(4)} Backend: ${g.testLevel.padEnd(10)} iOS: ${g.iosLevel}`);
  }
  console.log('');

  // Build the markdown
  const today = new Date().toISOString().split('T')[0];

  const todoNote = todoCount === 0
    ? 'Zero TODO/FIXME comments were found in the codebase (a positive signal for architecture health across all domains).'
    : `${todoCount} TODO/FIXME comment(s) were found in the codebase.`;

  const gradesTable = grades.map((g) =>
    `| ${formatDomainName(g.domain)} | **${g.grade}** | ${g.testLevel} | ${g.iosLevel} | ${g.apiComplete} | ${g.iosComplete} | ${g.notes} |`
  ).join('\n');

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

| Domain | Grade | Backend Tests | iOS Tests | API Complete | iOS Complete | Notes |
|--------|-------|---------------|-----------|--------------|--------------|-------|
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
