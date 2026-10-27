import { Agent, createServer } from 'node:http';
import type { Socket } from 'node:net';
import type { Application } from 'express';
import request from 'supertest';

export interface LiveHttpStats {
  acceptedConnections: number;
  openConnections: number;
  peakConnections: number;
  listening: boolean;
}

export interface LiveHttpHarness {
  get(path: string): request.Test;
  post(path: string): request.Test;
  stats(): LiveHttpStats;
  close(): Promise<void>;
}

/** A suite owns one real IPv4 server and a bounded reusable client connection pool. */
export async function createLiveHttpHarness(app: Application): Promise<LiveHttpHarness> {
  const server = createServer(app);
  const agent = new Agent({
    keepAlive: true,
    maxSockets: 50,
    maxTotalSockets: 50,
    maxFreeSockets: 50,
  });
  const sockets = new Set<Socket>();
  let acceptedConnections = 0;
  let peakConnections = 0;
  let closePromise: Promise<void> | undefined;
  server.on('connection', (socket) => {
    acceptedConnections++;
    sockets.add(socket);
    peakConnections = Math.max(peakConnections, sockets.size);
    socket.once('close', () => sockets.delete(socket));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error): void => { reject(error); };
      server.once('error', failed);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', failed);
        resolve();
      });
    });
  } catch (error: unknown) {
    agent.destroy();
    throw error;
  }
  const client = request(server);
  const ensureOpen = (): void => {
    if (closePromise !== undefined) throw new Error('Live HTTP harness is closed');
  };
  return {
    get: (path): request.Test => {
      ensureOpen();
      return client.get(path).agent(agent);
    },
    post: (path): request.Test => {
      ensureOpen();
      return client.post(path).agent(agent);
    },
    stats: (): LiveHttpStats => ({
      acceptedConnections, openConnections: sockets.size, peakConnections,
      listening: server.listening,
    }),
    close: (): Promise<void> => {
      closePromise ??= (async (): Promise<void> => {
        const closedSockets = [...sockets].map((socket) => new Promise<void>((resolve) => {
          socket.once('close', () => resolve());
        }));
        const closedServer = new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error !== undefined) reject(error);
            else resolve();
          });
        });
        agent.destroy();
        for (const socket of sockets) socket.destroy();
        await Promise.all([closedServer, ...closedSockets]);
      })();
      return closePromise;
    },
  };
}
