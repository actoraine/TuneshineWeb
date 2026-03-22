function preferDarkMode() {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tuneshine-theme', theme);
}

function initTheme() {
  const stored = localStorage.getItem('tuneshine-theme');
  const theme = stored || (preferDarkMode() ? 'dark' : 'light');
  applyTheme(theme);

  const toggle = document.getElementById('theme-toggle');
  toggle?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

function pretty(value) {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function sampleForSchema(schema = {}) {
  const type = schema.type;
  if (type === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties || {})) {
      out[k] = sampleForSchema(v);
    }
    return out;
  }
  if (type === 'array') {
    return [sampleForSchema(schema.items || { type: 'string' })];
  }
  if (type === 'number' || type === 'integer') {
    return 0;
  }
  if (type === 'boolean') {
    return false;
  }
  return '';
}

function canRenderFriendlyJsonFields(schema = {}) {
  if (schema?.type !== 'object') {
    return false;
  }
  const entries = Object.entries(schema.properties || {});
  if (entries.length === 0) {
    return false;
  }
  return entries.every(([, fieldSchema]) =>
    ['string', 'number', 'integer', 'boolean'].includes(fieldSchema?.type || 'string')
  );
}

function createInput({ labelText, name, type = 'text', required = false }) {
  const label = document.createElement('label');
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.required = required;

  label.appendChild(input);
  return { label, input };
}

function createTextarea({ labelText, name, required = false, value = '' }) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const textarea = document.createElement('textarea');
  textarea.name = name;
  textarea.required = required;
  textarea.value = value;
  label.appendChild(textarea);
  return { label, textarea };
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      const base64 = data.includes(',') ? data.split(',')[1] : data;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function withWebpExtension(filename) {
  return filename.replace(/\.[A-Za-z0-9]+$/, '') + '.webp';
}

