import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { AppSettings, OpenCodeAccount, SyncProgress } from '../api/types';
import { usePolling } from '../hooks/usePolling';
import { useTheme } from '../components/ThemeProvider';
import { useToast } from '../components/Toast';

const emptyForm = { name: '', auth_cookie: '', workspace_id: 'Default' };

export function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const addModal = useRef<HTMLDialogElement>(null);
  const deleteModal = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OpenCodeAccount | null>(null);
  const [syncing, setSyncing] = useState<Record<string, SyncProgress>>({});
  const [settings, setSettings] = useState<AppSettings>({ theme: 'system', language: 'system' });

  const { data: accounts, refetch } = usePolling(() => api.listOpenCodeAccounts(), 60_000);

  useEffect(() => {
    api.getSettings().then((value) => setSettings(value)).catch(() => {});
  }, []);

  const guideKey = useMemo(() => 'settings.cookieGuide.android', []);

  const savePreferences = async (next: Partial<AppSettings>) => {
    const updated = await api.updateSettings(next);
    setSettings(updated);
  };

  const changeTheme = async (value: AppSettings['theme']) => {
    setTheme(value);
    setSettings((current) => ({ ...current, theme: value }));
    try {
      await savePreferences({ theme: value });
    } catch (error) {
      toast(t('settings.toastUpdateFailed', { msg: (error as Error).message }), 'error');
    }
  };

  const changeLanguage = async (value: AppSettings['language']) => {
    const resolved = value === 'system'
      ? (navigator.language.startsWith('zh') ? 'zh' : 'en')
      : value;
    if (value === 'system') localStorage.removeItem('68hub-language');
    await i18n.changeLanguage(resolved);
    setSettings((current) => ({ ...current, language: value }));
    try {
      await savePreferences({ language: value });
    } catch (error) {
      toast(t('settings.toastUpdateFailed', { msg: (error as Error).message }), 'error');
    }
  };

  const addAccount = async () => {
    if (!form.name.trim() || !form.auth_cookie.trim()) return;
    setSaving(true);
    try {
      await api.createOpenCodeAccount(form);
      setForm(emptyForm);
      addModal.current?.close();
      await refetch();
      toast(t('settings.toastAccountAdded'), 'success');
    } catch (error) {
      toast(t('settings.toastAddFailed', { msg: (error as Error).message }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const syncAccount = async (account: OpenCodeAccount) => {
    setSyncing((current) => ({
      ...current,
      [account.id]: { status: 'running', current: 0, total: 0, inserted: 0, error: null },
    }));
    const timer = window.setInterval(async () => {
      try {
        const progress = await api.syncProgress(account.id);
        setSyncing((current) => ({ ...current, [account.id]: progress }));
      } catch {
        // The command result below owns the final error state.
      }
    }, 500);
    try {
      const result = await api.syncUsage(account.id);
      setSyncing((current) => ({
        ...current,
        [account.id]: {
          status: 'done',
          current: result.pages_fetched,
          total: result.pages_fetched,
          inserted: result.inserted,
          error: null,
        },
      }));
      toast(t('settings.toastSyncComplete', { count: result.inserted }), 'success');
    } catch (error) {
      setSyncing((current) => ({
        ...current,
        [account.id]: {
          status: 'error', current: current[account.id]?.current || 0, total: 0,
          inserted: current[account.id]?.inserted || 0, error: (error as Error).message,
        },
      }));
      toast(t('settings.toastSyncFailed'), 'error');
    } finally {
      window.clearInterval(timer);
      await refetch();
    }
  };

  const testAccount = async (account: OpenCodeAccount) => {
    try {
      const result = await api.testOpenCodeAccount(account.id);
      if (result.success) {
        toast(t('settings.toastTestSuccess', { id: result.workspace_id }), 'success');
        await refetch();
      } else {
        toast(t('settings.toastTestFailed', { msg: result.error }), 'error');
      }
    } catch (error) {
      toast(t('settings.toastTestFailed', { msg: (error as Error).message }), 'error');
    }
  };

  const toggleAccount = async (account: OpenCodeAccount) => {
    try {
      await api.updateOpenCodeAccount(account.id, { enabled: !account.enabled });
      await refetch();
    } catch (error) {
      toast(t('settings.toastUpdateFailed', { msg: (error as Error).message }), 'error');
    }
  };

  const removeAccount = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteOpenCodeAccount(deleteTarget.id);
      deleteModal.current?.close();
      setDeleteTarget(null);
      await refetch();
      toast(t('settings.toastDeleted'), 'success');
    } catch (error) {
      toast(t('settings.toastDeleteFailed', { msg: (error as Error).message }), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-lg font-bold">{t('settings.title')}</h1>
        <p className="text-xs text-base-content/45 mt-1">{t('settings.subtitle')}</p>
      </header>

      <section className="settings-section">
        <div>
          <h2 className="settings-heading">{t('settings.appearance')}</h2>
          <p className="settings-description">{t('settings.themeDesc')}</p>
        </div>
        <div className="segmented-control">
          {(['light', 'dark', 'system'] as const).map((value) => (
            <button
              key={value}
              className={theme === value ? 'active' : ''}
              onClick={() => changeTheme(value)}
            >
              {t(`settings.${value}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div>
          <h2 className="settings-heading">{t('settings.language')}</h2>
          <p className="settings-description">{t('settings.languageDesc')}</p>
        </div>
        <select
          className="select select-bordered select-sm w-full sm:w-44"
          value={settings.language}
          onChange={(event) => changeLanguage(event.target.value as AppSettings['language'])}
        >
          <option value="system">{t('settings.languageAuto')}</option>
          <option value="zh">{t('settings.zh')}</option>
          <option value="en">{t('settings.en')}</option>
        </select>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="settings-heading">{t('settings.accounts')}</h2>
            <p className="settings-description">{t('settings.localSecretDesc')}</p>
          </div>
          <button className="btn btn-primary btn-sm shrink-0" onClick={() => addModal.current?.showModal()}>
            {t('settings.addAccount')}
          </button>
        </div>

        {(accounts ?? []).length === 0 ? (
          <div className="empty-surface">{t('settings.noAccounts')}</div>
        ) : (
          <div className="divide-y divide-base-200 border border-base-200 rounded-xl overflow-hidden">
            {(accounts ?? []).map((account) => {
              const progress = syncing[account.id];
              const running = progress?.status === 'running';
              return (
                <article key={account.id} className="account-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{account.name}</span>
                      <span className={`status-dot ${account.enabled ? 'enabled' : ''}`} />
                    </div>
                    <p className="text-[11px] text-base-content/40 mt-1 truncate">
                      {account.resolved_workspace_id || account.workspace_id} · {account.auth_cookie_masked}
                    </p>
                    {progress && progress.status !== 'idle' && (
                      <p className={`text-[11px] mt-1 ${progress.status === 'error' ? 'text-error' : 'text-primary'}`}>
                        {progress.status === 'running'
                          ? t('settings.syncProgress', { pages: progress.current, count: progress.inserted })
                          : progress.status === 'done'
                            ? t('settings.syncDone', { count: progress.inserted })
                            : progress.error}
                      </p>
                    )}
                  </div>
                  <div className="account-actions">
                    <button className="btn btn-ghost btn-xs" onClick={() => toggleAccount(account)}>
                      {account.enabled ? t('settings.enabled') : t('settings.disabled')}
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => testAccount(account)}>
                      {t('settings.test')}
                    </button>
                    <button className="btn btn-primary btn-xs" disabled={running} onClick={() => syncAccount(account)}>
                      {running ? <span className="loading loading-spinner loading-xs" /> : t('settings.sync')}
                    </button>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => { setDeleteTarget(account); deleteModal.current?.showModal(); }}
                    >
                      {t('settings.delete')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <details className="border border-base-200 rounded-xl px-4 py-3 group">
        <summary className="cursor-pointer text-sm font-semibold">{t('settings.cookieGuide.title')}</summary>
        <div className="text-xs text-base-content/55 leading-6 mt-3 whitespace-pre-line">
          {t(guideKey)}
        </div>
      </details>

      <dialog ref={addModal} className="modal">
        <div className="modal-box max-w-md">
          <h3 className="font-semibold text-base mb-1">{t('settings.addAccountDialog')}</h3>
          <p className="text-xs text-base-content/45 mb-5">{t('settings.localSecretDesc')}</p>
          <div className="space-y-4">
            <label className="form-control">
              <span className="label-text text-xs mb-1">{t('settings.name')}</span>
              <input className="input-native" value={form.name} placeholder={t('settings.namePlaceholder')}
                onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs mb-1">{t('settings.workspaceId')}</span>
              <input className="input-native" value={form.workspace_id} placeholder="Default"
                onChange={(event) => setForm({ ...form, workspace_id: event.target.value })} />
            </label>
            <label className="form-control">
              <span className="label-text text-xs mb-1">{t('settings.authCookie')}</span>
              <textarea className="textarea textarea-bordered min-h-24 text-xs font-mono" value={form.auth_cookie}
                placeholder={t('settings.cookiePlaceholder')}
                onChange={(event) => setForm({ ...form, auth_cookie: event.target.value })} />
            </label>
          </div>
          <div className="modal-action">
            <button className="btn btn-sm" onClick={() => addModal.current?.close()}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm" disabled={saving || !form.name.trim() || !form.auth_cookie.trim()} onClick={addAccount}>
              {saving ? <span className="loading loading-spinner loading-xs" /> : t('common.save')}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button>close</button></form>
      </dialog>

      <dialog ref={deleteModal} className="modal">
        <div className="modal-box max-w-sm">
          <h3 className="font-semibold">{t('settings.confirmDelete')}</h3>
          <p className="text-sm text-base-content/55 mt-2">
            {t('settings.confirmDeleteMsg', { name: deleteTarget?.name })}
          </p>
          <div className="modal-action">
            <button className="btn btn-sm" onClick={() => deleteModal.current?.close()}>{t('common.cancel')}</button>
            <button className="btn btn-error btn-sm" onClick={removeAccount}>{t('common.delete')}</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button>close</button></form>
      </dialog>
    </div>
  );
}
