import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

function writeTempConfig(content) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuneshine-config-'));
  const configPath = path.join(tmpDir, 'config.yaml');
  fs.writeFileSync(configPath, content, 'utf8');
  return configPath;
}

describe('config', () => {
  it('reads yaml config and strips trailing slash', async () => {
    const configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3100',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local/',
      '  timeoutMs: 12000',
      '  specCacheFilePath: cache/spec-v1_0_0.json',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));

    vi.resetModules();
    const { getConfig } = await import('../../src/backend/config.js');
    const config = getConfig(configPath);
    expect(config).toMatchObject({
      baseUrl: 'http://tuneshine-6f34.local',
      port: 3100,
      host: '127.0.0.1',
      timeoutMs: 12000,
      apiVersion: 'v1_0_0'
    });
    expect(config.specCacheFilePath.endsWith('/cache/spec-v1_0_0.json')).toBe(true);
  });

  it('uses default spec cache file path when not set', async () => {
    const configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 10000',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));

    vi.resetModules();
    const { getConfig } = await import('../../src/backend/config.js');
    const config = getConfig(configPath);
    expect(config.specCacheFilePath.endsWith('/cache/spec-v1_0_0.json')).toBe(true);
  });

  it('throws when config file is missing', async () => {
    vi.resetModules();
    const { getConfig } = await import('../../src/backend/config.js');
    expect(() => getConfig('/tmp/does-not-exist-config.yaml')).toThrow('Config file not found');
  });

  it('throws when yaml root is not an object', async () => {
    const configPath = writeTempConfig('just-text');
    vi.resetModules();
    const { getConfig } = await import('../../src/backend/config.js');
    expect(() => getConfig(configPath)).toThrow('YAML object');
  });

  it('throws on invalid values', async () => {
    vi.resetModules();
    const { getConfig } = await import('../../src/backend/config.js');

    let configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: tuneshine-6f34.local',
      '  timeoutMs: 10000',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('tuneshine.baseUrl');

    configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 99999',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 10000',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('port');

    configPath = writeTempConfig([
      'host: "   "',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 10000',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('host');

    configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 99',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('timeoutMs');

    configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 1000',
      '  apiVersion: 100',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('non-empty string');

    configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 1000',
      '  specCacheFilePath: "   "',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('specCacheFilePath');

    configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 1000',
      '  apiVersion: v9',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('apiVersion');

    configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 1000',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: openapi.json',
      '      operationBasePath: ""'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('openApiPath');

    configPath = writeTempConfig([
      'host: 127.0.0.1',
      'port: 3000',
      'tuneshine:',
      '  baseUrl: http://tuneshine-6f34.local',
      '  timeoutMs: 1000',
      '  apiVersion: v1_0_0',
      '  apiVersions:',
      '    v1_0_0:',
      '      openApiPath: /openapi.json',
      '      operationBasePath: api'
    ].join('\n'));
    expect(() => getConfig(configPath)).toThrow('operationBasePath');
  });
});
