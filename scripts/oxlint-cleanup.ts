import childProcess from 'node:child_process';

const OXLINT_COMMAND = 'oxlint';
const OXLINT_CONFIG = '.oxlintrc.json';
const DRY_RUN_FLAG = '--dry-run';

export interface CleanupProfile {
  id: string;
  description: string;
  rule: string;
  paths: readonly string[];
}

export interface CliOptions {
  command: 'list' | 'run';
  target?: string;
  dryRun: boolean;
}

const PROFILE_REGISTRY: readonly CleanupProfile[] = [
  {
    id: 'unsafe-type-assertion:repositories',
    description: 'Repository cleanup profile for no-unsafe-type-assertion.',
    rule: 'typescript/no-unsafe-type-assertion',
    paths: ['packages/functions/src/repositories'],
  },
  {
    id: 'unsafe-type-assertion:middleware-services',
    description: 'Middleware + service cleanup profile for no-unsafe-type-assertion.',
    rule: 'typescript/no-unsafe-type-assertion',
    paths: [
      'packages/functions/src/middleware',
      'packages/functions/src/services/firestore-cycling.service.ts',
      'packages/functions/src/services/firestore-recovery.service.ts',
    ],
  },
  {
    id: 'unnecessary-type-assertion:training-load',
    description: 'Training-load test file cleanup profile for no-unnecessary-type-assertion.',
    rule: 'typescript/no-unnecessary-type-assertion',
    paths: ['packages/functions/src/services/training-load.service.test.ts'],
  },
  {
    id: 'base-to-string:health-sync',
    description: 'Health-sync handler cleanup profile for no-base-to-string.',
    rule: 'typescript/no-base-to-string',
    paths: ['packages/functions/src/handlers/health-sync.ts'],
  },
] as const;

export function getCleanupProfiles(): readonly CleanupProfile[] {
  return PROFILE_REGISTRY;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const args = [...argv];
  const dryRun = args.includes(DRY_RUN_FLAG);
  const filteredArgs = args.filter((value) => value !== DRY_RUN_FLAG);

  const command = filteredArgs[0] as CliOptions['command'] | undefined;

  if (command === undefined) {
    return { command: 'list', dryRun };
  }

  if (command !== 'list' && command !== 'run') {
    throw new Error(`Unknown command: ${command}`);
  }

  if (command === 'list') {
    return { command: 'list', dryRun };
  }

  const target = filteredArgs[1];
  if (target === undefined || target.trim() === '') {
    throw new Error('run command requires a target.');
  }

  return { command: 'run', target, dryRun };
}

export function buildOxlintArgs(profile: CleanupProfile): string[] {
  return [
    '--config',
    OXLINT_CONFIG,
    '--type-aware',
    '-A',
    'all',
    '-D',
    profile.rule,
    ...profile.paths,
  ];
}

function printProfileCatalog(profiles: readonly CleanupProfile[]): void {
  for (const profile of profiles) {
    console.log(`${profile.id}`);
    console.log(`  rule: ${profile.rule}`);
    console.log(`  paths: ${profile.paths.join(', ')}`);
  }
}

export function runProfile(profile: CleanupProfile, dryRun: boolean): number {
  const args = buildOxlintArgs(profile);
  if (dryRun) {
    console.log(`${OXLINT_COMMAND} ${args.join(' ')}`);
    return 0;
  }

  const result = childProcess.spawnSync(OXLINT_COMMAND, args, { stdio: 'inherit' });
  if (typeof result.status === 'number') {
    return result.status;
  }
  return 1;
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid CLI arguments.';
    console.error(message);
    console.error('Usage: tsx scripts/oxlint-cleanup.ts <list|run> [task-id|all] [--dry-run]');
    return 1;
  }

  const profiles = getCleanupProfiles();

  if (options.command === 'list') {
    printProfileCatalog(profiles);
    return 0;
  }

  const target = options.target;
  if (target === undefined) {
    console.error('run command requires a task id or "all".');
    printProfileCatalog(profiles);
    return 1;
  }

  if (target === 'all') {
    const exitCodes = profiles.map((profile) => runProfile(profile, options.dryRun));
    return exitCodes.some((status) => status !== 0) ? 1 : 0;
  }

  const profile = profiles.find((entry) => entry.id === target);
  if (profile === undefined) {
    console.error(`Unknown cleanup task: ${target}`);
    console.error('Available tasks:');
    printProfileCatalog(profiles);
    return 1;
  }

  return runProfile(profile, options.dryRun) === 0 ? 0 : 1;
}

if (process.env.VITEST === undefined) {
  process.exit(main());
}
