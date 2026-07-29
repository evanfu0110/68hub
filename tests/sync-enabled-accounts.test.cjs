const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '68hub-sync-test-'));
const bundlePath = path.join(tempDir, 'sync-enabled-accounts.cjs');
const sourcePath = path.resolve(__dirname, '../src/api/sync-enabled-accounts.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: sourcePath,
});

fs.writeFileSync(bundlePath, compiled.outputText);

const testModule = new Module(bundlePath);
testModule.filename = bundlePath;
testModule.paths = Module._nodeModulePaths(tempDir);
testModule._compile(compiled.outputText, bundlePath);
const { syncEnabledAccounts } = testModule.exports;

test.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

test('pull refresh syncs every enabled account before reloading dashboard data', async () => {
  const calls = [];
  const result = await syncEnabledAccounts({
    listAccounts: async () => [
      { id: 'enabled-1', enabled: true },
      { id: 'disabled', enabled: false },
      { id: 'enabled-2', enabled: true },
    ],
    syncUsage: async (id) => {
      calls.push(id);
      return { inserted: id === 'enabled-1' ? 2 : 3 };
    },
  });

  assert.deepEqual(calls, ['enabled-1', 'enabled-2']);
  assert.deepEqual(result, { accountCount: 2, inserted: 5 });
});
