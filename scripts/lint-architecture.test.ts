import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type LinterConfig,
  checkLayerDeps,
  checkSchemaBoundary,
  checkTypeDedup,
  checkFirebaseRoutes,
  checkIosLayers,
  checkArchMapRefs,
  checkClaudeMdRefs,
  checkOrphanFeatures,
  checkPlanLifecycle,
  checkNoConsoleLog,
  checkNoRawUrlSession,
  checkTypesInTypesDir,
  checkSchemasInSchemasDir,
  checkNoSkippedTests,
  checkUntestedHighRisk,
  checkTestFactoryUsage,
  checkNoInlineApiResponse,
  checkNoFocusedTests,
  checkTestQuality,
  checkQualityGradesFreshness,
  checkRepositoryTestCoverage,
  checkMarkdownLinks,
} from './lint-checks.js';
import { generateRewrites } from './rewrite-utils.js';
import { type EndpointEntry } from '../packages/functions/src/endpoint-manifest.js';

// ── Test Helpers ─────────────────────────────────────────────────────────────

function createFixture(): { config: LinterConfig; rootDir: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-test-'));
  const functionsSrc = path.join(rootDir, 'packages/functions/src');
  fs.mkdirSync(functionsSrc, { recursive: true });
  return {
    config: { rootDir, functionsSrc },
    rootDir,
  };
}

