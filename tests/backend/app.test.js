import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApp, createHandlers } from '../../src/backend/app.js';

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    filePath: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    sendFile(filePath) {
      this.filePath = filePath;
      return this;
    }
  };
}

function getRouteHandler(app, routePath, method) {
  const layer = app._router.stack.find(
    (entry) => entry.route && entry.route.path === routePath && entry.route.methods[method]
  );
  return layer?.route?.stack?.[0]?.handle;
}

describe('backend handlers', () => {
  const config = {
    baseUrl: 'http://tuneshine-6f34.local',
    timeoutMs: 1000,
    specCacheFilePath: '/tmp/tuneshine-spec-cache-test.json',
    port: 3000,
    apiVersion: 'v1_0_0',
    apiVersions: {
      v1_0_0: { openApiPath: '/openapi.json', operationBasePath: '' }
    }
  };

  it('returns health', async () => {
    let busy = false;
    const handlers = createHandlers({
      config,
      fetchSpec: async () => ({ paths: {} }),
      execute: async () => ({ ok: true, status: 200, statusText: 'OK', body: {} }),
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });

    const res = createRes();
    handlers.health({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'ok', apiVersion: 'v1_0_0' });
  });

  it('returns spec and normalized operations', async () => {
    let busy = false;
    const handlers = createHandlers({
      config,
      fetchSpec: async () => ({ paths: { '/state': { get: { summary: 'State' } } } }),
      execute: async () => ({ ok: true, status: 200, statusText: 'OK', body: {} }),
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });

    const res = createRes();
    await handlers.spec({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.operations).toHaveLength(1);
    expect(res.body.apiVersion).toBe('v1_0_0');
    expect(res.body.cached).toBe(false);
  });

  it('serves spec from cache when present; creates cache when missing', async () => {
    let busy = false;
    let cachedSpec = { paths: { '/cached': { get: { summary: 'Cached' } } } };
    const write = vi.fn(async (spec) => {
      cachedSpec = spec;
    });
    const fetchSpec = vi.fn(async () => ({ paths: { '/fresh': { get: { summary: 'Fresh' } } } }));

    const handlers = createHandlers({
      config,
      fetchSpec,
      execute: async () => ({ ok: true, status: 200, statusText: 'OK', body: {} }),
      specStore: {
        read: async () => cachedSpec,
        write
      },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });

    const cachedRes = createRes();
    await handlers.spec({}, cachedRes);
    expect(cachedRes.body.cached).toBe(true);
    expect(fetchSpec).toHaveBeenCalledTimes(0);

    cachedSpec = null;
    const freshRes = createRes();
    await handlers.spec({}, freshRes);
    expect(freshRes.body.cached).toBe(false);
    expect(fetchSpec).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('handles spec retrieval failures', async () => {
    let busy = false;
    const handlers = createHandlers({
      config,
      fetchSpec: async () => {
        throw new Error('network down');
      },
      execute: async () => ({ ok: true, status: 200, statusText: 'OK', body: {} }),
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });

    const res = createRes();
    await handlers.spec({}, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain('Unable to fetch');

    const handlersWithStringError = createHandlers({
      config,
      fetchSpec: async () => {
        throw 'boom';
      },
      execute: async () => ({ ok: true, status: 200, statusText: 'OK', body: {} }),
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });
    const res2 = createRes();
    await handlersWithStringError.spec({}, res2);
    expect(res2.body.details).toContain('boom');
  });

  it('executes operation and maps backend errors', async () => {
    let busy = false;
    const successHandlers = createHandlers({
      config,
      fetchSpec: async () => ({ paths: {} }),
      execute: async () => ({ ok: true, status: 200, statusText: 'OK', body: { done: true } }),
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });

    const successRes = createRes();
    await successHandlers.execute({ body: { path: '/state' } }, successRes);
    expect(successRes.statusCode).toBe(200);
    expect(successRes.body.body.done).toBe(true);

    const statusHandlers = createHandlers({
      config,
      fetchSpec: async () => ({ paths: {} }),
      execute: async () => ({ ok: false, status: 500, statusText: 'Bad', body: 'failure' }),
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });
    const statusRes = createRes();
    await statusHandlers.execute({ body: { path: '/state' } }, statusRes);
    expect(statusRes.statusCode).toBe(502);

    const throwHandlers = createHandlers({
      config,
      fetchSpec: async () => ({ paths: {} }),
      execute: async () => {
        throw new Error('bad payload');
      },
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });
    const throwRes = createRes();
    await throwHandlers.execute({ body: { path: '/state' } }, throwRes);
    expect(throwRes.statusCode).toBe(400);

    const throwStringHandlers = createHandlers({
      config,
      fetchSpec: async () => ({ paths: {} }),
      execute: async () => {
        throw 'bad payload';
      },
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });
    const throwStringRes = createRes();
    await throwStringHandlers.execute({ body: undefined }, throwStringRes);
    expect(throwStringRes.statusCode).toBe(400);
  });

  it('enforces one operation at a time', async () => {
    const wait = deferred();
    let busy = false;

    const execute = vi.fn(async () => {
      await wait.promise;
      return { ok: true, status: 200, statusText: 'OK', body: {} };
    });

    const handlers = createHandlers({
      config,
      fetchSpec: async () => ({ paths: {} }),
      execute,
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });

    const firstRes = createRes();
    const firstCall = handlers.execute({ body: { path: '/state' } }, firstRes);

    const secondRes = createRes();
    await handlers.execute({ body: { path: '/state' } }, secondRes);
    expect(secondRes.statusCode).toBe(409);

    wait.resolve();
    await firstCall;
    expect(firstRes.statusCode).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns index html path', () => {
    let busy = false;
    const handlers = createHandlers({
      config,
      fetchSpec: async () => ({ paths: {} }),
      execute: async () => ({ ok: true, status: 200, statusText: 'OK', body: {} }),
      specStore: { read: async () => null, write: async () => {} },
      getBusy: () => busy,
      setBusy: (value) => {
        busy = value;
      }
    });

    const res = createRes();
    handlers.index({}, res);

    const expected = path.resolve(process.cwd(), 'src/frontend/index.html');
    expect(res.filePath).toBe(expected);
    expect(fs.existsSync(res.filePath)).toBe(true);
  });

  it('createApp wires handlers onto routes', async () => {
    const fetchSpec = vi.fn(async () => ({ paths: { '/state': { get: {} } } }));
    const execute = vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', body: { ok: true } }));
    const specStore = { read: async () => null, write: async () => {} };
    const app = createApp({ config, fetchSpec, execute, specStore });

    const healthRes = createRes();
    getRouteHandler(app, '/api/health', 'get')({}, healthRes);
    expect(healthRes.body).toEqual({ status: 'ok', apiVersion: 'v1_0_0' });

    const specRes = createRes();
    await getRouteHandler(app, '/api/spec', 'get')({}, specRes);
    expect(specRes.statusCode).toBe(200);
    expect(fetchSpec).toHaveBeenCalled();

    const executeRes = createRes();
    await getRouteHandler(app, '/api/execute', 'post')({ body: { path: '/state' } }, executeRes);
    expect(executeRes.statusCode).toBe(200);
    expect(execute).toHaveBeenCalled();
  });

  it('createApp supports default dependency selection', () => {
    const app = createApp();
    expect(getRouteHandler(app, '/api/health', 'get')).toBeTypeOf('function');
    expect(getRouteHandler(app, '/api/spec', 'get')).toBeTypeOf('function');
    expect(getRouteHandler(app, '/api/execute', 'post')).toBeTypeOf('function');
  });
});