async function convertImageFileToWebp(file) {
  const mimeType = String(file?.type || '').toLowerCase();
  if (!mimeType.startsWith('image/')) {
    return { file, converted: false };
  }
  if (mimeType === 'image/webp') {
    return { file, converted: false };
  }

  if (
    typeof Image === 'undefined' ||
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    return { file, converted: false };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) {
      return { file, converted: false };
    }
    ctx.drawImage(image, 0, 0);

    const webpBlob = await new Promise((resolve, reject) => {
      if (typeof canvas.toBlob !== 'function') {
        reject(new Error('Canvas toBlob is not supported'));
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error(`Failed to convert image to WebP: ${file.name}`));
          return;
        }
        resolve(blob);
      }, 'image/webp', 0.92);
    });

    const convertedFile = new File([webpBlob], withWebpExtension(file.name), { type: 'image/webp' });
    return { file: convertedFile, converted: true };
  } catch (_error) {
    return { file, converted: false };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareUploadFile(file) {
  const converted = await convertImageFileToWebp(file);
  return {
    file: converted.file,
    filename: converted.file.name,
    contentType: converted.file.type || 'application/octet-stream',
    convertedToWebp: converted.converted
  };
}

function getBodyType(operation) {
  const content = operation?.requestBody?.content || {};
  if (content['multipart/form-data']) {
    return 'form';
  }
  if (content['application/json']) {
    return 'json';
  }
  if (content['text/plain']) {
    return 'text';
  }
  if (content['application/octet-stream']) {
    return 'binary';
  }
  return 'none';
}

function gatherParameterValue(input, paramSchema) {
  if (input.type === 'checkbox') {
    return input.checked;
  }
  if ((paramSchema?.type === 'number' || paramSchema?.type === 'integer') && input.value !== '') {
    return Number(input.value);
  }
  return input.value;
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function operationLooksLikeImageFlow(operation) {
  const haystack = `${operation?.id || ''} ${operation?.summary || ''} ${operation?.path || ''}`.toLowerCase();
  return haystack.includes('image');
}

function operationSuppressedInFocusedUi(operation) {
  const path = String(operation?.path || '').toLowerCase();
  return path.includes('/openapi.json') || path.includes('/brightness');
}

function operationShortTitle(operation) {
  const haystack = `${operation?.id || ''} ${operation?.summary || ''} ${operation?.path || ''}`.toLowerCase();
  const method = String(operation?.method || '').toLowerCase();
  if (haystack.includes('image') && (haystack.includes('upload') || method === 'post')) {
    return 'Upload Image';
  }
  if (haystack.includes('image') && (haystack.includes('delete') || method === 'delete')) {
    return 'Delete Image';
  }
  if (haystack.includes('health') || String(operation?.path || '').toLowerCase().includes('/health')) {
    return 'Health Check';
  }
  if (haystack.includes('state') || String(operation?.path || '').toLowerCase().includes('/state')) {
    return 'State';
  }
  return operation.summary || operation.id;
}

function operationScoreForTab(operation, tab) {
  const haystack = `${operation?.id || ''} ${operation?.summary || ''} ${operation?.path || ''}`.toLowerCase();
  const path = String(operation?.path || '').toLowerCase();
  const method = String(operation?.method || '').toLowerCase();

  if (tab === 'upload') {
    if (haystack.includes('image') && method === 'post') {
      return 0;
    }
    return 99;
  }

  if (tab === 'remove') {
    if (haystack.includes('image') && method === 'delete') {
      return 0;
    }
    return 99;
  }

  if (tab === 'state') {
    if (haystack.includes('state') || path.includes('/state')) {
      return method === 'get' ? 0 : 1;
    }
    return 99;
  }

  if (tab === 'health') {
    if (haystack.includes('health') || path.includes('/health')) {
      return method === 'get' ? 0 : 1;
    }
    return 99;
  }

  return 99;
}

function pickOperationForTab(operations, tab) {
  const scored = operations
    .map((operation) => ({ operation, score: operationScoreForTab(operation, tab) }))
    .filter((entry) => entry.score < 99)
    .sort((a, b) => a.score - b.score);
  return scored[0]?.operation || null;
}

function tryParseJson(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
}

function humanizeKey(input) {
  return String(input || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeValue(value) {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value === null || value === undefined || value === '') {
    return 'Not set';
  }
  return String(value);
}

function flattenDetails(value, prefix = '', rows = [], maxRows = 24) {
  if (rows.length >= maxRows) {
    return rows;
  }

  if (value === null || value === undefined) {
    rows.push({ key: prefix || 'Value', value: 'Not set' });
    return rows;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      rows.push({ key: prefix || 'Items', value: 'None' });
      return rows;
    }
    const scalarArray = value.every((item) => typeof item !== 'object' || item === null);
    if (scalarArray) {
      rows.push({ key: prefix || 'Items', value: value.map((item) => humanizeValue(item)).join(', ') });
      return rows;
    }
    for (let index = 0; index < value.length; index += 1) {
      flattenDetails(value[index], `${prefix || 'Item'} ${index + 1}`, rows, maxRows);
      if (rows.length >= maxRows) {
        break;
      }
    }
    return rows;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      rows.push({ key: prefix || 'Details', value: 'None' });
      return rows;
    }
    for (const [key, nextValue] of entries) {
      const nextKey = prefix ? `${prefix} > ${humanizeKey(key)}` : humanizeKey(key);
      flattenDetails(nextValue, nextKey, rows, maxRows);
      if (rows.length >= maxRows) {
        break;
      }
    }
    return rows;
  }

  rows.push({ key: prefix || 'Value', value: humanizeValue(value) });
  return rows;
}

function pushDetailRow(details, key, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  details.push({ key: humanizeKey(key), value: humanizeValue(value) });
}

function parseStatusModel(text, isError = false) {
  const fallback = {
    tone: isError ? 'error' : 'warn',
    title: isError ? 'Action failed' : 'Waiting for action',
    subtitle: text || 'Run an action to see results here.',
    details: []
  };

  if (typeof text !== 'string' || text.trim() === '') {
    return fallback;
  }

  if (text.startsWith('Success\nHTTP ')) {
    const lines = text.split('\n');
    const match = /^HTTP\s+(\d+)\s+(.+)$/.exec(lines[1] || '');
    const code = Number(match?.[1] || 0);
    const bodyText = lines.slice(2).join('\n').trim();
    const parsedBody = tryParseJson(bodyText);
    let details = [];
    if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
      details = flattenDetails(parsedBody);
    } else if (bodyText) {
      pushDetailRow(details, 'Result', bodyText);
    }
    return {
      tone: code >= 200 && code < 300 ? 'ok' : 'error',
      title: code >= 200 && code < 300 ? 'Action completed' : 'Action returned an error',
      subtitle: '',
      details
    };
  }

  if (text.startsWith('Error\n')) {
    const message = text.split('\n').slice(1).join('\n').trim();
    const parsed = tryParseJson(message);
    const details = [];
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        pushDetailRow(details, key, value);
      }
    } else {
      pushDetailRow(details, 'Message', message);
    }
    return {
      tone: 'error',
      title: 'Action failed',
      subtitle: 'Please check parameters and try again.',
      details
    };
  }

  if (text.startsWith('Running')) {
    return {
      tone: 'warn',
      title: 'Action in progress',
      subtitle: text,
      details: []
    };
  }

  if (text.startsWith('Connected to ')) {
    const lines = text.split('\n');
    return {
      tone: 'ok',
      title: 'Connected',
      subtitle: lines[0],
      details: lines.slice(1).map((line, index) => ({ key: index === 0 ? 'info' : 'details', value: line }))
    };
  }

  return {
    tone: isError ? 'error' : 'warn',
    title: isError ? 'Action failed' : 'Update',
    subtitle: text,
    details: []
  };
}