function writeFixture(rootDir: string, relPath: string, content: string): void {
  const fullPath = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function cleanup(rootDir: string): void {
  fs.rmSync(rootDir, { recursive: true, force: true });
}

// ── Check 1: Layer Dependencies ──────────────────────────────────────────────

describe('checkLayerDeps', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when handlers import from services and types', () => {
    writeFixture(rootDir, 'packages/functions/src/types/exercise.ts',
      'export interface Exercise { id: string; }');
    writeFixture(rootDir, 'packages/functions/src/services/workout.service.ts',
      "import { Exercise } from '../types/exercise.js';\nexport function getExercise(): Exercise { return { id: '1' }; }");
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { getExercise } from '../services/workout.service.js';");

    const result = checkLayerDeps(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when a service imports from handlers', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      'export const app = {};');
    writeFixture(rootDir, 'packages/functions/src/services/workout.service.ts',
      "import { app } from '../handlers/exercises.js';");

    const result = checkLayerDeps(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('services');
    expect(result.violations[0]).toContain('handlers');
  });

  it('ignores test files', () => {
    writeFixture(rootDir, 'packages/functions/src/services/workout.service.test.ts',
      "import { app } from '../handlers/exercises.js';");

    const result = checkLayerDeps(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 2: Schema-at-Boundary ──────────────────────────────────────────────

describe('checkSchemaBoundary', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when POST routes have Zod validation', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "app.post('/exercises', validate(createExerciseSchema), asyncHandler(async (req, res) => {}));");

    const result = checkSchemaBoundary(config);
    expect(result.passed).toBe(true);
  });

  it('fails when POST route lacks Zod validation', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "app.post('/exercises', asyncHandler(async (req, res) => {}));");

    const result = checkSchemaBoundary(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('without Zod validation');
  });

  it('allows action routes without validation', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/workouts.ts',
      "app.post('/workouts/:id/complete', asyncHandler(async (req, res) => {}));");

    const result = checkSchemaBoundary(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 3: Type Deduplication ──────────────────────────────────────────────

describe('checkTypeDedup', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when types are defined only in types/', () => {
    writeFixture(rootDir, 'packages/functions/src/types/exercise.ts',
      'export interface Exercise { id: string; }');
    writeFixture(rootDir, 'packages/functions/src/services/workout.service.ts',
      "import { Exercise } from '../types/exercise.js';");

    const result = checkTypeDedup(config);
    expect(result.passed).toBe(true);
  });

  it('fails when a type is defined in multiple files', () => {
    writeFixture(rootDir, 'packages/functions/src/types/exercise.ts',
      'export interface Exercise { id: string; }');
    writeFixture(rootDir, 'packages/functions/src/services/workout.service.ts',
      'export interface Exercise { id: string; name: string; }');

    const result = checkTypeDedup(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('Exercise');
    expect(result.violations[0]).toContain('multiple files');
  });

  it('does not count re-exports as duplicates', () => {
    writeFixture(rootDir, 'packages/functions/src/types/exercise.ts',
      'export interface Exercise { id: string; }');
    writeFixture(rootDir, 'packages/functions/src/types/shared.ts',
      "export { Exercise } from './exercise.js';");

    const result = checkTypeDedup(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 4: Firebase Route Consistency ──────────────────────────────────────

describe('checkFirebaseRoutes', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when firebase.json and exports match manifest', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises' }];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { exercisesApp } from './handlers/exercises.js';\n" +
      'const { dev: devExercises, prod: prodExercises } = register(exercisesApp);\n' +
      'export { devExercises, prodExercises };');
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('exercises');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when firebase.json has extra rewrites', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises' }];
    const rewrites = generateRewrites(manifest);
    rewrites.push({ source: '/api/dev/extra', function: 'devExtra' });
    rewrites.push({ source: '/api/dev/extra/**', function: 'devExtra' });
    writeFixture(rootDir, 'firebase.json', JSON.stringify({ hosting: { rewrites } }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { exercisesApp } from './handlers/exercises.js';\n" +
      'const { dev: devExercises, prod: prodExercises } = register(exercisesApp);\n' +
      'export { devExercises, prodExercises };');
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('exercises');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('Extra rewrite');
  });

  it('fails when firebase.json is missing rewrites from manifest', () => {
    const manifest: EndpointEntry[] = [
      { routePath: 'exercises', handlerFile: 'exercises' },
      { routePath: 'calendar', handlerFile: 'calendar' },
    ];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest.slice(0, 1)) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { exercisesApp } from './handlers/exercises.js';\n" +
      "import { calendarApp } from './handlers/calendar.js';\n" +
      'const { dev: devExercises, prod: prodExercises } = register(exercisesApp);\n' +
      'const { dev: devCalendar, prod: prodCalendar } = register(calendarApp);\n' +
      'export { devExercises, prodExercises, devCalendar, prodCalendar };');
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('exercises');");
    writeFixture(rootDir, 'packages/functions/src/handlers/calendar.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('calendar');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('Missing rewrite'))).toBe(true);
  });

  it('fails when handler route does not match manifest routePath', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises' }];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { exercisesApp } from './handlers/exercises.js';\n" +
      'const { dev: devExercises, prod: prodExercises } = register(exercisesApp);\n' +
      'export { devExercises, prodExercises };');
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('wrong-name');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('manifest expects'))).toBe(true);
  });

  it('fails when handler file is missing', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'missing' }];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { exercisesApp as missingApp } from './handlers/missing.js';\n" +
      'const { dev: devMissing, prod: prodMissing } = register(missingApp);\n' +
      'export { devMissing, prodMissing };');

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('Missing handler file'))).toBe(true);
  });

  it('fails when index.ts is missing handler import', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises' }];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      'const { dev: devExercises, prod: prodExercises } = register(exercisesApp);');
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('exercises');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('Missing import'))).toBe(true);
  });

  it('fails when index.ts is missing handler export', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises' }];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { exercisesApp } from './handlers/exercises.js';\n" +
      'const { dev: devExercises, prod: prodExercises } = register(exercisesApp);');
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('exercises');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes('Missing export'))).toBe(true);
  });

  it('handles devOnly entries with no prod rewrite or export', () => {
    const manifest: EndpointEntry[] = [
      { routePath: '', handlerFile: 'mealplan-debug', devOnly: true, functionStem: 'MealplanDebug', customSource: '/debug' },
    ];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { mealplanDebugApp } from './handlers/mealplan-debug.js';\n" +
      'export const devMealplanDebug = onRequest({} as any, mealplanDebugApp);');
    writeFixture(rootDir, 'packages/functions/src/handlers/mealplan-debug.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('handles customSource entries', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises', customSource: '/custom/exercises' }];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { exercisesApp } from './handlers/exercises.js';\n" +
      'const { dev: devExercises, prod: prodExercises } = register(exercisesApp);\n' +
      'export { devExercises, prodExercises };');
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('exercises');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(true);
  });

  it('handles functionStem overrides', () => {
    const manifest: EndpointEntry[] = [{ routePath: 'exercises', handlerFile: 'exercises', functionStem: 'MainExercises' }];
    writeFixture(rootDir, 'firebase.json', JSON.stringify({
      hosting: { rewrites: generateRewrites(manifest) },
    }, null, 2));
    writeFixture(rootDir, 'packages/functions/src/index.ts',
      "import { exercisesApp } from './handlers/exercises.js';\n" +
      'const { dev: devMainExercises, prod: prodMainExercises } = register(exercisesApp);\n' +
      'export { devMainExercises, prodMainExercises };');
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { createBaseApp } from '../shared.js';\n" +
      "const app = createBaseApp('exercises');");

    const result = checkFirebaseRoutes(config, manifest);
    expect(result.passed).toBe(true);
  });
});

