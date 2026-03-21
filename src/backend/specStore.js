import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.js';

export function createFileSpecStore(filePath) {
  return {
    async read() {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          logger.info(`Spec cache file not found: ${filePath}`);
          return null;
        }
        logger.warn(`Spec cache read failed, ignoring cache: ${filePath}`, String(error.message || error));
        return null;
      }
    },
    async write(spec) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(spec, null, 2), 'utf8');
      logger.info(`Spec cache written: ${filePath}`);
    }
  };
}