function renderStatusModel(container, model) {
  container.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'status-head';

  const dot = document.createElement('span');
  dot.className = `status-dot${model.tone === 'ok' ? ' ok' : ''}${model.tone === 'error' ? ' error' : ''}`;
  dot.setAttribute('aria-hidden', 'true');
  head.appendChild(dot);

  const textWrap = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'status-title';
  title.textContent = model.title;
  textWrap.appendChild(title);

  if (model.subtitle) {
    const subtitle = document.createElement('div');
    subtitle.className = 'status-subtitle';
    subtitle.textContent = model.subtitle;
    textWrap.appendChild(subtitle);
  }
  head.appendChild(textWrap);

  container.appendChild(head);

  if (!Array.isArray(model.details) || model.details.length === 0) {
    return;
  }

  const details = document.createElement('div');
  details.className = 'status-details';

  const root = { children: new Map(), value: null };
  for (const detail of model.details) {
    const parts = String(detail.key || '')
      .split(' > ')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    let node = root;
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map(), value: null });
      }
      node = node.children.get(part);
    }
    node.value = String(detail.value);
  }

  function renderNode(name, node, depth) {
    const branch = document.createElement('div');
    branch.className = 'status-tree-branch';
    branch.style.setProperty('--tree-depth', String(depth));

    const hasChildren = node.children.size > 0;
    if (hasChildren) {
      const title = document.createElement('div');
      title.className = 'status-group-title tree-node';
      title.textContent = name;
      branch.appendChild(title);
    } else {
      const row = document.createElement('div');
      row.className = 'status-row is-nested tree-leaf';

      const key = document.createElement('span');
      key.className = 'status-key';
      key.textContent = name;
      row.appendChild(key);

      const value = document.createElement('span');
      value.className = 'status-value';
      value.textContent = node.value || 'Not set';
      row.appendChild(value);

      branch.appendChild(row);
    }

    for (const [childName, childNode] of node.children) {
      branch.appendChild(renderNode(childName, childNode, depth + 1));
    }

    return branch;
  }

  for (const [name, node] of root.children) {
    details.appendChild(renderNode(name, node, 0));
  }

  container.appendChild(details);
}