// ── Check 5: iOS Architecture Layers ─────────────────────────────────────────

describe('checkIosLayers', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when View references ViewModel, not Service', () => {
    writeFixture(rootDir, 'ios/BradOS/BradOS/Services/WorkoutService.swift',
      'class WorkoutService {}');
    writeFixture(rootDir, 'ios/BradOS/BradOS/ViewModels/WorkoutViewModel.swift',
      'class WorkoutViewModel {}');
    writeFixture(rootDir, 'ios/BradOS/BradOS/Views/WorkoutView.swift',
      'let vm = WorkoutViewModel()');

    const result = checkIosLayers(config);
    expect(result.passed).toBe(true);
  });

  it('fails when View directly references a Service class', () => {
    writeFixture(rootDir, 'ios/BradOS/BradOS/Services/WorkoutService.swift',
      'class WorkoutService {}');
    writeFixture(rootDir, 'ios/BradOS/BradOS/ViewModels/WorkoutViewModel.swift',
      'class WorkoutViewModel {}');
    writeFixture(rootDir, 'ios/BradOS/BradOS/Views/WorkoutView.swift',
      'let service = WorkoutService()');

    const result = checkIosLayers(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('WorkoutService');
    expect(result.violations[0]).toContain('Service type');
  });

  it('fails when Component references a ViewModel class', () => {
    writeFixture(rootDir, 'ios/BradOS/BradOS/ViewModels/WorkoutViewModel.swift',
      'class WorkoutViewModel {}');
    writeFixture(rootDir, 'ios/BradOS/BradOS/Components/WorkoutCard.swift',
      'let vm = WorkoutViewModel()');

    const result = checkIosLayers(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('WorkoutViewModel');
    expect(result.violations[0]).toContain('ViewModel type');
  });

  it('ignores references in #Preview section', () => {
    writeFixture(rootDir, 'ios/BradOS/BradOS/Services/WorkoutService.swift',
      'class WorkoutService {}');
    writeFixture(rootDir, 'ios/BradOS/BradOS/ViewModels/WorkoutViewModel.swift',
      'class WorkoutViewModel {}');
    writeFixture(rootDir, 'ios/BradOS/BradOS/Views/WorkoutView.swift',
      'struct WorkoutView: View {\n  var body: some View { Text("hi") }\n}\n#Preview {\n  let _ = WorkoutService()\n}');

    const result = checkIosLayers(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 6: Architecture Map File References ────────────────────────────────

describe('checkArchMapRefs', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when all backtick-quoted paths exist', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts', '');
    writeFixture(rootDir, 'docs/architecture/lifting.md',
      '# Lifting\n\nKey file: `packages/functions/src/handlers/exercises.ts`');

    const result = checkArchMapRefs(config);
    expect(result.passed).toBe(true);
  });

  it('fails when a referenced file does not exist', () => {
    writeFixture(rootDir, 'docs/architecture/lifting.md',
      '# Lifting\n\nKey file: `packages/functions/src/handlers/missing.ts`');

    const result = checkArchMapRefs(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('missing.ts');
  });
});

// ── Check 7: AGENTS.md File Path References ──────────────────────────────────

describe('checkClaudeMdRefs', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when all backtick-quoted paths exist', () => {
    writeFixture(rootDir, 'docs/conventions/typescript.md', '');
    writeFixture(rootDir, 'AGENTS.md',
      '# AGENTS.md\n\nSee `docs/conventions/typescript.md` for conventions.');

    const result = checkClaudeMdRefs(config);
    expect(result.passed).toBe(true);
  });

  it('fails when a referenced path does not exist', () => {
    writeFixture(rootDir, 'AGENTS.md',
      '# AGENTS.md\n\nSee `docs/conventions/missing.md` for conventions.');

    const result = checkClaudeMdRefs(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('missing.md');
  });

  it('ignores paths inside code fences', () => {
    writeFixture(rootDir, 'AGENTS.md',
      '# AGENTS.md\n\n```bash\ncat docs/conventions/nonexistent.md\n```');

    const result = checkClaudeMdRefs(config);
    expect(result.passed).toBe(true);
  });

  it('ignores paths with template variables like <feature>', () => {
    writeFixture(rootDir, 'AGENTS.md',
      '# AGENTS.md\n\nSee `docs/architecture/<feature>.md` for architecture.');

    const result = checkClaudeMdRefs(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 8: Orphan Features ─────────────────────────────────────────────────

describe('checkOrphanFeatures', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when handler with routes has a matching architecture doc', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "const app = express();\napp.get('/exercises', handler);");
    writeFixture(rootDir, 'docs/architecture/lifting.md', '# Lifting');

    const result = checkOrphanFeatures(config);
    expect(result.passed).toBe(true);
  });

  it('fails when handler has routes but no feature map entry', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/unknownFeature.ts',
      "const app = express();\napp.get('/stuff', handler);");

    const result = checkOrphanFeatures(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('no entry in the handler-to-feature map');
  });

  it('fails when handler maps to feature but doc does not exist', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "const app = express();\napp.get('/exercises', handler);");
    // No docs/architecture/lifting.md

    const result = checkOrphanFeatures(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('does not exist');
  });
});

