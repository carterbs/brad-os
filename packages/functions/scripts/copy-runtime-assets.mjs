import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(packageRoot, 'src/prompts');
const destination = resolve(packageRoot, 'lib/prompts');

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
