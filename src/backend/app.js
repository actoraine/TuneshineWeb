import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeOperation, fetchOpenApiSpec } from './tuneshineClient.js';
import { getConfig } from './config.js';
import { normalizeOperations } from './openapi.js';
import { createFileSpecStore } from './specStore.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');

export function createHandlers({ config, fetchSpec, execute, getBusy, setBusy, specStore }) {
  const store = specStore || createFileSpecStore(config.specCacheFilePath);
  return {
    health: (_req, res) => {
      logger.info('Health check requested');
      res.json({ status: 'ok', apiVersion: config.apiVersion });
    },
    spec: async (_req, res) => {
      try {
        const cachedSpec = await store.read();
        if (cachedSpec) {
          logger.info('Serving cached OpenAPI spec');
          const operations = normalizeOperations(cachedSpec);
          res.json({
            spec: cachedSpec,
            operations,
            baseUrl: config.baseUrl,
            apiVersion: config.apiVersion,
            cached: true
          });
          return;
        }

        logger.info('OpenAPI cache not found. Fetching from Tuneshine.');
        const spec = await fetchSpec(config);
        await store.write(spec);
        logger.info('OpenAPI spec fetched and cache created');
        const operations = normalizeOperations(spec);
        res.json({ spec, operations, baseUrl: config.baseUrl, apiVersion: config.apiVersion, cached: false });
      } catch (error) {
        logger.error('Failed to fetch or serve OpenAPI spec', String(error.message || error));
        res.status(502).json({
          error: 'Unable to fetch Tuneshine API specification.',
          details: String(error.message || error)
        });
      }
    },
    execute: async (req, res) => {
      if (getBusy()) {
        logger.warn('Execution rejected: another operation already in progress');
        res.status(409).json({ error: 'Another operation is already in progress.' });
        return;
      }

      setBusy(true);
      try {
        logger.info('Executing Tuneshine operation', {
          method: req.body?.method,
          path: req.body?.path
        });
        const result = await execute(config, req.body || {});
        logger.info('Tuneshine operation completed', {
          method: req.body?.method,
          path: req.body?.path,
          status: result.status,
          ok: result.ok
        });
        res.status(result.ok ? 200 : 502).json(result);
      } catch (error) {
        logger.error('Tuneshine operation failed', String(error.message || error));
        res.status(400).json({
          error: 'Failed to execute Tuneshine operation.',
          details: String(error.message || error)
        });
      } finally {
        setBusy(false);
      }
    },
    index: (_req, res) => {
      res.sendFile(path.resolve(frontendDir, 'index.html'));
    }
  };
}

export function createApp(dependencies = {}) {
  const app = express();
  const config = dependencies.config || getConfig();
  const fetchSpec = dependencies.fetchSpec || fetchOpenApiSpec;
  const execute = dependencies.execute || executeOperation;
  const specStore = dependencies.specStore || createFileSpecStore(config.specCacheFilePath);

  let operationInProgress = false;

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          // Local HTTP app: prevent forced HTTPS upgrade that can break Safari asset loading on localhost.
          upgradeInsecureRequests: null
        }
      }
    })
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(frontendDir));

  const handlers = createHandlers({
    config,
    fetchSpec,
    execute,
    specStore,
    getBusy: () => operationInProgress,
    setBusy: (value) => {
      operationInProgress = value;
    }
  });

  app.get('/api/health', handlers.health);
  app.get('/api/spec', handlers.spec);
  app.post('/api/execute', handlers.execute);
  app.get('*', handlers.index);

  return app;
}