// ── Check 9: Plan Lifecycle ──────────────────────────────────────────────────

describe('checkPlanLifecycle', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when plans are in active/ or completed/', () => {
    writeFixture(rootDir, 'thoughts/shared/plans/index.md', '# Plans');
    writeFixture(rootDir, 'thoughts/shared/plans/active/my-plan.md', '# Plan');

    const result = checkPlanLifecycle(config);
    expect(result.passed).toBe(true);
  });

  it('fails when a plan .md file is directly in the root', () => {
    writeFixture(rootDir, 'thoughts/shared/plans/index.md', '# Plans');
    writeFixture(rootDir, 'thoughts/shared/plans/stray-plan.md', '# Stray');

    const result = checkPlanLifecycle(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('stray-plan.md');
  });
});

// ── Check 10: No console.log ─────────────────────────────────────────────────

describe('checkNoConsoleLog', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when using firebase logger', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { logger } from 'firebase-functions/logger';\nlogger.info('hello');");

    const result = checkNoConsoleLog(config);
    expect(result.passed).toBe(true);
  });

  it('fails when using console.log', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "console.log('debug');");

    const result = checkNoConsoleLog(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('console');
  });

  it('ignores comments containing console.log', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "// console.log('commented out');");

    const result = checkNoConsoleLog(config);
    expect(result.passed).toBe(true);
  });

  it('ignores test files', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "console.log('test debugging');");

    const result = checkNoConsoleLog(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 11: No raw URLSession ──────────────────────────────────────────────

describe('checkNoRawUrlSession', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when no URLSession usage in Swift files', () => {
    writeFixture(rootDir, 'ios/BradOS/BradOS/Views/HomeView.swift',
      'struct HomeView: View { var body: some View { Text("hi") } }');

    const result = checkNoRawUrlSession(config);
    expect(result.passed).toBe(true);
  });

  it('fails when URLSession is used directly', () => {
    writeFixture(rootDir, 'ios/BradOS/BradOS/Views/HomeView.swift',
      'let session = URLSession.shared');

    const result = checkNoRawUrlSession(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('URLSession');
  });

  it('passes for allowlisted files (APIClient.swift)', () => {
    writeFixture(rootDir, 'ios/BradOS/BradOS/Services/APIClient.swift',
      'let session = URLSession.shared');

    const result = checkNoRawUrlSession(config);
    expect(result.passed).toBe(true);
  });

  it('passes for allowlisted files (StravaAuthManager.swift)', () => {
    writeFixture(rootDir, 'ios/BradOS/BradOS/Services/StravaAuthManager.swift',
      'let session = URLSession.shared');

    const result = checkNoRawUrlSession(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 12: Types in types/ directory ──────────────────────────────────────

describe('checkTypesInTypesDir', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when exported interfaces are in types/', () => {
    writeFixture(rootDir, 'packages/functions/src/types/exercise.ts',
      'export interface Exercise { id: string; }');

    const result = checkTypesInTypesDir(config);
    expect(result.passed).toBe(true);
  });

  it('fails when exported interfaces are in handlers/', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      'export interface Exercise { id: string; }');

    const result = checkTypesInTypesDir(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('Exercise');
    expect(result.violations[0]).toContain('outside of types/');
  });

  it('does not trigger on re-exports', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "export { Exercise } from '../types/exercise.js';");

    const result = checkTypesInTypesDir(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 13: Schemas in schemas/ directory ──────────────────────────────────

describe('checkSchemasInSchemasDir', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when z.object() is in schemas/', () => {
    writeFixture(rootDir, 'packages/functions/src/schemas/exercise.schema.ts',
      "import { z } from 'zod';\nexport const exerciseSchema = z.object({ name: z.string() });");

    const result = checkSchemasInSchemasDir(config);
    expect(result.passed).toBe(true);
  });

  it('fails when z.object() is in handlers/', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      "import { z } from 'zod';\nconst schema = z.object({ name: z.string() });");

    const result = checkSchemasInSchemasDir(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('outside of schemas/');
  });
});

