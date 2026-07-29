const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const config = require('../dist-electron/backend/config.js');
const db = require('../dist-electron/backend/db.js');
const opencodeUsage = require('../dist-electron/backend/opencode-usage.js');
const usageSync = require('../dist-electron/backend/usage-sync.js');

function setupDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '68hub-test-'));
  config.setDataDir(dir);
  db.initDb();
  return dir;
}

function cleanupDb(dir) {
  db.closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
}

function usageRecord(id, createdAt, model = 'test-model') {
  return {
    usg_id: id,
    created_at: createdAt,
    model,
    provider: 'test',
    input_tokens: 10,
    output_tokens: 5,
    cost_raw: 1000,
    cost_usd: 0.000001,
    key_id: 'key_test',
    plan: 'test',
  };
}

test('model token statistics honor the requested day range', () => {
  const dir = setupDb();
  try {
    const account = db.createOpencodeAccount({
      name: 'test',
      workspace_id: 'wrk_test',
      auth_cookie: 'auth=test',
    });
    const recent = new Date(Date.now() - 2 * 86400000).toISOString();
    const old = new Date(Date.now() - 40 * 86400000).toISOString();
    db.insertUsageRecordsIgnore(account.id, 'wrk_test', [
      usageRecord('usg_recent', recent),
      usageRecord('usg_old', old),
    ]);

    assert.equal(db.opencodeModelTokenStats(7)[0].request_count, 1);
    assert.equal(db.opencodeModelTokenStats(90)[0].request_count, 2);
  } finally {
    cleanupDb(dir);
  }
});

test('backfill does not advance past a failed page', async () => {
  const dir = setupDb();
  const originalFetchUsagePage = opencodeUsage.fetchUsagePage;
  try {
    const created = db.createOpencodeAccount({
      name: 'test',
      workspace_id: 'wrk_test',
      auth_cookie: 'auth=test',
    });
    db.updateOpencodeAccount(created.id, { resolved_workspace_id: 'wrk_test' });
    const account = db.getOpencodeAccount(created.id);
    assert.ok(account);

    opencodeUsage.fetchUsagePage = async ({ page = 0 }) => {
      if (page === 1) throw new Error('temporary proxy failure');
      return Array.from({ length: 50 }, (_, index) =>
        usageRecord(`usg_${page}_${index}`, new Date().toISOString()),
      );
    };

    await assert.rejects(() => usageSync.backfillUsage(account, 5), /temporary proxy failure/);
    const state = db.getUsageSyncState(account.id);
    assert.equal(state.deepest_page_fetched, -1);
    assert.equal(db.listUsageRecords(account.id)[1], 0);
  } finally {
    opencodeUsage.fetchUsagePage = originalFetchUsagePage;
    cleanupDb(dir);
  }
});

test('new installations default to the system/browser proxy mode', () => {
  const dir = setupDb();
  try {
    assert.equal(config.loadServiceConfig().network.proxy_mode, 'system');
  } finally {
    cleanupDb(dir);
  }
});

test('usage response parser accepts the original server serialization', () => {
  const response = String.raw`$R[0]={id:"usg_old",timeCreated:$R[1]=new Date("2026-07-27T15:44:00.000Z"),model:"glm-5.2",provider:"opencode",inputTokens:28264,outputTokens:380,cost:10200000,keyID:"key_old",enrichment:$R[2]={plan:"Go"}}`;

  assert.deepEqual(opencodeUsage.parseUsageResponse(response), [
    {
      usg_id: 'usg_old',
      created_at: '2026-07-27T15:44:00.000Z',
      model: 'glm-5.2',
      provider: 'opencode',
      input_tokens: 28264,
      output_tokens: 380,
      cost_raw: 10200000,
      cost_usd: 0.0102,
      key_id: 'key_old',
      plan: 'Go',
    },
  ]);
});

test('usage response parser accepts reordered fields and referenced dates', () => {
  const response = String.raw`$R[8]=new Date("2026-07-27T15:36:00.000Z");$R[0]={"outputTokens":264,"id":"usg_reordered","cost":400000,"inputTokens":30016,"timeCreated":$R[8],"model":"deepseek-v4-pro","enrichment":{"plan":"Go"}}`;

  assert.deepEqual(opencodeUsage.parseUsageResponse(response), [
    {
      usg_id: 'usg_reordered',
      created_at: '2026-07-27T15:36:00.000Z',
      model: 'deepseek-v4-pro',
      provider: null,
      input_tokens: 30016,
      output_tokens: 264,
      cost_raw: 400000,
      cost_usd: 0.0004,
      key_id: null,
      plan: 'Go',
    },
  ]);
});

test('usage response parser accepts an ISO date string and missing optional fields', () => {
  const response = String.raw`{"id":"usg_json","model":"glm-5.2","timeCreated":"2026-07-27T15:44:00.000Z","inputTokens":27263,"outputTokens":39,"cost":38300000}`;

  const [record] = opencodeUsage.parseUsageResponse(response);
  assert.equal(record.usg_id, 'usg_json');
  assert.equal(record.created_at, '2026-07-27T15:44:00.000Z');
  assert.equal(record.provider, null);
  assert.equal(record.key_id, null);
  assert.equal(record.plan, null);
});

test('usage response parser reports an incompatible non-empty usage payload', () => {
  const response = String.raw`$R[0]={id:"usg_changed",inputTokens:123,unexpected:"upstream format changed"}`;

  assert.throws(
    () => opencodeUsage.parseUsageResponse(response),
    /OpenCode.*format|OpenCode.*格式/i,
  );
});
