import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = fs.readFileSync(path.resolve(process.cwd(), 'src/frontend/index.html'), 'utf8');

function resetDom() {
  document.documentElement.innerHTML = html;
}

describe('frontend app', () => {
  beforeEach(() => {
    resetDom();
    window.__TUNESHINE_DISABLE_AUTO_INIT__ = true;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete window.__TUNESHINE_DISABLE_AUTO_INIT__;
  });

  it('renders operations and posts payload for json request', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, statusText: 'OK', body: { ok: true } })
    });
    vi.stubGlobal('fetch', fetchMock);

    renderOperations(
      container,
      [
        {
          id: 'setState',
          summary: 'Set State',
          method: 'post',
          path: '/state',
          parameters: [
            { in: 'query', name: 'volume', schema: { type: 'integer' } },
            { in: 'header', name: 'x-mode', schema: { type: 'string' } }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { artist: { type: 'string' }, enabled: { type: 'boolean' } }
                }
              }
            }
          }
        }
      ],
      status
    );

    const [volumeInput] = container.querySelectorAll('input[name="query:volume"]');
    const [modeInput] = container.querySelectorAll('input[name="header:x-mode"]');
    const [artistInput] = container.querySelectorAll('input[name="json-field:artist"]');
    const [enabledInput] = container.querySelectorAll('input[name="json-field:enabled"]');
    volumeInput.value = '7';
    modeInput.value = 'demo';
    artistInput.value = 'A';
    enabledInput.checked = true;

    const runBtn = container.querySelector('button.run-button');
    await runBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.method).toBe('post');
    expect(requestBody.query.volume).toBe(7);
    expect(requestBody.headers['x-mode']).toBe('demo');
    expect(requestBody.jsonBody).toEqual({ artist: 'A', enabled: true });
    expect(status).toHaveBeenCalled();
  });

  it('handles text and form requests including file inputs', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 200, statusText: 'OK', body: 'first' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 201, statusText: 'Created', body: { uploaded: true } }) })
    );

    renderOperations(
      container,
      [
        {
          id: 'message',
          summary: 'Message',
          method: 'post',
          path: '/message',
          parameters: [],
          requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } }
        },
        {
          id: 'image',
          summary: 'Image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const textArea = container.querySelector('textarea[name="text-body"]');
    textArea.value = 'hello';

    const textRun = container.querySelectorAll('button.run-button')[0];
    textRun.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const fileInput = container.querySelector('input[type="file"]');
    const sourceInput = container.querySelector('input[name="source"]');
    sourceInput.value = 'spotify';

    const file = new File(['abc'], 'sample.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file]
    });

    const formRun = container.querySelectorAll('button.run-button')[1];
    formRun.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch.mock.calls.length).toBe(2);
    const secondPayload = JSON.parse(fetch.mock.calls[1][1].body);
    expect(secondPayload.formBody.fields.source).toBe('spotify');
    expect(secondPayload.formBody.files[0].filename).toBe('sample.png');
  });

  it('converts non-webp image uploads to webp when browser conversion APIs are available', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 201, statusText: 'Created', body: { uploaded: true } }) })
    );

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-image');
    URL.revokeObjectURL = vi.fn();

    const OriginalImage = globalThis.Image;
    class MockImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.naturalWidth = 100;
        this.naturalHeight = 100;
      }

      set src(_value) {
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    }
    globalThis.Image = MockImage;

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback) => callback(new Blob(['webpdata'], { type: 'image/webp' }))
        };
      }
      return originalCreateElement(tagName);
    });

    renderOperations(
      container,
      [
        {
          id: 'image',
          summary: 'Image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const fileInput = container.querySelector('input[type="file"]');
    const sourceInput = container.querySelector('input[name="source"]');
    sourceInput.value = 'spotify';

    const file = new File(['abc'], 'sample.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file]
    });

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.formBody.files[0].contentType).toBe('image/webp');
    expect(payload.formBody.files[0].filename).toBe('sample.webp');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.Image = OriginalImage;
  });

  it('keeps existing webp uploads without conversion', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 201, statusText: 'Created', body: { uploaded: true } }) })
    );

    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn();

    renderOperations(
      container,
      [
        {
          id: 'image',
          summary: 'Image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['abc'], 'already.webp', { type: 'image/webp' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file]
    });

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.formBody.files[0].contentType).toBe('image/webp');
    expect(payload.formBody.files[0].filename).toBe('already.webp');
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    URL.createObjectURL = originalCreateObjectURL;
  });

  it('converts image using width/height fallback when natural dimensions are missing', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 201, statusText: 'Created', body: { uploaded: true } }) })
    );

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-image');
    URL.revokeObjectURL = vi.fn();

    const OriginalImage = globalThis.Image;
    class MockImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        this.width = 100;
        this.height = 120;
      }

      set src(_value) {
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    }
    globalThis.Image = MockImage;

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback) => callback(new Blob(['webpdata'], { type: 'image/webp' }))
        };
      }
      return originalCreateElement(tagName);
    });

    renderOperations(
      container,
      [
        {
          id: 'image',
          summary: 'Image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { image: { type: 'string', format: 'binary' } }
                }
              }
            }
          }
        }
      ],
      status
    );

    const fileInput = container.querySelector('input[type="file"]');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['abc'], 'sample.png', { type: 'image/png' })]
    });

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.formBody.files[0].contentType).toBe('image/webp');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.Image = OriginalImage;
  });

  it('falls back to original image when canvas toBlob is unavailable', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 201, statusText: 'Created', body: { uploaded: true } }) })
    );

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-image');
    URL.revokeObjectURL = vi.fn();

    const OriginalImage = globalThis.Image;
    class MockImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.naturalWidth = 100;
        this.naturalHeight = 100;
      }

      set src(_value) {
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    }
    globalThis.Image = MockImage;

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() })
        };
      }
      return originalCreateElement(tagName);
    });

    renderOperations(
      container,
      [
        {
          id: 'image',
          summary: 'Image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['abc'], 'sample.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file]
    });

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.formBody.files[0].contentType).toBe('image/png');
    expect(payload.formBody.files[0].filename).toBe('sample.png');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.Image = OriginalImage;
  });

  it('falls back to original image when image decoding fails during webp conversion', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 201, statusText: 'Created', body: { uploaded: true } }) })
    );

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-image');
    URL.revokeObjectURL = vi.fn();

    const OriginalImage = globalThis.Image;
    class BrokenImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
      }

      set src(_value) {
        if (typeof this.onerror === 'function') {
          this.onerror(new Error('decode failed'));
        }
      }
    }
    globalThis.Image = BrokenImage;

    renderOperations(
      container,
      [
        {
          id: 'image',
          summary: 'Image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['abc'], 'sample.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file]
    });

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.formBody.files[0].contentType).toBe('image/png');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.Image = OriginalImage;
  });

  it('falls back to original image when canvas context is unavailable', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 201, statusText: 'Created', body: { uploaded: true } }) })
    );

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-image');
    URL.revokeObjectURL = vi.fn();

    const OriginalImage = globalThis.Image;
    class MockImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.naturalWidth = 100;
        this.naturalHeight = 100;
      }

      set src(_value) {
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    }
    globalThis.Image = MockImage;

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => null
        };
      }
      return originalCreateElement(tagName);
    });

    renderOperations(
      container,
      [
        {
          id: 'image',
          summary: 'Image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['abc'], 'sample.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.formBody.files[0].contentType).toBe('image/png');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.Image = OriginalImage;
  });

  it('falls back to original image when canvas toBlob returns null', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 201, statusText: 'Created', body: { uploaded: true } }) })
    );

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-image');
    URL.revokeObjectURL = vi.fn();

    const OriginalImage = globalThis.Image;
    class MockImage {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.naturalWidth = 100;
        this.naturalHeight = 100;
      }

      set src(_value) {
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    }
    globalThis.Image = MockImage;

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback) => callback(null)
        };
      }
      return originalCreateElement(tagName);
    });

    renderOperations(
      container,
      [
        {
          id: 'image',
          summary: 'Image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['abc'], 'sample.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.formBody.files[0].contentType).toBe('image/png');

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.Image = OriginalImage;
  });

  it('runs image sequence loop with interval and stop control behavior', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    let resolveFetch;
    const pendingResponse = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal('fetch', vi.fn(() => pendingResponse));

    renderOperations(
      container,
      [
        {
          id: 'uploadImage',
          summary: 'Upload image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const sourceInput = container.querySelector('input[name="source"]');
    sourceInput.value = 'local';

    const sequenceInput = container.querySelector('input[name="image-sequence-files"]');
    Object.defineProperty(sequenceInput, 'files', {
      configurable: true,
      value: [
        new File(['a'], 'a.png', { type: 'image/png' }),
        new File(['b'], 'b.png', { type: 'image/png' })
      ]
    });

    const intervalInput = container.querySelector('input[name="image-sequence-interval"]');
    intervalInput.value = '1';

    const startLoop = Array.from(container.querySelectorAll('button.run-button')).find((node) =>
      node.textContent.includes('Start Image Loop')
    );
    const stopLoop = container.querySelector('button.stop-button');
    const singleRun = Array.from(container.querySelectorAll('button.run-button')).find((node) => node.textContent === 'Run');

    startLoop.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stopLoop.disabled).toBe(false);
    expect(singleRun.disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    stopLoop.click();

    resolveFetch({ ok: true, json: async () => ({ status: 200, statusText: 'OK', body: { uploaded: true } }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(stopLoop.disabled).toBe(true);
  });

  it('keeps looping image sequence until stop is pressed', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 200, statusText: 'OK', body: { ok: true } }) })
    );

    renderOperations(
      container,
      [
        {
          id: 'uploadImage',
          summary: 'Upload image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const sequenceInput = container.querySelector('input[name="image-sequence-files"]');
    Object.defineProperty(sequenceInput, 'files', {
      configurable: true,
      value: [
        new File(['a'], 'a.png', { type: 'image/png' }),
        new File(['b'], 'b.png', { type: 'image/png' })
      ]
    });
    container.querySelector('input[name="image-sequence-interval"]').value = '0.001';

    const startLoop = Array.from(container.querySelectorAll('button.run-button')).find((node) =>
      node.textContent.includes('Start Image Loop')
    );
    const stopLoop = container.querySelector('button.stop-button');
    startLoop.click();

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(3);

    stopLoop.click();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Image loop stopped after'));
  });

  it('validates image loop inputs and handles loop payload errors', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal('fetch', vi.fn());

    renderOperations(
      container,
      [
        {
          id: 'uploadImage',
          summary: 'Upload image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const startLoop = Array.from(container.querySelectorAll('button.run-button')).find((node) =>
      node.textContent.includes('Start Image Loop')
    );
    const interval = container.querySelector('input[name="image-sequence-interval"]');
    const sequenceInput = container.querySelector('input[name="image-sequence-files"]');

    startLoop.click();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Please choose one or more images'), true);

    Object.defineProperty(sequenceInput, 'files', {
      configurable: true,
      value: [new File(['x'], 'x.png', { type: 'image/png' })]
    });
    interval.value = '0';
    startLoop.click();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Interval seconds must be greater than zero'), true);

    const OriginalFileReader = globalThis.FileReader;
    class BrokenFileReader {
      readAsDataURL() {
        if (typeof this.onerror === 'function') {
          this.onerror(new Error('reader failed'));
        }
      }
    }
    globalThis.FileReader = BrokenFileReader;
    interval.value = '1';
    startLoop.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Error'), true);
    globalThis.FileReader = OriginalFileReader;
  });

  it('stops image loop when execute endpoint returns an error', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'failed' }) }));

    renderOperations(
      container,
      [
        {
          id: 'uploadImage',
          summary: 'Upload image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const sequenceInput = container.querySelector('input[name="image-sequence-files"]');
    Object.defineProperty(sequenceInput, 'files', {
      configurable: true,
      value: [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })]
    });
    container.querySelector('input[name="image-sequence-interval"]').value = '0.001';

    const startLoop = Array.from(container.querySelectorAll('button.run-button')).find((node) =>
      node.textContent.includes('Start Image Loop')
    );
    startLoop.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Error'), true);
  });

  it('handles thrown execute errors in image loop', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('network down'));

    renderOperations(
      container,
      [
        {
          id: 'uploadImage',
          summary: 'Upload image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const sequenceInput = container.querySelector('input[name="image-sequence-files"]');
    Object.defineProperty(sequenceInput, 'files', {
      configurable: true,
      value: [new File(['a'], 'a.png', { type: 'image/png' })]
    });
    container.querySelector('input[name="image-sequence-interval"]').value = '1';
    const startLoop = Array.from(container.querySelectorAll('button.run-button')).find((node) =>
      node.textContent.includes('Start Image Loop')
    );

    startLoop.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Error'), true);
  });

  it('renders binary control and handles request errors', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'boom' }) }));

    renderOperations(
      container,
      [
        {
          id: 'bin',
          summary: 'Binary',
          method: 'post',
          path: '/raw',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          }
        }
      ],
      status
    );

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    const runBtn = container.querySelector('button.run-button');
    runBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Error'), true);
  });

  it('handles thrown execute errors for normal run action', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('request failed'));

    renderOperations(
      container,
      [
        {
          id: 'message',
          summary: 'Message',
          method: 'post',
          path: '/message',
          parameters: [],
          requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } }
        }
      ],
      status
    );

    container.querySelector('textarea[name="text-body"]').value = 'hello';
    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Error'), true);
  });

  it('disables all controls while a request is running', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    let resolveFetch;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => pending)
    );

    renderOperations(
      container,
      [
        {
          id: 'a',
          summary: 'Action A',
          method: 'post',
          path: '/a',
          parameters: [],
          requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } }
        },
        {
          id: 'b',
          summary: 'Action B',
          method: 'get',
          path: '/b',
          parameters: [],
          requestBody: null
        }
      ],
      status
    );

    const buttons = container.querySelectorAll('button.run-button');
    await buttons[0].click();
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);

    resolveFetch({ ok: true, json: async () => ({ status: 200, statusText: 'OK', body: {} }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(false);
  });

  it('initApp loads operations and toggles theme', async () => {
    vi.resetModules();
    const { initApp } = await import('../../src/frontend/app.js');

    vi.stubGlobal('fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ baseUrl: 'http://tuneshine-6f34.local', apiVersion: 'v1_0_0', operations: [] })
      })
    );

    await initApp();

    const status = document.getElementById('status-output').textContent;
    expect(status).toContain('Connected to http://tuneshine-6f34.local');
    expect(status).toContain('Active API version: v1_0_0');

    const toggle = document.getElementById('theme-toggle');
    const initial = document.documentElement.getAttribute('data-theme');
    toggle.click();
    const next = document.documentElement.getAttribute('data-theme');
    expect(next).not.toBe(initial);
    expect(localStorage.getItem('tuneshine-theme')).toBe(next);
  });

  it('initApp handles missing apiVersion by showing unknown', async () => {
    vi.resetModules();
    const { initApp } = await import('../../src/frontend/app.js');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ baseUrl: 'http://tuneshine-6f34.local', operations: [] })
      })
    );

    await initApp();
    expect(document.getElementById('status-output').textContent).toContain('Active API version: unknown');
  });

  it('initApp reports loading failures', async () => {
    vi.resetModules();
    const { initApp } = await import('../../src/frontend/app.js');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'bad spec' }) }));
    await initApp();
    expect(document.getElementById('status-output').textContent).toContain('Failed to load API spec');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await initApp();
    expect(document.getElementById('status-output').textContent).toContain('Failed to initialize app');
  });

  it('handles checkbox parameter and invalid JSON body', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();
    vi.stubGlobal('fetch', vi.fn());

    renderOperations(
      container,
      [
        {
          id: 'badJson',
          summary: 'Bad Json',
          method: 'post',
          path: '/state',
          parameters: [{ in: 'query', name: 'enabled', schema: { type: 'boolean' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {} } } } }
        }
      ],
      status
    );

    const checkbox = container.querySelector('input[name="query:enabled"]');
    const json = container.querySelector('textarea[name="json-body"]');
    checkbox.checked = true;
    json.value = '{invalid json';
    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetch).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Error'), true);
  });

  it('auto-inits when disable flag is not set', async () => {
    delete window.__TUNESHINE_DISABLE_AUTO_INIT__;
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ baseUrl: 'http://tuneshine-6f34.local', apiVersion: 'v1_0_0', operations: [] })
      })
    );

    await import('../../src/frontend/app.js');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledWith('/api/spec');
  });

  it('uses stored theme and no-matchMedia fallback', async () => {
    localStorage.setItem('tuneshine-theme', 'dark');
    const originalMatchMedia = window.matchMedia;
    delete window.matchMedia;

    vi.resetModules();
    const { initApp } = await import('../../src/frontend/app.js');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ baseUrl: 'x', apiVersion: 'v1_0_0', operations: [] }) }));
    await initApp();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    window.matchMedia = originalMatchMedia;
  });

  it('builds samples for array/number schemas and ignores path params in payload', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, statusText: 'OK', body: { ok: true } })
    });
    vi.stubGlobal('fetch', fetchMock);

    renderOperations(
      container,
      [
        {
          id: 'schemaCase',
          summary: 'Schema Case',
          method: 'post',
          path: '/state',
          parameters: [{ in: 'path', name: 'id', schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: { type: 'integer' },
                    tags: { type: 'array', items: { type: 'number' } }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    const json = JSON.parse(container.querySelector('textarea[name="json-body"]').value);
    expect(json.count).toBe(0);
    expect(json.tags).toEqual([0]);

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.query.id).toBeUndefined();
    expect(payload.headers.id).toBeUndefined();
  });

  it('uses textarea fallback when json schema is not an object', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 200, statusText: 'OK', body: { ok: true } }) })
    );

    renderOperations(
      container,
      [
        {
          id: 'json-string',
          summary: 'Json String',
          method: 'post',
          path: '/json-string',
          parameters: [],
          requestBody: {
            content: {
              'application/json': {
                schema: { type: 'string' }
              }
            }
          }
        }
      ],
      status
    );

    const textarea = container.querySelector('textarea[name="json-body"]');
    expect(textarea).toBeTruthy();
    textarea.value = '"hello"';
    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.jsonBody).toBe('hello');
  });

  it('does not render image loop controls without binary image file fields', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    renderOperations(
      container,
      [
        {
          id: 'imageMetaOnly',
          summary: 'Image metadata',
          method: 'post',
          path: '/image-meta',
          parameters: [],
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    expect(container.querySelector('button.stop-button')).toBeNull();
    const runButtons = Array.from(container.querySelectorAll('button.run-button')).map((node) => node.textContent);
    expect(runButtons).not.toContain('Start Image Loop');
  });

  it('handles multipart form content when schema is omitted', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 200, statusText: 'OK', body: { ok: true } }) })
    );

    renderOperations(
      container,
      [
        {
          id: 'form-no-schema',
          summary: 'Form no schema',
          method: 'post',
          path: '/form-no-schema',
          parameters: [],
          requestBody: {
            content: {
              'multipart/form-data': {}
            }
          }
        }
      ],
      status
    );

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not render image loop controls for image operations with json bodies', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();

    renderOperations(
      container,
      [
        {
          id: 'setImageConfig',
          summary: 'Set image config',
          method: 'post',
          path: '/image-config',
          parameters: [],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mode: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      ],
      status
    );

    expect(container.querySelector('button.stop-button')).toBeNull();
  });

  it('covers fallback branches for rendering and initialization paths', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    localStorage.removeItem('tuneshine-theme');

    vi.resetModules();
    const { initApp, renderOperations } = await import('../../src/frontend/app.js');

    const container = document.getElementById('operations-container');
    const status = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ baseUrl: 'http://x.local', apiVersion: 'v1_0_0' }) })
        .mockRejectedValueOnce('offline')
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 200, statusText: 'OK', body: {} }) })
    );

    await initApp();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    document.getElementById('theme-toggle').click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    await initApp();
    expect(document.getElementById('status-output').textContent).toContain('Failed to initialize app');

    renderOperations(
      container,
      [
        {
          id: 'fallback-id',
          method: 'post',
          path: '/form',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['rank', 'asset'],
                  properties: {
                    rank: { type: 'integer' },
                    asset: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        },
        {
          id: 'empty-form-schema',
          summary: 'Empty Form',
          method: 'post',
          path: '/empty',
          requestBody: { content: { 'multipart/form-data': { schema: {} } } }
        },
        {
          id: 'array-default',
          summary: 'Array Default',
          method: 'post',
          path: '/json',
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { values: { type: 'array' } } } } } }
        }
      ],
      status
    );

    const firstTitle = container.querySelector('h3').textContent;
    expect(firstTitle).toBe('fallback-id');
    const rankLabel = Array.from(container.querySelectorAll('label')).find((node) => node.textContent.includes('form.rank *'));
    expect(rankLabel).toBeTruthy();

    const fileInput = container.querySelector('input[type="file"]');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['abc'], 'no-type.bin')]
    });
    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const payload = JSON.parse(fetch.mock.calls[2][1].body);
    expect(payload.formBody.files[0].contentType).toBe('application/octet-stream');

    const jsonArea = container.querySelector('textarea[name="json-body"]');
    const parsed = JSON.parse(jsonArea.value);
    expect(parsed.values).toEqual(['']);

    window.matchMedia = originalMatchMedia;
  });

  it('initApp maps tabs to operations and suppresses openapi/brightness operations', async () => {
    vi.resetModules();
    const { initApp } = await import('../../src/frontend/app.js');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          baseUrl: 'http://tuneshine-6f34.local',
          apiVersion: 'v1_0_0',
          operations: [
            { id: 'spec', summary: 'Open API', method: 'get', path: '/openapi.json', parameters: [], requestBody: null },
            { id: 'brightness', summary: 'Brightness', method: 'post', path: '/brightness', parameters: [], requestBody: null },
            {
              id: 'uploadImage',
              summary: 'Upload image',
              method: 'post',
              path: '/image',
              parameters: [],
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } }
                  }
                }
              }
            },
            { id: 'deleteImage', summary: 'Delete image', method: 'delete', path: '/image', parameters: [], requestBody: null },
            { id: 'state', summary: 'Get State', method: 'get', path: '/state', parameters: [], requestBody: null },
            { id: 'health', summary: 'Health', method: 'get', path: '/health', parameters: [], requestBody: null }
          ]
        })
      })
    );

    await initApp();

    const operationsContainer = document.getElementById('operations-container');
    expect(operationsContainer.querySelector('h3').textContent).toBe('Upload Image');
    expect(document.getElementById('context-title').textContent).toBe('Image Upload');
    expect(document.getElementById('connection-banner').textContent).toContain('Connected to http://tuneshine-6f34.local');

    const removeTab = document.querySelector('.tab-button[data-tab="remove"]');
    removeTab.click();
    expect(document.getElementById('context-title').textContent).toBe('Image Removal');
    expect(operationsContainer.querySelector('h3').textContent).toBe('Delete Image');

    const stateTab = document.querySelector('.tab-button[data-tab="state"]');
    stateTab.click();
    expect(document.getElementById('context-title').textContent).toBe('State');
    expect(operationsContainer.querySelector('.meta').textContent).toBe('GET /state');

    const healthTab = document.querySelector('.tab-button[data-tab="health"]');
    healthTab.click();
    expect(document.getElementById('context-title').textContent).toBe('Health');
    expect(operationsContainer.querySelector('.meta').textContent).toBe('GET /health');
  });

  it('initApp renders generic nested status tree for state responses', async () => {
    vi.resetModules();
    const { initApp } = await import('../../src/frontend/app.js');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          baseUrl: 'http://tuneshine-6f34.local',
          apiVersion: 'v1_0_0',
          operations: [
            { id: 'uploadImage', summary: 'Upload image', method: 'post', path: '/image', parameters: [], requestBody: null },
            { id: 'state', summary: 'Get State', method: 'get', path: '/state', parameters: [], requestBody: null }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 200,
          statusText: 'OK',
          body: {
            config: {
              brightness: { base: 0.6, active: 1, idle: 0.3 },
              mode: 'auto'
            },
            power: true
          }
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    await initApp();
    document.querySelector('.tab-button[data-tab="state"]').click();
    document.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const status = document.getElementById('status-output');
    const groups = Array.from(status.querySelectorAll('.status-group-title.tree-node')).map((node) => node.textContent);
    expect(groups).toContain('Config');
    expect(groups).toContain('Brightness');
    expect(groups.filter((label) => label === 'Config').length).toBe(1);
    expect(groups.filter((label) => label === 'Brightness').length).toBe(1);

    const rows = Array.from(status.querySelectorAll('.status-row')).map((node) => node.textContent);
    expect(rows.join(' ')).toContain('Base');
    expect(rows.join(' ')).toContain('Active');
    expect(rows.join(' ')).toContain('Idle');
  });

  it('enforces global lock while request is in progress, including tab switching', async () => {
    vi.resetModules();
    const { initApp } = await import('../../src/frontend/app.js');

    let resolveExecute;
    const executePending = new Promise((resolve) => {
      resolveExecute = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          baseUrl: 'http://tuneshine-6f34.local',
          apiVersion: 'v1_0_0',
          operations: [
            { id: 'uploadImage', summary: 'Upload image', method: 'post', path: '/image', parameters: [], requestBody: null },
            { id: 'state', summary: 'Get State', method: 'get', path: '/state', parameters: [], requestBody: null }
          ]
        })
      })
      .mockImplementation(() => executePending);
    vi.stubGlobal('fetch', fetchMock);

    await initApp();

    const runButton = document.querySelector('button.run-button');
    const stateTab = document.querySelector('.tab-button[data-tab="state"]');
    const uploadTab = document.querySelector('.tab-button[data-tab="upload"]');

    runButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(runButton.disabled).toBe(true);
    expect(stateTab.disabled).toBe(true);
    expect(uploadTab.disabled).toBe(true);

    stateTab.click();
    expect(document.getElementById('context-title').textContent).toBe('Image Upload');

    resolveExecute({
      ok: true,
      json: async () => ({ status: 200, statusText: 'OK', body: { done: true } })
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runButton.disabled).toBe(false);
    expect(stateTab.disabled).toBe(false);
    stateTab.click();
    expect(document.getElementById('context-title').textContent).toBe('State');
  });

  it('shows empty card when a tab has no matching operation', async () => {
    vi.resetModules();
    const { initApp } = await import('../../src/frontend/app.js');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          baseUrl: 'http://tuneshine-6f34.local',
          apiVersion: 'v1_0_0',
          operations: [
            { id: 'uploadImage', summary: 'Upload image', method: 'post', path: '/image', parameters: [], requestBody: null }
          ]
        })
      })
    );

    await initApp();
    document.querySelector('.tab-button[data-tab="health"]').click();

    const cardText = document.getElementById('operations-container').textContent;
    expect(cardText).toContain('No matching endpoint is available');
  });

  it('blocks run handlers when external busy lock is active', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();
    vi.stubGlobal('fetch', vi.fn());

    renderOperations(
      container,
      [
        {
          id: 'message',
          summary: 'Message',
          method: 'post',
          path: '/message',
          parameters: [],
          requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } }
        }
      ],
      status,
      { busyApi: { get: () => true, set: vi.fn() } }
    );

    container.querySelector('button.run-button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith('Action in progress. Please wait for completion.');
  });

  it('blocks image loop start when external busy lock is active', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();
    vi.stubGlobal('fetch', vi.fn());

    renderOperations(
      container,
      [
        {
          id: 'uploadImage',
          summary: 'Upload image',
          method: 'post',
          path: '/image',
          parameters: [],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    image: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        }
      ],
      status,
      { busyApi: { get: () => true, set: vi.fn() } }
    );

    const startLoop = Array.from(container.querySelectorAll('button.run-button')).find((node) =>
      node.textContent.includes('Start Image Loop')
    );
    startLoop.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith('Action in progress. Please wait for completion.');
  });

  it('status helpers parse and render user-friendly states', async () => {
    vi.resetModules();
    const { __test__ } = await import('../../src/frontend/app.js');
    const {
      parseStatusModel,
      renderStatusModel,
      fileToBase64,
      tryParseJson,
      humanizeKey,
      humanizeValue,
      flattenDetails,
      operationSuppressedInFocusedUi,
      operationLooksLikeImageFlow,
      operationShortTitle,
      operationScoreForTab,
      pickOperationForTab
    } = __test__;

    expect(tryParseJson('{bad')).toBeNull();
    expect(tryParseJson('')).toBeNull();
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });

    expect(humanizeKey('config_brightness')).toBe('Config Brightness');
    expect(humanizeValue(true)).toBe('Yes');
    expect(humanizeValue(false)).toBe('No');
    expect(humanizeValue(null)).toBe('Not set');
    expect(humanizeValue(42)).toBe('42');

    expect(operationSuppressedInFocusedUi({ path: '/openapi.json' })).toBe(true);
    expect(operationSuppressedInFocusedUi({ path: '/brightness' })).toBe(true);
    expect(operationSuppressedInFocusedUi({ path: '/state' })).toBe(false);
    expect(operationLooksLikeImageFlow({ summary: 'image upload' })).toBe(true);
    expect(operationLooksLikeImageFlow({ summary: 'state' })).toBe(false);

    expect(operationShortTitle({ id: 'uploadImage', summary: 'Upload image', method: 'post', path: '/image' })).toBe('Upload Image');
    expect(operationShortTitle({ id: 'deleteImage', summary: 'Delete image', method: 'delete', path: '/image' })).toBe('Delete Image');
    expect(operationShortTitle({ id: 'health', summary: 'Check health', method: 'get', path: '/health' })).toBe('Health Check');
    expect(operationShortTitle({ id: 'state', summary: 'Current state', method: 'get', path: '/state' })).toBe('State');

    expect(operationScoreForTab({ summary: 'Upload image', method: 'post', path: '/image' }, 'upload')).toBe(0);
    expect(operationScoreForTab({ summary: 'Image alt', method: 'get', path: '/image' }, 'upload')).toBe(99);
    expect(operationScoreForTab({ summary: 'Delete image', method: 'delete', path: '/image' }, 'remove')).toBe(0);
    expect(operationScoreForTab({ summary: 'Delete image', method: 'get', path: '/image' }, 'remove')).toBe(99);
    expect(operationScoreForTab({ summary: 'State', method: 'get', path: '/state' }, 'state')).toBe(0);
    expect(operationScoreForTab({ summary: 'State', method: 'post', path: '/state' }, 'state')).toBe(1);
    expect(operationScoreForTab({ summary: 'Health', method: 'get', path: '/health' }, 'health')).toBe(0);
    expect(operationScoreForTab({ summary: 'Health', method: 'post', path: '/health' }, 'health')).toBe(1);
    expect(operationScoreForTab({ summary: 'Other', method: 'get', path: '/other' }, 'upload')).toBe(99);

    const picks = [
      { summary: 'Upload image', method: 'post', path: '/image' },
      { summary: 'Image upload backup', method: 'post', path: '/image/backup' }
    ];
    expect(pickOperationForTab(picks, 'upload')?.path).toBe('/image');
    expect(pickOperationForTab([{ summary: 'State', method: 'get', path: '/state' }], 'remove')).toBeNull();

    expect(__test__.sampleForSchema({ type: 'object', properties: {} })).toEqual({});
    expect(__test__.sampleForSchema({ type: 'object', properties: { name: { type: 'string' } } })).toEqual({ name: '' });
    expect(__test__.sampleForSchema({ type: 'array', items: { type: 'number' } })).toEqual([0]);
    expect(__test__.sampleForSchema({ type: 'boolean' })).toBe(false);

    expect(__test__.canRenderFriendlyJsonFields({ type: 'object', properties: {} })).toBe(false);
    expect(
      __test__.canRenderFriendlyJsonFields({
        type: 'object',
        properties: { nested: { type: 'object' } }
      })
    ).toBe(false);
    expect(
      __test__.canRenderFriendlyJsonFields({
        type: 'object',
        properties: { any: {} }
      })
    ).toBe(true);
    expect(
      __test__.canRenderFriendlyJsonFields({
        type: 'object',
        properties: { enabled: { type: 'boolean' }, count: { type: 'integer' } }
      })
    ).toBe(true);

    const flattened = flattenDetails({
      config: { brightness: { base: 0.6, active: 1, idle: 0.2 } },
      channels: [1, 2, 3],
      meta: null
    });
    expect(flattened.map((entry) => entry.key)).toContain('Config > Brightness > Base');
    expect(flattened.map((entry) => entry.key)).toContain('Channels');
    expect(flattenDetails('hello')[0].value).toBe('hello');

    const capped = [];
    flattenDetails([{ a: 1 }, { b: 2 }], 'Items', capped, 1);
    expect(capped.length).toBe(1);
    expect(flattenDetails([], 'Items').some((entry) => entry.value === 'None')).toBe(true);
    expect(flattenDetails({}, 'Block').some((entry) => entry.value === 'None')).toBe(true);

    const successModel = parseStatusModel('Success\nHTTP 200 OK\n{"status":"good","count":2}');
    expect(successModel.tone).toBe('ok');
    expect(successModel.title).toBe('Action completed');
    expect(successModel.details.length).toBeGreaterThan(0);

    const nonJsonSuccess = parseStatusModel('Success\nHTTP 502 Bad Gateway\nservice unavailable');
    expect(nonJsonSuccess.tone).toBe('error');
    expect(nonJsonSuccess.details[0].key).toBe('Result');

    const errorModel = parseStatusModel('Error\n{"reason":"bad input"}', true);
    expect(errorModel.tone).toBe('error');
    expect(errorModel.details[0].key).toBe('Reason');
    const plainError = parseStatusModel('Error\nnetwork failed', true);
    expect(plainError.details[0].key).toBe('Message');

    const runningModel = parseStatusModel('Running POST /state...');
    expect(runningModel.title).toContain('progress');

    const connectedModel = parseStatusModel('Connected to http://host\nActive API version: v1_0_0\nLoaded 5 operations.');
    expect(connectedModel.tone).toBe('ok');

    const fallbackModel = parseStatusModel('', true);
    expect(fallbackModel.title).toBe('Action failed');
    const updateModel = parseStatusModel('Random update text');
    expect(updateModel.title).toBe('Update');

    const container = document.createElement('div');
    renderStatusModel(container, successModel);
    expect(container.querySelector('.status-dot.ok')).toBeTruthy();
    expect(container.querySelectorAll('.status-row').length).toBeGreaterThan(0);

    renderStatusModel(
      container,
      parseStatusModel('Success\nHTTP 200 OK\n{"config":{"brightness":{"base":0.7,"idle":0.3}}}')
    );
    const treeGroups = Array.from(container.querySelectorAll('.status-group-title.tree-node')).map((node) => node.textContent);
    expect(treeGroups).toContain('Config');
    expect(treeGroups).toContain('Brightness');
    expect(container.querySelectorAll('.status-row').length).toBeGreaterThan(0);

    renderStatusModel(container, { tone: 'ok', title: 'T', subtitle: '', details: [{ key: '', value: 'x' }] });
    expect(container.querySelectorAll('.status-row').length).toBe(0);

    renderStatusModel(container, { tone: 'warn', title: 'Waiting', subtitle: '', details: [] });
    expect(container.querySelectorAll('.status-row').length).toBe(0);
    expect(container.querySelector('.status-dot')).toBeTruthy();

    const OriginalFileReader = globalThis.FileReader;
    class PlainReader {
      readAsDataURL() {
        this.result = 'abc123';
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
    }
    globalThis.FileReader = PlainReader;
    const noCommaBase64 = await fileToBase64(new File(['x'], 'x.bin', { type: 'application/octet-stream' }));
    expect(noCommaBase64).toBe('abc123');
    globalThis.FileReader = OriginalFileReader;
  });

  it('marks secondary cards when provided with secondary operation set', async () => {
    vi.resetModules();
    const { renderOperations } = await import('../../src/frontend/app.js');
    const container = document.getElementById('operations-container');
    const status = vi.fn();
    const op = { id: 'state', summary: 'State', method: 'get', path: '/state', parameters: [], requestBody: null };

    renderOperations(container, [op], status, { secondaryOperations: new Set([op]) });
    expect(container.querySelector('.operation-card').classList.contains('secondary-card')).toBe(true);

    container.innerHTML = '';
    renderOperations(container, [op], status, { showMeta: false });
    expect(container.querySelector('.meta')).toBeNull();
  });
});