// ── Check 14: No skipped tests ───────────────────────────────────────────────

describe('checkNoSkippedTests', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes for tests without skip', () => {
    // Use concatenation to avoid this test file itself triggering check 19 (empty body detection)
    const fixture = "import { it, describe } from 'vitest';\ndescribe('test', () => { " + "it" + "('works', () => {}); });";
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts', fixture);

    const result = checkNoSkippedTests(config);
    expect(result.passed).toBe(true);
  });

  it('fails when it.skip is found', () => {
    // Use concatenation to avoid this test file itself triggering the linter
    const fixture = 'import { it, describe } from ' + "'vitest';\n" +
      "describe('test', () => { it" + ".skip('broken', () => {}); });";
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts', fixture);

    const result = checkNoSkippedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('it.skip');
  });

  it('detects xit and xdescribe', () => {
    // Use concatenation to avoid this test file itself triggering the linter
    const fixture = "x" + "it" + "('broken', () => {});\n" + "x" + "describe('broken suite', () => {});";
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts', fixture);

    const result = checkNoSkippedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

// ── Check 15: Untested high-risk files ───────────────────────────────────────

describe('checkUntestedHighRisk', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when high-risk handler has a test file', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/today-coach.ts',
      'export const app = {};');
    // Use concatenation to avoid this test file itself triggering check 19 (empty body detection)
    writeFixture(rootDir, 'packages/functions/src/handlers/today-coach.test.ts',
      "it" + "('works', () => {});");

    const result = checkUntestedHighRisk(config);
    expect(result.passed).toBe(true);
  });

  it('fails when high-risk handler has no test file', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/today-coach.ts',
      'export const app = {};');

    const result = checkUntestedHighRisk(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('today-coach');
    expect(result.violations[0]).toContain('high-risk');
  });

  it('does not flag non-high-risk files without tests', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.ts',
      'export const app = {};');

    const result = checkUntestedHighRisk(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 16: Shared test factory usage ──────────────────────────────────────

describe('checkTestFactoryUsage', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when test imports from __tests__/utils/', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { createExercise } from '../__tests__/utils/index.js';\nconst e = createExercise();");

    const result = checkTestFactoryUsage(config);
    expect(result.passed).toBe(true);
  });

  it('fails when test defines inline factory without shared imports', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "function createMockExercise() { return { id: '1' }; }");

    const result = checkTestFactoryUsage(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('inline test factories');
  });

  it('passes when test defines inline factory AND imports from shared utils', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { createExercise } from '../__tests__/utils/index.js';\nfunction createMockSpecial() { return {}; }");

    const result = checkTestFactoryUsage(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 17: No inline ApiResponse ──────────────────────────────────────────

describe('checkNoInlineApiResponse', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when test imports ApiResponse from utils', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { ApiResponse } from '../__tests__/utils/api-types.js';");

    const result = checkNoInlineApiResponse(config);
    expect(result.passed).toBe(true);
  });

  it('fails when test defines inline ApiResponse interface', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "interface ApiResponse<T> { success: boolean; data: T; }");

    const result = checkNoInlineApiResponse(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('inline ApiResponse');
  });
});

