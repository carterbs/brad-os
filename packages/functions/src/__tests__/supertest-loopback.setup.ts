import { Server } from 'node:net';
import { Server as TlsServer } from 'node:tls';
import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';

const originalServerAddress = request.Test.prototype.serverAddress;
const originalEnd = request.Test.prototype.end;
const bindings = new WeakMap<Server, Promise<Error | undefined>>();
const pendingRequests = new WeakMap<request.Test, { server: Server; path: string; ready: Promise<Error | undefined> }>();

// Both IPv4-to-wildcard and native IPv6 connections can stall on this macOS
// host before the server accepts a socket. Explicit IPv4 loopback avoids that
// path. Binding a named host is asynchronous, so defer sending until listening;
// preserve Supertest's ownership and cleanup of its auto-created server.
beforeAll(() => {
  request.Test.prototype.serverAddress = function (app, path): string {
    if (app instanceof Server && app.address() === null) {
      let ready = bindings.get(app);
      if (ready === undefined) {
        // Supertest uses this private field to close only servers it started.
        Reflect.set(this, '_server', app);
        ready = new Promise<Error | undefined>((resolve) => {
          const listening = (): void => {
            app.off('error', failed);
            resolve(undefined);
          };
          const failed = (error: Error): void => {
            app.off('listening', listening);
            resolve(error);
          };
          app.once('listening', listening);
          app.once('error', failed);
          app.listen(0, '127.0.0.1');
        });
        bindings.set(app, ready);
        app.once('close', () => bindings.delete(app));
      }
      pendingRequests.set(this, { server: app, path, ready });
      return (app instanceof TlsServer ? 'https' : 'http') + '://127.0.0.1:0' + path;
    }
    const url = originalServerAddress.call(this, app, path);
    const address = app instanceof Server ? app.address() : null;
    if (address !== null && typeof address === 'object' && address.family === 'IPv6') {
      return url.replace('://127.0.0.1:', '://[::1]:');
    }
    return url;
  };
  request.Test.prototype.end = function (callback): request.Test {
    const pending = pendingRequests.get(this);
    if (pending === undefined) return originalEnd.call(this, callback);
    pendingRequests.delete(this);
    void pending.ready.then((error): void => {
      if (error !== undefined) {
        if (callback !== undefined) Reflect.apply(callback, this, [error]);
        else this.emit('error', error);
        return;
      }
      this.url = originalServerAddress.call(this, pending.server, pending.path);
      originalEnd.call(this, callback);
    });
    return this;
  };
});

afterAll(() => {
  request.Test.prototype.serverAddress = originalServerAddress;
  request.Test.prototype.end = originalEnd;
});
