import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config/config.yaml');

function parseYamlConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Config file must contain a YAML object');
  }

  return parsed;
}

export function getConfig(configPath = DEFAULT_CONFIG_PATH) {
  const parsed = parseYamlConfig(configPath);

  const host = parsed.host;
  const port = Number(parsed.port);

  const baseUrl = parsed?.tuneshine?.baseUrl;
  const timeoutMs = Number(parsed?.tuneshine?.timeoutMs);
  const apiVersion = parsed?.tuneshine?.apiVersion;
  const apiVersions = parsed?.tuneshine?.apiVersions || {};

  const defaultCachePath = path.resolve(process.cwd(), `cache/spec-${String(apiVersion || 'unknown')}.json`);
  const specCacheFilePath = parsed?.tuneshine?.specCacheFilePath || defaultCachePath;

  if (!/^https?:\/\//i.test(String(baseUrl || ''))) {
    throw new Error('tuneshine.baseUrl must include http:// or https://');
  }

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error('port must be a valid TCP port number');
  }

  if (typeof host !== 'string' || host.trim().length === 0) {
    throw new Error('host must be a non-empty string');
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) {
    throw new Error('tuneshine.timeoutMs must be at least 1000 ms');
  }

  if (typeof apiVersion !== 'string' || apiVersion.length === 0) {
    throw new Error('tuneshine.apiVersion must be a non-empty string');
  }

  if (!apiVersions[apiVersion]) {
    throw new Error('tuneshine.apiVersion must match a configured version profile');
  }

  if (typeof specCacheFilePath !== 'string' || specCacheFilePath.trim().length === 0) {
    throw new Error('tuneshine.specCacheFilePath must be a non-empty string');
  }

  for (const [versionName, settings] of Object.entries(apiVersions)) {
    if (!String(settings?.openApiPath || '').startsWith('/')) {
      throw new Error(`${versionName} openApiPath must start with /`);
    }
    if (settings?.operationBasePath && !String(settings.operationBasePath).startsWith('/')) {
      throw new Error(`${versionName} operationBasePath must start with / when set`);
    }
  }

  return {
    port,
    host,
    baseUrl: String(baseUrl).replace(/\/$/, ''),
    timeoutMs,
    specCacheFilePath: path.resolve(process.cwd(), specCacheFilePath),
    apiVersion,
    apiVersions
  };
}