export function renderOperations(container, operations, statusWriter, options = {}) {
  container.innerHTML = '';
  const runButtons = [];
  const controls = [];
  const stopButtons = [];
  let activeLoopStopButton = null;
  let activeLoopToken = null;
  const secondaryOperations = options.secondaryOperations || new Set();
  const useFriendlyTitles = Boolean(options.useFriendlyTitles);
  const showMeta = options.showMeta !== false;
  const busyApi = options.busyApi || {
    get: () => false,
    set: () => {}
  };

  function toggleBusyState(busy) {
    busyApi.set(busy);
    for (const button of runButtons) {
      button.disabled = busy;
    }
    for (const control of controls) {
      control.disabled = busy;
    }
    for (const stopButton of stopButtons) {
      stopButton.disabled = !busy || stopButton !== activeLoopStopButton;
    }
  }

  const handlers = operations.map((operation) => {
    const card = document.createElement('article');
    card.className = 'operation-card';

    const title = document.createElement('h3');
    title.textContent = useFriendlyTitles ? operationShortTitle(operation) : (operation.summary || operation.id);
    card.appendChild(title);

    if (showMeta) {
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${operation.method.toUpperCase()} ${operation.path}`;
      card.appendChild(meta);
    }

    if (secondaryOperations.has(operation)) {
      card.classList.add('secondary-card');
    }

    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'controls';

    const paramInputs = [];
    for (const param of operation.parameters || []) {
      const schema = param.schema || {};
      const inputType = schema.type === 'boolean' ? 'checkbox' : (schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text');
      const field = createInput({
        labelText: `${param.in}.${param.name}${param.required ? ' *' : ''}`,
        name: `${param.in}:${param.name}`,
        type: inputType,
        required: Boolean(param.required)
      });
      paramInputs.push({ input: field.input, param });
      controls.push(field.input);
      controlsWrap.appendChild(field.label);
    }

    const bodyType = getBodyType(operation);
    let jsonTextarea = null;
    let textTextarea = null;
    const formFields = [];
    const formFileFields = [];

    if (bodyType === 'json') {
      const schema = operation.requestBody.content['application/json'].schema;
      if (canRenderFriendlyJsonFields(schema)) {
        const requiredFields = new Set(schema.required || []);
        const sample = sampleForSchema(schema);
        for (const [fieldName, fieldSchema] of Object.entries(schema.properties || {})) {
          const inputType = fieldSchema.type === 'boolean'
            ? 'checkbox'
            : (fieldSchema.type === 'number' || fieldSchema.type === 'integer' ? 'number' : 'text');
          const field = createInput({
            labelText: `json.${fieldName}${requiredFields.has(fieldName) ? ' *' : ''}`,
            name: `json-field:${fieldName}`,
            type: inputType,
            required: requiredFields.has(fieldName)
          });

          if (inputType === 'checkbox') {
            field.input.checked = Boolean(sample[fieldName]);
          } else {
            field.input.value = String(sample[fieldName] ?? '');
          }

          formFields.push({ name: fieldName, schema: fieldSchema, input: field.input, isJsonField: true });
          controls.push(field.input);
          controlsWrap.appendChild(field.label);
        }
      } else {
        const sample = sampleForSchema(schema);
        const field = createTextarea({
          labelText: 'body (application/json)',
          name: 'json-body',
          required: Boolean(operation.requestBody.required),
          value: pretty(sample)
        });
        jsonTextarea = field.textarea;
        controls.push(jsonTextarea);
        controlsWrap.appendChild(field.label);
      }
    }

    if (bodyType === 'text') {
      const field = createTextarea({
        labelText: 'body (text/plain)',
        name: 'text-body',
        required: Boolean(operation.requestBody.required)
      });
      textTextarea = field.textarea;
      controls.push(textTextarea);
      controlsWrap.appendChild(field.label);
    }

    if (bodyType === 'binary') {
      const field = createInput({
        labelText: 'file (application/octet-stream) *',
        name: 'binary-file',
        type: 'file',
        required: true
      });
      formFileFields.push({ name: 'file', input: field.input });
      controls.push(field.input);
      controlsWrap.appendChild(field.label);
    }

    if (bodyType === 'form') {
      const schema = operation.requestBody.content['multipart/form-data'].schema || {};
      for (const [fieldName, fieldSchema] of Object.entries(schema.properties || {})) {
        const required = (schema.required || []).includes(fieldName);
        if (fieldSchema.format === 'binary') {
          const fileField = createInput({
            labelText: `form.${fieldName}${required ? ' *' : ''}`,
            name: fieldName,
            type: 'file',
            required
          });
          formFileFields.push({ name: fieldName, input: fileField.input });
          controls.push(fileField.input);
          controlsWrap.appendChild(fileField.label);
          continue;
        }

        const field = createInput({
          labelText: `form.${fieldName}${required ? ' *' : ''}`,
          name: fieldName,
          type: fieldSchema.type === 'number' || fieldSchema.type === 'integer' ? 'number' : 'text',
          required
        });
        formFields.push({ name: fieldName, schema: fieldSchema, input: field.input });
        controls.push(field.input);
        controlsWrap.appendChild(field.label);
      }
    }

    card.appendChild(controlsWrap);

    const buildPayload = async ({ overrideFileByFieldName } = {}) => {
      const payload = {
        method: operation.method,
        path: operation.path,
        query: {},
        headers: {},
        bodyType: bodyType === 'binary' ? 'form' : bodyType
      };

      for (const entry of paramInputs) {
        const value = gatherParameterValue(entry.input, entry.param.schema);
        if (entry.param.in === 'query') {
          payload.query[entry.param.name] = value;
        } else if (entry.param.in === 'header') {
          payload.headers[entry.param.name] = value;
        }
      }

      if (bodyType === 'json' && jsonTextarea && jsonTextarea.value.trim() !== '') {
        payload.jsonBody = JSON.parse(jsonTextarea.value);
      } else if (bodyType === 'json' && !jsonTextarea) {
        payload.jsonBody = {};
        for (const field of formFields.filter((entry) => entry.isJsonField)) {
          payload.jsonBody[field.name] = gatherParameterValue(field.input, field.schema);
        }
      }

      if (bodyType === 'text' && textTextarea) {
        payload.textBody = textTextarea.value;
      }

      if (bodyType === 'form' || bodyType === 'binary') {
        payload.formBody = { fields: {}, files: [] };
        for (const field of formFields) {
          payload.formBody.fields[field.name] = gatherParameterValue(field.input, field.schema);
        }
        for (const fileField of formFileFields) {
          const file = overrideFileByFieldName?.[fileField.name] || fileField.input.files?.[0];
          if (!file) {
            continue;
          }
          const prepared = await prepareUploadFile(file);
          const contentBase64 = await fileToBase64(prepared.file);
          payload.formBody.files.push({
            name: fileField.name,
            filename: prepared.filename,
            contentType: prepared.contentType,
            contentBase64
          });
        }
      }

      return payload;
    };

    const executePayload = async (payload) => {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        statusWriter(`Error\n${pretty(result)}`, true);
        return false;
      }

      statusWriter(`Success\nHTTP ${result.status} ${result.statusText}\n${pretty(result.body)}`);
      return true;
    };

    const runButton = document.createElement('button');
    runButton.type = 'button';
    runButton.className = 'run-button';
    runButton.textContent = 'Run';
    runButtons.push(runButton);

    const handler = async () => {
      if (busyApi.get()) {
        statusWriter('Action in progress. Please wait for completion.');
        return;
      }
      try {
        toggleBusyState(true);
        statusWriter(`Running ${operation.method.toUpperCase()} ${operation.path}...`);
        const payload = await buildPayload();
        await executePayload(payload);
      } catch (error) {
        statusWriter(`Error\n${String(error.message || error)}`, true);
      } finally {
        toggleBusyState(false);
      }
    };

    runButton.addEventListener('click', handler);
    card.appendChild(runButton);

    const canRunImageLoop =
      operationLooksLikeImageFlow(operation) &&
      (bodyType === 'form' || bodyType === 'binary') &&
      formFileFields.length > 0;

    if (canRunImageLoop) {
      const loopControlsWrap = document.createElement('div');
      loopControlsWrap.className = 'loop-controls';

      const loopTitle = document.createElement('h4');
      loopTitle.textContent = 'Image Sequence Loop';
      loopControlsWrap.appendChild(loopTitle);

      const sequenceFilesField = createInput({
        labelText: 'image sequence files (multiple)',
        name: 'image-sequence-files',
        type: 'file'
      });
      sequenceFilesField.input.multiple = true;
      sequenceFilesField.input.accept = 'image/*';
      controls.push(sequenceFilesField.input);
      loopControlsWrap.appendChild(sequenceFilesField.label);

      const intervalField = createInput({
        labelText: 'interval seconds',
        name: 'image-sequence-interval',
        type: 'number',
        required: true
      });
      intervalField.input.min = '1';
      intervalField.input.step = '1';
      intervalField.input.value = '2';
      controls.push(intervalField.input);
      loopControlsWrap.appendChild(intervalField.label);

      const loopButton = document.createElement('button');
      loopButton.type = 'button';
      loopButton.className = 'run-button';
      loopButton.textContent = 'Start Image Loop';
      runButtons.push(loopButton);

      const stopButton = document.createElement('button');
      stopButton.type = 'button';
      stopButton.className = 'stop-button';
      stopButton.textContent = 'Stop Loop';
      stopButton.disabled = true;
      stopButtons.push(stopButton);
      loopControlsWrap.appendChild(loopButton);
      loopControlsWrap.appendChild(stopButton);

      stopButton.addEventListener('click', () => {
        if (activeLoopToken) {
          activeLoopToken.stopped = true;
          statusWriter('Stopping image loop...');
        }
      });

      loopButton.addEventListener('click', async () => {
        if (busyApi.get()) {
          statusWriter('Action in progress. Please wait for completion.');
          return;
        }
        const selectedFiles = Array.from(sequenceFilesField.input.files || []);
        const intervalSeconds = Number(intervalField.input.value);
        if (selectedFiles.length === 0) {
          statusWriter('Error\nPlease choose one or more images for loop upload.', true);
          return;
        }
        if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
          statusWriter('Error\nInterval seconds must be greater than zero.', true);
          return;
        }

        const targetField = formFileFields[0];
        const preparedLoopFiles = await Promise.all(selectedFiles.map((file) => prepareUploadFile(file)));
        const token = { stopped: false };
        activeLoopToken = token;
        activeLoopStopButton = stopButton;
        toggleBusyState(true);

        try {
          let uploadCount = 0;
          let index = 0;
          while (!token.stopped) {
            const currentPrepared = preparedLoopFiles[index];
            const displayIndex = (index % preparedLoopFiles.length) + 1;
            statusWriter(
              `Running image loop ${displayIndex}/${preparedLoopFiles.length}\n${operation.method.toUpperCase()} ${operation.path}\n${currentPrepared.filename}\nUploaded: ${uploadCount}`
            );

            const payload = await buildPayload({
              overrideFileByFieldName: { [targetField.name]: currentPrepared.file }
            });
            const ok = await executePayload(payload);
            if (!ok) {
              break;
            }

            uploadCount += 1;
            index = (index + 1) % preparedLoopFiles.length;

            if (!token.stopped) {
              await delayMs(intervalSeconds * 1000);
            }
          }

          if (token.stopped) {
            statusWriter(`Image loop stopped after ${uploadCount} uploads.`);
          }
        } catch (error) {
          statusWriter(`Error\n${String(error.message || error)}`, true);
        } finally {
          if (activeLoopToken === token) {
            activeLoopToken = null;
            activeLoopStopButton = null;
          }
          toggleBusyState(false);
        }
      });

      card.appendChild(loopControlsWrap);
    }

    container.appendChild(card);

    return { runButton, handler };
  });

  return { handlers, toggleBusyState };
}

export const __test__ = {
  fileToBase64,
  sampleForSchema,
  canRenderFriendlyJsonFields,
  operationLooksLikeImageFlow,
  operationSuppressedInFocusedUi,
  operationShortTitle,
  operationScoreForTab,
  pickOperationForTab,
  tryParseJson,
  humanizeKey,
  humanizeValue,
  flattenDetails,
  parseStatusModel,
  renderStatusModel
};

export async function initApp() {
  initTheme();

  const statusOutput = document.getElementById('status-output');
  const operationsContainer = document.getElementById('operations-container');
  const contextTitle = document.getElementById('context-title');
  const connectionBanner = document.getElementById('connection-banner');
  const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
  let globalBusy = false;

  const busyApi = {
    get: () => globalBusy,
    set: (busy) => {
      globalBusy = Boolean(busy);
      for (const button of tabButtons) {
        button.disabled = globalBusy;
      }
    }
  };

  const statusWriter = (text, isError = false) => {
    const model = parseStatusModel(text, isError);
    renderStatusModel(statusOutput, model);
  };

  try {
    const response = await fetch('/api/spec');
    const payload = await response.json();

    if (!response.ok) {
      statusWriter(`Failed to load API spec.\n${pretty(payload)}`, true);
      return;
    }

    const operations = payload.operations || [];
    const focused = operations.filter((operation) => !operationSuppressedInFocusedUi(operation));

    const operationsByTab = {
      upload: pickOperationForTab(focused, 'upload'),
      remove: pickOperationForTab(focused, 'remove'),
      state: pickOperationForTab(focused, 'state'),
      health: pickOperationForTab(focused, 'health')
    };

    const tabLabels = {
      upload: 'Image Upload',
      remove: 'Image Removal',
      state: 'State',
      health: 'Health'
    };

    function renderTab(tab) {
      for (const button of tabButtons) {
        button.classList.toggle('active', button.dataset.tab === tab);
      }
      contextTitle.textContent = tabLabels[tab] || 'Action';

      const operation = operationsByTab[tab];
      if (!operation) {
        operationsContainer.innerHTML = '';
        const empty = document.createElement('article');
        empty.className = 'operation-card';
        const heading = document.createElement('h3');
        heading.textContent = tabLabels[tab] || 'Action';
        const help = document.createElement('p');
        help.className = 'status-empty';
        help.textContent = 'No matching endpoint is available in the API spec for this action.';
        empty.appendChild(heading);
        empty.appendChild(help);
        operationsContainer.appendChild(empty);
        return;
      }

      renderOperations(operationsContainer, [operation], statusWriter, {
        useFriendlyTitles: true,
        showMeta: true,
        busyApi
      });
    }

    connectionBanner.textContent = `Connected to ${payload.baseUrl}`;

    for (const button of tabButtons) {
      button.addEventListener('click', () => {
        renderTab(String(button.dataset.tab));
      });
    }

    renderTab('upload');

    statusWriter(
      `Connected to ${payload.baseUrl}\nActive API version: ${payload.apiVersion || 'unknown'}\nLoaded ${operations.length} operations.`
    );
  } catch (error) {
    statusWriter(`Failed to initialize app.\n${String(error.message || error)}`, true);
  }
}

if (typeof window !== 'undefined' && !window.__TUNESHINE_DISABLE_AUTO_INIT__) {
  initApp();
}
