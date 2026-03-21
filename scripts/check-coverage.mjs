import fs from 'node:fs';
import path from 'node:path';

const summaryPath = path.resolve(process.cwd(), 'coverage/coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  throw new Error('Coverage summary not found. Run npm test first.');
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const total = summary.total;
const metrics = ['lines', 'statements', 'functions', 'branches'];
const threshold = 90;

for (const metric of metrics) {
  const pct = total?.[metric]?.pct ?? 0;
  if (pct < threshold) {
    throw new Error(`Coverage for ${metric} is ${pct}%, below required ${threshold}%.`);
  }
}

console.log('Coverage threshold check passed:', metrics.map((m) => `${m}=${total[m].pct}%`).join(', '));
