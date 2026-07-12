import { useRef, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import type { OpenCodeAccount } from '../api/types';

export function Settings() {
  const { toast } = useToast();
  const { data: config, refetch } = usePolling(
    () => api.getConfig(),
    60000,
  );

  const [form, setForm] = useState({ name: '', auth_cookie: '', workspace_id: 'Default' });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(300);
  const [backfillPages, setBackfillPages] = useState(100);
  const [deleteTarget, setDeleteTarget] = useState<OpenCodeAccount | null>(null);
  const addModal = useRef<HTMLDialogElement>(null);
  const deleteModal = useRef<HTMLDialogElement>(null);

  const accounts = config?.opencode_accounts ?? [];

  const openAdd = () => {
    setForm({ name: '', auth_cookie: '', workspace_id: 'Default' });
    addModal.current?.showModal();
  };

  const handleAdd = async () => {
    if (!form.name || !form.auth_cookie) return;
    setSaving(true);
    try {
      await api.createOpenCodeAccount(form);
      toast('账户添加成功', 'success');
      addModal.current?.close();
      refetch();
    } catch (e) {
      toast('添加失败: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doSync = async (id: string, mode: 'sync' | 'backfill') => {
    setSyncing(id);
    try {
      const fn = mode === 'sync' ? api.syncUsage : api.backfillUsage;
      const result = await fn(id);
      const label = mode === 'sync' ? '同步' : '回填';
      toast(`${label}完成! 新增 ${result.inserted} 条，拉了 ${result.pages_fetched} 页`, 'success');
      refetch();
    } catch (e) {
      toast('操作失败: ' + (e as Error).message, 'error');
    } finally {
      setSyncing(null);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await api.testOpenCodeAccount(id);
      if (result.success) {
        toast('测试成功! workspace: ' + result.workspace_id, 'success');
      } else {
        toast('测试失败: ' + (result.error || '未知错误'), 'error');
      }
      refetch();
    } catch (e) {
      toast('测试失败: ' + (e as Error).message, 'error');
    } finally {
      setTesting(null);
    }
  };

  const confirmDelete = (account: OpenCodeAccount) => {
    setDeleteTarget(account);
    deleteModal.current?.showModal();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteOpenCodeAccount(deleteTarget.id);
      toast('账户已删除', 'success');
      refetch();
    } catch (e) {
      toast('删除失败: ' + (e as Error).message, 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleToggle = async (account: OpenCodeAccount) => {
    try {
      await api.updateOpenCodeAccount(account.id, { enabled: !account.enabled });
      refetch();
    } catch (e) {
      toast('更新失败: ' + (e as Error).message, 'error');
    }
  };

  const saveSyncSettings = async () => {
    try {
      await api.updateConfig({
        usage_sync: {
          auto_sync: autoSync,
          interval_sec: syncInterval,
        },
      });
      toast('同步设置已保存', 'success');
      refetch();
    } catch (e) {
      toast('保存失败: ' + (e as Error).message, 'error');
    }
  };

  const saveBackfillSettings = async () => {
    try {
      await api.updateConfig({
        usage_sync: {
          backfill_pages_per_request: backfillPages,
        },
      });
      toast('回填设置已保存', 'success');
      refetch();
    } catch (e) {
      toast('保存失败: ' + (e as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-base-content">设置</h1>
        <p className="text-xs text-base-content/40 mt-1">管理 OpenCode Go 账户和数据同步</p>
      </div>

      <div className="border border-base-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-base-content/70">OpenCode 账户</h2>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            添加账户
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-6 text-base-content/50 text-sm">
            暂无账户，点击"添加账户"开始
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between bg-base-200/50 rounded-box px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${account.enabled ? 'bg-success' : 'bg-base-content/30'}`}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate text-base-content">{account.name}</div>
                    <div className="text-xs text-base-content/50 font-mono truncate">
                      {account.auth_cookie_masked || '-'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    className={`btn btn-xs btn-ghost ${account.enabled ? 'text-success' : 'text-base-content/40'}`}
                    onClick={() => handleToggle(account)}
                  >
                    {account.enabled ? '已启用' : '已禁用'}
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => handleTest(account.id)}
                    disabled={testing === account.id}
                  >
                    {testing === account.id
                      ? <span className="loading loading-spinner loading-xs" />
                      : '测试'}
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => doSync(account.id, 'sync')}
                    disabled={syncing === account.id}
                  >
                    {syncing === account.id
                      ? <span className="loading loading-spinner loading-xs" />
                      : '同步'}
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => doSync(account.id, 'backfill')}
                    disabled={syncing === account.id}
                  >
                    {syncing === account.id
                      ? <span className="loading loading-spinner loading-xs" />
                      : '回填'}
                  </button>
                  <button
                    className="btn btn-xs btn-ghost text-error"
                    onClick={() => confirmDelete(account)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-base-200 rounded-xl p-4">
        <h2 className="text-sm font-bold text-base-content/70 mb-4">自动同步</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-base-content/70">自动同步</div>
              <div className="text-[11px] text-base-content/40 mt-0.5">定时拉取最新的使用记录</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-base-content/70">同步间隔</div>
              <div className="text-[11px] text-base-content/40 mt-0.5">每次自动同步的时间间隔</div>
            </div>
            <select
              className="select select-bordered select-sm w-28"
              value={syncInterval}
              onChange={(e) => setSyncInterval(Number(e.target.value))}
            >
              <option value={60}>1 分钟</option>
              <option value={300}>5 分钟</option>
              <option value={600}>10 分钟</option>
              <option value={1800}>30 分钟</option>
            </select>
          </div>

          <button className="btn btn-primary btn-sm" onClick={saveSyncSettings}>
            保存同步设置
          </button>
        </div>
      </div>

      <div className="border border-base-200 rounded-xl p-4">
        <h2 className="text-sm font-bold text-base-content/70 mb-4">历史回填</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-base-content/70">回填页数</div>
              <div className="text-[11px] text-base-content/40 mt-0.5">每页 50 条，从最深的历史记录往前拉</div>
            </div>
            <select
              className="select select-bordered select-sm w-28"
              value={backfillPages}
              onChange={(e) => setBackfillPages(Number(e.target.value))}
            >
              <option value={200}>200 页</option>
              <option value={500}>500 页</option>
              <option value={1000}>1000 页</option>
            </select>
          </div>

          <button className="btn btn-primary btn-sm" onClick={saveBackfillSettings}>
            保存回填设置
          </button>
        </div>
      </div>

      <div className="border border-base-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-base-content/70">说明</h2>

        <div className="text-sm text-base-content/60 leading-relaxed space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-base-content mb-1">同步 vs 回填</h3>
            <p className="text-xs text-base-content/50">
              <span className="font-medium text-base-content/70">同步</span> 是从当前位置往前翻，拉取最新的使用记录。启用自动同步后，后台会按设定的间隔自动执行。
              点击账户旁的「同步」按钮可手动触发。
            </p>
            <p className="text-xs text-base-content/50 mt-2">
              <span className="font-medium text-base-content/70">回填</span> 是从已拉到的最深处继续往前翻，专门用来拉取历史数据。
              新添加的账户需要先回填才能看到过去的记录。页数越大拉得越多。
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-base-content mb-1">新用户与老用户</h3>
            <p className="text-xs text-base-content/50">
              <span className="font-medium text-base-content/70">新 OpenCode Go 用户：</span>
              添加账户后，点击「同步」拉取最近的记录即可使用。自动同步默认开启，后续数据会自动更新。
            </p>
            <p className="text-xs text-base-content/50 mt-2">
              <span className="font-medium text-base-content/70">已使用 OpenCode Go 的用户：</span>
              添加账户后，先点「同步」拉取最新数据，再点「回填」拉取历史记录。
              建议先设置回填 500~1000 页，然后点击账户旁的「回填」按钮。
              回填完成后，主页和统计页面就能看到完整数据。
            </p>
          </div>
        </div>
      </div>

      <dialog ref={addModal} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-semibold text-base mb-4">添加 OpenCode 账户</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-base-content/60 mb-1.5 block">名称</label>
              <input
                type="text"
                className="input-native"
                placeholder="例如: 我的主账户"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-base-content/60 mb-1.5 block">Workspace ID</label>
              <input
                type="text"
                className="input-native"
                placeholder="Default"
                value={form.workspace_id}
                onChange={(e) => setForm({ ...form, workspace_id: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-base-content/60 mb-1.5 block">Auth Cookie</label>
              <input
                type="password"
                className="input-native font-mono"
                placeholder="粘贴 auth=xxx..."
                value={form.auth_cookie}
                onChange={(e) => setForm({ ...form, auth_cookie: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-action">
            <button className="btn btn-sm" onClick={() => addModal.current?.close()}>取消</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAdd}
              disabled={saving || !form.name || !form.auth_cookie}
            >
              {saving ? <span className="loading loading-spinner loading-xs" /> : '保存'}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <dialog ref={deleteModal} className="modal">
        <div className="modal-box max-w-sm">
          <h3 className="font-semibold text-base mb-2">确认删除</h3>
          <p className="text-sm text-base-content/60">
            确定要删除账户 <span className="font-medium text-base-content">{deleteTarget?.name}</span> 吗？相关使用记录也会一并删除。
          </p>
          <div className="modal-action">
            <button className="btn btn-sm" onClick={() => { deleteModal.current?.close(); setDeleteTarget(null); }}>取消</button>
            <button className="btn btn-sm btn-error" onClick={handleDelete}>删除</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
}
