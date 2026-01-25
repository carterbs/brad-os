import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Base port for first worker. Each worker needs 2 ports (client + server).
// Space workers by 10 ports to avoid conflicts.
export const BASE_PORT = 3200;
export const PORT_SPACING = 10;  // Each worker gets: PORT (client) and PORT+1 (server)
export const WORKER_COUNT = 8;

interface ServerInfo {
  process: ChildProcess;
  port: number;
  workerId: number;
}

const servers: ServerInfo[] = [];

/**
 * Kill any processes using our test ports to avoid conflicts.
 * Each worker uses 2 ports: client (PORT) and server (PORT+1).
 */
function cleanupOrphanProcesses(): void {
  for (let i = 0; i < WORKER_COUNT; i++) {
    const clientPort = BASE_PORT + (i * PORT_SPACING);
    const serverPort = clientPort + 1;
    for (const port of [clientPort, serverPort]) {
      try {
        execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
          stdio: 'ignore',
        });
      } catch {
        // No process on this port
      }
    }
  }
}

async function waitForServer(url: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server at ${url} did not start within ${timeout}ms`);
}

export default async function globalSetup(): Promise<void> {
  // Clean up any orphan processes from previous runs
  console.log('Cleaning up orphan processes...');
  cleanupOrphanProcesses();

  console.log(`Starting ${WORKER_COUNT} test servers...`);

  const projectRoot = path.join(__dirname, '..');

  for (let i = 0; i < WORKER_COUNT; i++) {
    // Each worker gets PORT (client) and PORT+1 (server) via vite.config.ts
    const port = BASE_PORT + (i * PORT_SPACING);
    const workerId = i;

    console.log(`  Starting worker ${workerId} on port ${port} (client) and ${port + 1} (server)...`);

    const server = spawn('npm', ['run', 'dev'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        TEST_WORKER_ID: String(workerId),
      },
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
    });

    // Log server output for debugging
    server.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.log(`  [Worker ${workerId}] ${msg}`);
      }
    });

    server.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error(`  [Worker ${workerId} ERR] ${msg}`);
      }
    });

    servers.push({ process: server, port, workerId });
  }

  // Wait for all servers to be ready
  console.log('Waiting for all servers to be ready...');
  await Promise.all(
    servers.map(async ({ port, workerId }) => {
      const url = `http://localhost:${port}`;
      await waitForServer(url);
      console.log(`  Worker ${workerId} ready at ${url}`);
    })
  );

  // Store server PIDs in environment for teardown
  process.env['E2E_SERVER_PIDS'] = servers.map((s) => s.process.pid).join(',');

  console.log('All test servers started successfully.');
}

// Export servers for teardown to use
export { servers };
