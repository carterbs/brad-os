import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BASE_PORT, PORT_SPACING, WORKER_COUNT } from './global-setup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function globalTeardown(): void {
  console.log('Stopping test servers...');

  // Get PIDs from environment
  const pids = process.env['E2E_SERVER_PIDS']?.split(',').filter(Boolean) ?? [];

  // Kill server processes
  for (const pid of pids) {
    try {
      // Kill the process group to ensure all child processes are terminated
      process.kill(Number(pid), 'SIGTERM');
      console.log(`  Killed server with PID ${pid}`);
    } catch (error) {
      // Process might already be dead
      console.log(`  Server PID ${pid} already stopped`);
    }
  }

  // Also try to kill any orphaned processes on our ports
  // Each worker uses 2 ports: client (PORT) and server (PORT+1)
  for (let i = 0; i < WORKER_COUNT; i++) {
    const clientPort = BASE_PORT + (i * PORT_SPACING);
    const serverPort = clientPort + 1;
    for (const port of [clientPort, serverPort]) {
      try {
        // Find and kill any process listening on the port
        execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
          stdio: 'ignore',
        });
      } catch {
        // No process on this port
      }
    }
  }

  // Clean up worker-specific test databases
  const dataDir = path.join(__dirname, '../packages/server/data');
  for (let i = 0; i < WORKER_COUNT; i++) {
    const dbFile = path.join(dataDir, `lifting.test.${i}.db`);
    const walFile = `${dbFile}-wal`;
    const shmFile = `${dbFile}-shm`;

    for (const file of [dbFile, walFile, shmFile]) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`  Cleaned up ${path.basename(file)}`);
        }
      } catch (error) {
        console.log(`  Could not clean up ${path.basename(file)}`);
      }
    }
  }

  console.log('Test server cleanup complete.');
}