// ── Check 18: No focused tests (.only) ──────────────────────────────────────

describe('checkNoFocusedTests', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes for tests without .only', () => {
    // Use concatenation to avoid this test file itself triggering check 19 (empty body detection)
    const fixture = "import { it, describe } from 'vitest';\ndescribe('test', () => { " + "it" + "('works', () => {}); });";
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts', fixture);

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(true);
  });

  it('fails when it.only is found', () => {
    // Use concatenation to avoid this test file itself triggering the linter
    const fixture = 'import { it, describe } from ' + "'vitest';\n" +
      "describe('test', () => { it" + ".only('focused', () => {}); });";
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts', fixture);

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('it.only');
  });

  it('detects describe.only and test.only', () => {
    // Use concatenation to avoid this test file itself triggering the linter
    const fixture = "describe" + ".only('focused suite', () => {});\n" +
      "test" + ".only('focused test', () => {});";
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts', fixture);

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it('detects f' + 'it and f' + 'describe (Jest aliases)', () => {
    // Use concatenation to avoid this test file itself triggering the linter
    const fixture = "f" + "it" + "('focused', () => {});\n" + "f" + "describe('focused suite', () => {});";
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts', fixture);

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it('ignores .only in comments', () => {
    // Use concatenation to avoid this test file itself triggering the linter
    const fixture = "// it" + ".only('commented out');";
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts', fixture);

    const result = checkNoFocusedTests(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 19: Test quality (no empty/assertion-free tests) ───────────────────

describe('checkTestQuality', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes for tests with assertions', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('returns all exercises', () => {\n" +
      "    expect([1, 2]).toHaveLength(2);\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails for single-line empty test body', () => {
    // Use concatenation to avoid this test file itself triggering check 19
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  " + "it" + "('should work', () => {});\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0]).toContain('empty test body');
  });

  it('fails for multi-line empty test body', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('should work', () => {\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(1);
    expect(result.violations[0]).toContain('empty test body');
  });

  it('fails for async empty test body', () => {
    // Use concatenation to avoid this test file itself triggering check 19
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  " + "it" + "('should work', async () => {});\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('empty test body');
  });

  it('fails for test file with test cases but zero expect() calls', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('creates exercise', async () => {\n" +
      "    await service.create(data);\n" +
      "  });\n" +
      "  it('deletes exercise', async () => {\n" +
      "    await service.delete(id);\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('zero expect() assertions');
  });

  it('passes for test file with some tests having assertions', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('creates exercise', async () => {\n" +
      "    const result = await service.create(data);\n" +
      "    expect(result).toBeDefined();\n" +
      "  });\n" +
      "  it('sets up state', () => {\n" +
      "    service.init();\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    // File has expect() calls, so file-level check passes
    // The second test has no assertions but is not empty (has a statement)
    expect(result.passed).toBe(true);
  });

  it('ignores commented-out test lines', () => {
    // Use concatenation to avoid this test file itself triggering check 19
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  // " + "it" + "('placeholder', () => {});\n" +
      "  it('real test', () => { expect(1).toBe(1); });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(true);
  });

  it('handles test.each without flagging', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { it, describe, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it.each([1, 2, 3])('handles %i', (n) => {\n" +
      "    expect(n).toBeGreaterThan(0);\n" +
      "  });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(true);
  });

  it('does not flag describe blocks (only it/test)', () => {
    writeFixture(rootDir, 'packages/functions/src/handlers/exercises.test.ts',
      "import { describe, it, expect } from 'vitest';\n" +
      "describe('Exercises', () => {\n" +
      "  it('works', () => { expect(true).toBe(true); });\n" +
      "});");

    const result = checkTestQuality(config);
    expect(result.passed).toBe(true);
  });
});

// ── Warning: Quality Grades Freshness ────────────────────────────────────────

describe('checkQualityGradesFreshness', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('returns stale: false when updated today', () => {
    const today = new Date().toISOString().split('T')[0];
    writeFixture(rootDir, 'docs/quality-grades.md',
      `# Quality Grades\n\nLast updated: ${today}`);

    const result = checkQualityGradesFreshness(config);
    expect(result.stale).toBe(false);
  });

  it('returns stale: true when updated 10 days ago', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    writeFixture(rootDir, 'docs/quality-grades.md',
      `# Quality Grades\n\nLast updated: ${tenDaysAgo}`);

    const result = checkQualityGradesFreshness(config);
    expect(result.stale).toBe(true);
  });

  it('returns stale: true when file does not exist', () => {
    const result = checkQualityGradesFreshness(config);
    expect(result.stale).toBe(true);
    expect(result.message).toContain('does not exist');
  });
});

// ── Check 20: Repository test coverage ───────────────────────────────────────

describe('checkRepositoryTestCoverage', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when all repository files have colocated tests', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.ts',
      'export class ExerciseRepository {}');
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.test.ts',
      "it('works', () => { expect(1).toBe(1); });");

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when a repository file has no colocated test', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.ts',
      'export class ExerciseRepository {}');

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('exercise.repository.ts');
    expect(result.violations[0]).toContain('no colocated test file');
  });

  it('skips allowlisted files (base.repository.ts)', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/base.repository.ts',
      'export abstract class BaseRepository {}');

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes when repositories directory does not exist', () => {
    // config.functionsSrc/repositories does not exist in fixture
    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
  });

  it('reports multiple missing test files', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/foo.repository.ts',
      'export class FooRepository {}');
    writeFixture(rootDir, 'packages/functions/src/repositories/bar.repository.ts',
      'export class BarRepository {}');

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });

  it('ignores non-repository .ts files in the directory', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/helpers.ts',
      'export function helper() {}');

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
  });

  it('does not flag test files themselves', () => {
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.ts',
      'export class ExerciseRepository {}');
    writeFixture(rootDir, 'packages/functions/src/repositories/exercise.repository.test.ts',
      "it('works', () => { expect(1).toBe(1); });");

    const result = checkRepositoryTestCoverage(config);
    expect(result.passed).toBe(true);
  });
});

