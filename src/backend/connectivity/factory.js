import { TuneshineV1_0_0Client } from './v1_0_0/TuneshineV1_0_0Client.js';

const CLIENTS_BY_VERSION = {
  v1_0_0: TuneshineV1_0_0Client
};

export function createTuneshineClient(config, options = {}) {
  const version = options.version || config.apiVersion;
  const Client = CLIENTS_BY_VERSION[version];

  if (!Client) {
    throw new Error(`Unsupported Tuneshine API version: ${version}`);
  }

  const versionSettings = config.apiVersions?.[version];
  if (!versionSettings) {
    throw new Error(`Missing configuration profile for Tuneshine API version: ${version}`);
  }

  return new Client(config, versionSettings);
}

export function getSupportedApiVersions() {
  return Object.keys(CLIENTS_BY_VERSION);
}
