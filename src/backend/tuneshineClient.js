import { createTuneshineClient } from './connectivity/factory.js';

export function getTuneshineClient(config, options = {}) {
  return createTuneshineClient(config, options);
}

export async function fetchOpenApiSpec(config, options = {}) {
  const client = getTuneshineClient(config, options);
  return client.fetchOpenApiSpec();
}

export async function executeOperation(config, payload, options = {}) {
  const client = getTuneshineClient(config, options);
  return client.executeOperation(payload);
}
