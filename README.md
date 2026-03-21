# Tuneshine Web Console

Local Node.js single-page web app for non-technical users to operate a Tuneshine device through its API.

## What This App Does

- Discovers API actions dynamically from `http://<tuneshine-host>/openapi.json`
- Renders one action card per API operation, each with one `Run` button
- Generates user inputs automatically (text, numbers, booleans, JSON, text body, file upload)
- Provides a separate image-sequence loop panel for image APIs (multi-file + interval + stop)
- Image-sequence mode loops continuously by default until `Stop Loop` is pressed
- Shows a live status panel docked at the bottom of the screen
- Enforces one action at a time in both frontend and backend
- Supports Light and Dark modes

## Project Structure

- `src/backend/` Express backend and Tuneshine integration logic
- `src/frontend/` Single-page UI (`index.html`, `styles.css`, `app.js`)
- `config/` YAML runtime configuration
- `tests/backend/` backend unit tests
- `tests/frontend/` frontend tests (JSDOM + Vitest)
- `sample-input/` sample OpenAPI and sample files for test scenarios
- `scripts/` test runner and coverage utility scripts

## Tuneshine Integration Notes

This app integrates using Tuneshine host information from the help page and local-network hostname pattern:

- Hostname example: `tuneshine-6f34.local`
- OpenAPI source: `http://tuneshine-6f34.local/openapi.json`
- Recommended state endpoint behavior is supported by providing direct API operation execution from the discovered spec.

## Configuration

The server reads config from YAML only (no system environment variable sourcing).

Default config file path:

- `config/config.yaml`

Copy the template:

```bash
cp config/config.yaml.example config/config.yaml
```

YAML format:

```yaml
host: 127.0.0.1
port: 3000
tuneshine:
  baseUrl: http://tuneshine-6f34.local
  timeoutMs: 10000
  specCacheFilePath: cache/spec-v1_0_0.json
  apiVersion: v1_0_0
  apiVersions:
    v1_0_0:
      openApiPath: /openapi.json
      operationBasePath: ""
```

Versioned connectivity notes:

- Connectivity classes are versioned under `src/backend/connectivity/<version>/` (currently `src/backend/connectivity/v1_0_0/`).
- Active version is selected by `tuneshine.apiVersion` in YAML.
- To roll back, change `tuneshine.apiVersion` and restart the app.
- New versions can be added as new classes and YAML profiles without modifying older versions.

API spec cache notes:

- OpenAPI spec is cached to `tuneshine.specCacheFilePath`.
- If the cache file does not exist, the server fetches the spec once and creates the cache file.

## macOS Setup (including Node.js installation)

If Node.js is not installed, install Homebrew first (if needed), then Node.js:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node
node -v
npm -v
```

Then install dependencies:

```bash
npm install
```

## Start the Website

```bash
npm start
```

Open:

- `http://127.0.0.1:3000`

## Test Commands

Run all tests with coverage:

```bash
npm test
```

Run backend tests only:

```bash
npm run test:backend
```

Run frontend tests only:

```bash
npm run test:frontend
```

Run the full utility flow (sample input validation + tests + coverage check):

```bash
npm run test:all
```

Check coverage threshold explicitly:

```bash
npm run coverage:check
```

Current enforced minimum thresholds:

- Lines: 90%
- Statements: 90%
- Functions: 90%
- Branches: 90%

## Security Checks

Run dependency vulnerability scan:

```bash
npm run audit
```

The current dependency set reports `0 vulnerabilities`.