// ── Check 21: Markdown Link Targets ──────────────────────────────────────────

describe('checkMarkdownLinks', () => {
  let rootDir: string;
  let config: LinterConfig;

  beforeEach(() => {
    ({ rootDir, config } = createFixture());
  });
  afterEach(() => cleanup(rootDir));

  it('passes when all markdown links resolve to existing files', () => {
    writeFixture(rootDir, 'docs/index.md', '[typescript](conventions/typescript.md)');
    writeFixture(rootDir, 'docs/conventions/typescript.md', '# TypeScript');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when a markdown link target does not exist', () => {
    writeFixture(rootDir, 'docs/index.md', '[missing](conventions/missing.md)');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('missing.md');
  });

  it('handles relative paths from nested directories', () => {
    writeFixture(rootDir, 'docs/guides/quickstart.md', '[root](../../CLAUDE.md)');
    writeFixture(rootDir, 'CLAUDE.md', '# CLAUDE');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('skips external URLs (http, https, mailto)', () => {
    writeFixture(rootDir, 'README.md', '[link](https://example.com)\n[email](mailto:a@b.com)');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('skips fragment-only links (#anchor)', () => {
    writeFixture(rootDir, 'README.md', '[section](#installation)');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('strips fragment from file path before checking', () => {
    writeFixture(rootDir, 'README.md', '[guide](docs/guide.md#section)');
    writeFixture(rootDir, 'docs/guide.md', '# Guide');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('skips links inside code fences', () => {
    writeFixture(rootDir, 'README.md', '```\n[link](nonexistent.md)\n```');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('skips links with template variables', () => {
    writeFixture(rootDir, 'README.md', '[feature](docs/architecture/<feature>.md)');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('handles image links', () => {
    writeFixture(rootDir, 'docs/arch.md', '![diagram](lifting.png)');
    writeFixture(rootDir, 'docs/lifting.png', '');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('skips node_modules and .git directories', () => {
    writeFixture(rootDir, 'node_modules/pkg/README.md', '[link](nonexistent.md)');
    writeFixture(rootDir, '.git/README.md', '[link](nonexistent.md)');

    const result = checkMarkdownLinks(config);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});
