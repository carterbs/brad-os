import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

describe('Firebase Functions deployment guard', () => {
  it('fails clearly when Firebase runs the Functions predeploy hook', () => {
    const result = spawnSync(
      process.execPath,
      [resolve(ROOT, 'scripts/block-functions-deploy.mjs')],
      {
        cwd: ROOT,
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Firebase Cloud Functions deployment is disabled.'
    );
    expect(result.stderr).toContain('brad-os-api Cloud Run service');
  });

  it('keeps local emulation and Hosting deployment available', () => {
    const firebaseConfig = JSON.parse(
      readFileSync(resolve(ROOT, 'firebase.json'), 'utf8')
    ) as {
      functions?: { predeploy?: string[] };
      emulators?: { functions?: { port?: number } };
    };
    const rootPackage = JSON.parse(
      readFileSync(resolve(ROOT, 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };
    const functionsPackage = JSON.parse(
      readFileSync(resolve(ROOT, 'packages/functions/package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };

    expect(firebaseConfig.functions?.predeploy?.[0]).toBe(
      'node scripts/block-functions-deploy.mjs'
    );
    expect(firebaseConfig.emulators?.functions?.port).toBe(5001);
    expect(rootPackage.scripts?.['deploy:hosting']).toBe(
      'firebase deploy --only hosting'
    );
    expect(rootPackage.scripts?.['deploy:functions']).toBeUndefined();
    expect(rootPackage.scripts?.['deploy:functions:dev']).toBeUndefined();
    expect(rootPackage.scripts?.['deploy:functions:prod']).toBeUndefined();
    expect(functionsPackage.scripts?.['serve']).toContain(
      'firebase emulators:start --only functions'
    );
    expect(functionsPackage.scripts?.['deploy']).toBeUndefined();
    expect(functionsPackage.scripts?.['logs']).toBeUndefined();
  });
});
