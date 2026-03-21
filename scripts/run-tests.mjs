import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('node', ['scripts/sample-input-smoke.mjs']);
run('npm', ['test']);
run('node', ['scripts/check-coverage.mjs']);
console.log('All tests completed successfully.');
