const { spawnSync } = require('child_process');
const path = require('path');

const electronPath = require('electron');

function run(args, extraEnv = {}) {
  const result = spawnSync(electronPath, args, {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run([
  '--test',
  path.join(__dirname, 'backend.test.cjs'),
  path.join(__dirname, 'sync-enabled-accounts.test.cjs'),
], {
  ELECTRON_RUN_AS_NODE: '1',
});

const browserEnv = { ...process.env };
delete browserEnv.ELECTRON_RUN_AS_NODE;
const browserResult = spawnSync(electronPath, [path.join(__dirname, 'electron-net-smoke.cjs')], {
  cwd: path.resolve(__dirname, '..'),
  env: browserEnv,
  stdio: 'inherit',
});
if (browserResult.error) throw browserResult.error;
if (browserResult.status !== 0) process.exit(browserResult.status || 1);
