import { createApp } from './app.js';
import { getConfig } from './config.js';
import { logger } from './logger.js';

const config = getConfig();
const app = createApp({ config });

app.listen(config.port, config.host, () => {
  logger.info(`Tuneshine web app running at http://${config.host}:${config.port}`);
});
