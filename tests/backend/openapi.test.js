import { describe, expect, it } from 'vitest';
import { isSafeRelativePath, normalizeOperations, resolveSchema } from '../../src/backend/openapi.js';

describe('openapi helpers', () => {
  it('resolves refs and plain schemas', () => {
    const spec = {
      components: {
        schemas: {
          Song: { type: 'object', properties: { artist: { type: 'string' } } }
        }
      }
    };

    expect(resolveSchema({ $ref: '#/components/schemas/Song' }, spec)).toEqual(spec.components.schemas.Song);
    expect(resolveSchema({ $ref: '#/components/schemas/Missing' }, spec)).toBeNull();
    expect(resolveSchema({ type: 'string' }, spec)).toEqual({ type: 'string' });
    expect(resolveSchema(null, spec)).toBeNull();
  });

  it('normalizes operations and filters unsupported methods', () => {
    const spec = {
      paths: {
        '/state': {
          parameters: [{ in: 'header', name: 'x-id' }],
          get: { summary: 'Read state', parameters: [{ in: 'query', name: 'verbose' }] },
          trace: { summary: 'Ignore me' }
        }
      }
    };

    const operations = normalizeOperations(spec);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ method: 'get', path: '/state', summary: 'Read state' });
    expect(operations[0].parameters).toEqual([
      { in: 'header', name: 'x-id' },
      { in: 'query', name: 'verbose' }
    ]);
  });

  it('falls back to generated operation summary', () => {
    const operations = normalizeOperations({
      paths: {
        '/ping': {
          post: {}
        }
      }
    });
    expect(operations[0].summary).toBe('POST /ping');
  });

  it('validates safe relative paths', () => {
    expect(isSafeRelativePath('/state')).toBe(true);
    expect(isSafeRelativePath('/image/upload-1')).toBe(true);
    expect(isSafeRelativePath('http://evil')).toBe(false);
    expect(isSafeRelativePath('../state')).toBe(false);
    expect(isSafeRelativePath('/state?x=1')).toBe(false);
  });
});
