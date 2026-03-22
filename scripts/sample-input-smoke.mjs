import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const openapiPath = path.resolve(root, 'tests/sample-input/openapi-sample.json');
const metadataPath = path.resolve(root, 'tests/sample-input/sample-metadata.json');
const messagePath = path.resolve(root, 'tests/sample-input/sample-message.txt');
const imagePath = path.resolve(root, 'tests/sample-input/sample-image.png');

const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const message = fs.readFileSync(messagePath, 'utf8').trim();
const image = fs.readFileSync(imagePath);

if (!openapi.paths?.['/state']?.post) {
  throw new Error('Sample OpenAPI is missing /state POST.');
}

if (!metadata.artist || !metadata.track) {
  throw new Error('Sample metadata does not include artist/track.');
}

if (!message.length) {
  throw new Error('Sample text message is empty.');
}

if (!image.length) {
  throw new Error('Sample image file is empty.');
}

console.log('Sample input smoke test passed.');
