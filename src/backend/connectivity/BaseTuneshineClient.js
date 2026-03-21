import { isSafeRelativePath } from '../openapi.js';
import sharp from 'sharp';
import { logger } from '../logger.js';
import { createHash } from 'node:crypto';

const WEBP_CONVERSION_CACHE_LIMIT = 200;
const webpConversionCache = new Map();

function toQueryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function normalizePrefix(prefix) {
  if (!prefix) {
    return '';
  }

  const withLeadingSlash = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return withLeadingSlash === '/' ? '' : withLeadingSlash.replace(/\/$/, '');
}

function prependPrefix(prefix, operationPath) {
  if (!prefix) {
    return operationPath;
  }

  if (operationPath === prefix || operationPath.startsWith(`${prefix}/`)) {
    return operationPath;
  }

  return `${prefix}${operationPath}`;
}

function hasImageMimeType(contentType = '') {
  return String(contentType).toLowerCase().startsWith('image/');
}

function isWebpMimeType(contentType = '') {
  return String(contentType).toLowerCase() === 'image/webp';
}

function toWebpFilename(filename = 'image') {
  if (/\.[A-Za-z0-9]+$/.test(filename)) {
    return filename.replace(/\.[A-Za-z0-9]+$/, '.webp');
  }
  return `${filename}.webp`;
}

function conversionCacheKey(mimeType, buffer) {
  const digest = createHash('sha1').update(buffer).digest('hex');
  return `${String(mimeType).toLowerCase()}::${digest}`;
}

function getCachedWebpConversion(mimeType, originalBuffer) {
  const key = conversionCacheKey(mimeType, originalBuffer);
  const cached = webpConversionCache.get(key);
  if (!cached) {
    return null;
  }
  webpConversionCache.delete(key);
  webpConversionCache.set(key, cached);
  return cached;
}

function setCachedWebpConversion(mimeType, originalBuffer, converted) {
  const key = conversionCacheKey(mimeType, originalBuffer);
  webpConversionCache.set(key, converted);
  if (webpConversionCache.size > WEBP_CONVERSION_CACHE_LIMIT) {
    const firstKey = webpConversionCache.keys().next().value;
    webpConversionCache.delete(firstKey);
  }
}

async function ensureWebpFilePayload(file) {
  const mimeType = file.contentType || 'application/octet-stream';
  const originalBuffer = Buffer.from(file.contentBase64, 'base64');

  if (!hasImageMimeType(mimeType) || isWebpMimeType(mimeType)) {
    if (isWebpMimeType(mimeType)) {
      logger.info(`Image already WebP, skipping conversion: ${file.filename}`);
    }
    return {
      filename: file.filename,
      contentType: mimeType,
      buffer: originalBuffer
    };
  }

  const cached = getCachedWebpConversion(mimeType, originalBuffer);
  if (cached) {
    return {
      filename: toWebpFilename(file.filename),
      contentType: 'image/webp',
      buffer: cached
    };
  }

  try {
    const convertedBuffer = await sharp(originalBuffer).webp({ quality: 92 }).toBuffer();
    setCachedWebpConversion(mimeType, originalBuffer, convertedBuffer);
    logger.info(`Converted image to WebP: ${file.filename} -> ${toWebpFilename(file.filename)}`);
    return {
      filename: toWebpFilename(file.filename),
      contentType: 'image/webp',
      buffer: convertedBuffer
    };
  } catch {
    logger.warn(`Image conversion failed, using original bytes: ${file.filename}`);
    return {
      filename: file.filename,
      contentType: mimeType,
      buffer: originalBuffer
    };
  }
}

export class BaseTuneshineClient {
  constructor(config, versionSettings) {
    this.config = config;
    this.versionSettings = {
      openApiPath: versionSettings?.openApiPath || '/openapi.json',
      operationBasePath: normalizePrefix(versionSettings?.operationBasePath || '')
    };
  }

  async fetchOpenApiSpec() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}${this.versionSettings.openApiPath}`, {
        signal: controller.signal,
        headers: {
          accept: 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch OpenAPI spec: HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async executeOperation(payload) {
    if (!isSafeRelativePath(payload.path)) {
      throw new Error('Invalid path. Expected a safe relative path starting with /.');
    }

    const method = String(payload.method || 'get').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      throw new Error('Invalid HTTP method requested.');
    }

    const query = payload.query || {};
    const headers = payload.headers || {};
    const bodyType = payload.bodyType || 'none';
    const resolvedPath = prependPrefix(this.versionSettings.operationBasePath, payload.path);
    const url = `${this.config.baseUrl}${resolvedPath}${toQueryString(query)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const fetchOptions = {
      method,
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain;q=0.9, */*;q=0.8'
      }
    };

    for (const [name, value] of Object.entries(headers)) {
      if (value !== null && value !== undefined && value !== '') {
        fetchOptions.headers[name] = String(value);
      }
    }

    if (bodyType === 'json' && payload.jsonBody && method !== 'GET') {
      fetchOptions.headers['content-type'] = 'application/json';
      fetchOptions.body = JSON.stringify(payload.jsonBody);
    }

    if (bodyType === 'text' && typeof payload.textBody === 'string' && method !== 'GET') {
      fetchOptions.headers['content-type'] = 'text/plain; charset=utf-8';
      fetchOptions.body = payload.textBody;
    }

    if (bodyType === 'form' && payload.formBody && method !== 'GET') {
      const form = new FormData();
      const formBody = payload.formBody;

      for (const [key, value] of Object.entries(formBody.fields || {})) {
        if (value !== null && value !== undefined && value !== '') {
          form.append(key, String(value));
        }
      }

      for (const file of formBody.files || []) {
        if (!file?.name || !file?.filename || !file?.contentBase64) {
          continue;
        }
        const ensured = await ensureWebpFilePayload(file);
        const blob = new Blob([ensured.buffer], { type: ensured.contentType });
        form.append(file.name, blob, ensured.filename);
      }

      fetchOptions.body = form;
      delete fetchOptions.headers['content-type'];
    }

    try {
      const response = await fetch(url, fetchOptions);
      const responseContentType = response.headers.get('content-type') || '';

      let body;
      if (responseContentType.includes('application/json')) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType: responseContentType,
        body
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
