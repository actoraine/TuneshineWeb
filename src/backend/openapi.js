function resolveSchemaRef(ref, spec) {
  const parts = ref.replace(/^#\//, '').split('/');
  let current = spec;
  for (const part of parts) {
    current = current?.[part];
  }
  return current || null;
}

export function resolveSchema(schema, spec) {
  if (!schema) {
    return null;
  }

  if (schema.$ref) {
    return resolveSchemaRef(schema.$ref, spec);
  }

  return schema;
}

export function normalizeOperations(spec) {
  const operations = [];
  const paths = spec?.paths || {};

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods || {})) {
      const loweredMethod = method.toLowerCase();
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(loweredMethod)) {
        continue;
      }

      const params = [
        ...(spec?.paths?.[path]?.parameters || []),
        ...(operation?.parameters || [])
      ];

      operations.push({
        id: operation?.operationId || `${loweredMethod}_${path}`,
        method: loweredMethod,
        path,
        summary: operation?.summary || operation?.description || `${loweredMethod.toUpperCase()} ${path}`,
        parameters: params,
        requestBody: operation?.requestBody || null
      });
    }
  }

  return operations;
}

export function isSafeRelativePath(inputPath) {
  return typeof inputPath === 'string' && /^\/[A-Za-z0-9._~!$&'()*+,;=:@\/-]*$/.test(inputPath);
}
