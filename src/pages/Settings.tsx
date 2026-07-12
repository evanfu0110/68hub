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
  const [backfillPages, setBackfillPages] = useState(30);
  const [deleteTarget, setDeleteTarget] = useState<OpenCodeAccount | null>(null);
  const addModal = useRef<HTMLDialogElement>(null);
  const deleteModal = useRef<HTMLDialogElement>(null);

  const accounts = config?.opencode_accounts ?? [];
  const usageSync = config?.usage_sync;

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
          backfill_pages_per_request: backfillPages,
        },
      });
      toast('同步设置已保存', 'success');
      refetch();
    } catch (e) {
      toast('保存失败: ' + (e as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-base-content">设置</h1>
        <p className="text-sm text-base-content/60 mt-1">管理 OpenCode Go 账户和同步设置</p>
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
        <h2 className="text-sm font-bold text-base-content/70 mb-3">自动同步</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-base-content/60">自动同步</span>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-base-content/60">同步间隔</span>
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-base-content/60">回填页数</span>
            <select
              className="select select-bordered select-sm w-28"
              value={backfillPages}
              onChange={(e) => setBackfillPages(Number(e.target.value))}
            >
              <option value={10}>10 页</option>
              <option value={30}>30 页</option>
              <option value={50}>50 页</option>
              <option value={100}>100 页</option>
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={saveSyncSettings}>
            保存同步设置
          </button>
          {usageSync && (
            <div className="text-[11px] text-base-content/40 space-y-0.5 pt-2 border-t border-base-200">
              <p>当前状态: {usageSync.auto_sync ? '运行中' : '已停止'}</p>
              <p>当前间隔: {usageSync.interval_sec} 秒</p>
              <p>总记录数: {usageSync.max_pages_per_incremental} 页/次</p>
            </div>
          )}
        </div>
      </div>

      <div className="border border-base-200 rounded-xl p-4">
        <h2 className="text-sm font-bold text-base-content/70 mb-3">多账户支持说明</h2>
        <div className="text-sm text-base-content/60 leading-relaxed space-y-2">
          <p>68HUB 支持添加多个 OpenCode Go 账户，每个账户独立管理自己的 Cookie 和 Workspace。</p>
          <p><span className="font-semibold text-base-content">配额展示：</span>主页左侧的「账户配额状态」卡片会列出所有已启用账户的配额进度条，每个账户独立显示 5h / 7d / 30d 三个时间窗口的占用比例。</p>
          <p><span className="font-semibold text-base-content">Token 统计：</span>所有账户的使用记录汇总到同一数据库，图表和排行展示的是跨账户的合并数据。你可以在「使用记录」页按账户筛选查看明细。</p>
          <p><span className="font-semibold text-base-content">独立控制：</span>每个账户可以单独启用/禁用，禁用的账户不会拉取配额和同步使用记录。</p>
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
