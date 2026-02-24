import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('preinstall Node version check', () => {
  it('succeeds on the current Node (should be 22 in CI and dev)', () => {
    execSync(
      'node -e "const v = parseInt(process.versions.node, 10); if (v !== 22) process.exit(1);"',
      { encoding: 'utf-8' }
    );
    expect(true).toBe(true);
  });

  it('prints actionable error message when version is wrong', () => {
    try {
      execSync(
        'node -e "const v = 18; if (v !== 22) { console.error(\'ERROR: Node 18 detected. This project requires Node 22.\'); process.exit(1); }"',
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      expect.unreachable('Should have thrown');
    } catch (e: unknown) {
      const err = e as { stderr: string; status: number };
      expect(err.status).toBe(1);
      expect(err.stderr).toContain('ERROR');
      expect(err.stderr).toContain('Node 22');
    }
  });

  it('.nvmrc contains 22', async () => {
    const { readFile } = await import('fs/promises');
    const content = (await readFile('.nvmrc', 'utf-8')).trim();
    expect(content).toBe('22');
  });

  it('root package.json engines require Node 22.x', async () => {
    const { readFile } = await import('fs/promises');
    const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
    expect(pkg.engines).toBeDefined();
    expect(pkg.engines.node).toBe('>=22.0.0 <23.0.0');
  });

  it('functions package.json engines require Node 22.x', async () => {
    const { readFile } = await import('fs/promises');
    const pkg = JSON.parse(await readFile('packages/functions/package.json', 'utf-8'));
    expect(pkg.engines).toBeDefined();
    expect(pkg.engines.node).toBe('>=22.0.0 <23.0.0');
  });
});
