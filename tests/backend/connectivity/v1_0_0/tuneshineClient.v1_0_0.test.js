import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTuneshineClient, getSupportedApiVersions } from '../../../../src/backend/connectivity/factory.js';
import { executeOperation, fetchOpenApiSpec } from '../../../../src/backend/tuneshineClient.js';

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6pS3kAAAAASUVORK5CYII=';

const baseConfig = {
  baseUrl: 'http://tuneshine-6f34.local',
  timeoutMs: 1000,
  apiVersion: 'v1_0_0',
  apiVersions: {
    v1_0_0: { openApiPath: '/openapi.json', operationBasePath: '' }
  }
};

describe('tuneshine connectivity', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('supports configured api version and creates client by active version', () => {
    expect(getSupportedApiVersions()).toEqual(['v1_0_0']);
    const client = createTuneshineClient(baseConfig);
    expect(client.constructor.name).toBe('TuneshineV1_0_0Client');
  });

  it('rejects unsupported versions or missing version profiles', () => {
    expect(() => createTuneshineClient({ ...baseConfig, apiVersion: 'v9' })).toThrow('Unsupported Tuneshine API version');
    expect(() =>
      createTuneshineClient({ ...baseConfig, apiVersions: {}, apiVersion: 'v1_0_0' })
    ).toThrow('Missing configuration profile');
  });

  it('fetches openapi spec for active version profile', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ openapi: '3.0.0' })
    });

    const spec = await fetchOpenApiSpec(baseConfig);
    expect(spec).toEqual({ openapi: '3.0.0' });
    expect(fetch).toHaveBeenCalledWith('http://tuneshine-6f34.local/openapi.json', expect.any(Object));
  });

  it('fails on non-200 openapi response', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchOpenApiSpec(baseConfig)).rejects.toThrow('Failed to fetch OpenAPI spec: HTTP 500');
  });

  it('executes json requests', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true })
    });

    const result = await executeOperation(baseConfig, {
      method: 'post',
      path: '/state',
      query: { verbose: true },
      bodyType: 'json',
      jsonBody: { artist: 'A' }
    });

    expect(result).toMatchObject({ ok: true, status: 200, body: { ok: true } });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('http://tuneshine-6f34.local/state?verbose=true');
    expect(options.method).toBe('POST');
  });

  it('handles operationBasePath prefixing without duplicating prefixed paths', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true })
    });

    const prefixedConfig = {
      ...baseConfig,
      apiVersions: {
        v1_0_0: { openApiPath: '/openapi.json', operationBasePath: '/api' }
      }
    };

    await executeOperation(prefixedConfig, { method: 'get', path: '/state', bodyType: 'none' });
    expect(fetch).toHaveBeenLastCalledWith('http://tuneshine-6f34.local/api/state', expect.any(Object));

    await executeOperation(prefixedConfig, { method: 'get', path: '/api/state', bodyType: 'none' });
    expect(fetch).toHaveBeenLastCalledWith('http://tuneshine-6f34.local/api/state', expect.any(Object));
  });

  it('executes text and form requests', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'done'
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ created: true })
      });

    const textResult = await executeOperation(baseConfig, {
      method: 'post',
      path: '/message',
      headers: { 'x-mode': 'scroll' },
      bodyType: 'text',
      textBody: 'hello'
    });
    expect(textResult.body).toBe('done');

    const formResult = await executeOperation(baseConfig, {
      method: 'post',
      path: '/image',
      bodyType: 'form',
      formBody: {
        fields: { source: 'spotify' },
        files: [
          {
            name: 'image',
            filename: 'sample.png',
            contentType: 'image/png',
            contentBase64: tinyPngBase64
          }
        ]
      }
    });

    expect(formResult.status).toBe(201);
    const [, options] = fetch.mock.calls[1];
    expect(options.body).toBeInstanceOf(FormData);
    const appendedImage = options.body.get('image');
    expect(appendedImage).toBeTruthy();
    expect(appendedImage.type).toBe('image/webp');
  });

  it('skips empty query/header values and invalid form files', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true })
    });

    await executeOperation(baseConfig, {
      path: '/state',
      query: { a: '', b: null, c: undefined },
      headers: { 'x-keep': '', 'x-mode': 'scroll' },
      bodyType: 'form',
      formBody: {
        fields: { source: '' },
        files: [{ name: 'image', filename: '', contentBase64: '' }]
      }
    });

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('http://tuneshine-6f34.local/state');
    expect(options.headers['x-keep']).toBeUndefined();
    expect(options.headers['x-mode']).toBe('scroll');
  });

  it('keeps webp and non-image files as-is and falls back when image conversion fails', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true })
    });

    await executeOperation(baseConfig, {
      method: 'post',
      path: '/upload',
      bodyType: 'form',
      formBody: {
        fields: {},
        files: [
          {
            name: 'imgWebp',
            filename: 'already.webp',
            contentType: 'image/webp',
            contentBase64: Buffer.from('RIFFxxxxWEBP').toString('base64')
          },
          {
            name: 'note',
            filename: 'note.txt',
            contentType: 'text/plain',
            contentBase64: Buffer.from('hello').toString('base64')
          },
          {
            name: 'badImage',
            filename: 'bad.jpg',
            contentType: 'image/jpeg',
            contentBase64: Buffer.from('not-a-real-image').toString('base64')
          }
        ]
      }
    });

    const [, options] = fetch.mock.calls[0];
    const body = options.body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('imgWebp').type).toBe('image/webp');
    expect(body.get('note').type).toBe('text/plain');
    expect(body.get('badImage').type).toBe('image/jpeg');
    expect(body.get('badImage').name).toBe('bad.jpg');
  });

  it('does not duplicate conversion for repeated uploads of same filename and content', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true })
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const payload = {
      method: 'post',
      path: '/image',
      bodyType: 'form',
      formBody: {
        fields: {},
        files: [
          {
            name: 'image',
            filename: 'IMG_1586.jpeg',
            contentType: 'image/jpeg',
            contentBase64: tinyPngBase64
          }
        ]
      }
    };

    await executeOperation(baseConfig, payload);
    await executeOperation(baseConfig, payload);

    const conversionLogCount = consoleSpy.mock.calls
      .map((call) => String(call[0] || ''))
      .filter((line) => line.includes('Converted image to WebP: IMG_1586.jpeg -> IMG_1586.webp')).length;

    expect(conversionLogCount).toBe(1);
  });

  it('rejects invalid path and method', async () => {
    await expect(
      executeOperation(baseConfig, {
        method: 'post',
        path: 'http://evil',
        bodyType: 'none'
      })
    ).rejects.toThrow('Invalid path');

    await expect(
      executeOperation(baseConfig, {
        method: 'trace',
        path: '/state',
        bodyType: 'none'
      })
    ).rejects.toThrow('Invalid HTTP method');
  });
});
