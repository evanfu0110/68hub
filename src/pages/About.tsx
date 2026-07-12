function openLink(url: string) {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

export function About() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-bold">关于 68HUB</h1>
        <p className="text-xs text-base-content/40 mt-1">OpenCode Go 用量统计面板</p>
      </div>

      <div className="border border-base-200 rounded-xl p-4 space-y-3">
        <p className="text-sm text-base-content/70 leading-relaxed">
          68HUB 是一个专为 <span className="font-semibold text-base-content">OpenCode Go</span> 平价 Coding Plan 设计的本地用量统计桌面应用。
        </p>
        <p className="text-sm text-base-content/70 leading-relaxed">
          OpenCode AI 官方的用量页面数据分散、操作繁琐，难以直观掌握各模型的 Token 消耗和账户配额状态。
          68HUB 通过后端定时同步数据，以清晰的图表和布局展示关键指标，让你一目了然。
        </p>
      </div>

      <button className="btn btn-primary w-full" onClick={() => openLink('https://github.com/evanfu0110/68hub/releases')}>
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        下载最新版本
      </button>

      <div className="border border-base-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-base-content/70">功能</h2>
        <ul className="text-sm text-base-content/60 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">-</span>
            <span>多账户配额实时监控（5小时 / 7天 / 30天）</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">-</span>
            <span>各模型 Token 消耗排行与每日趋势</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">-</span>
            <span>详细使用记录查询与筛选</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">-</span>
            <span>自动同步数据，无需手动刷新</span>
          </li>
        </ul>
      </div>

      <div className="border border-base-200 rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-bold text-base-content/70">技术栈</h2>
        <div className="flex flex-wrap gap-2">
          {['Electron', 'React', 'TypeScript', 'Vite', 'Tailwind CSS', 'daisyUI', 'Recharts', 'FastAPI', 'SQLite'].map((t) => (
            <span key={t} className="text-xs px-2 py-1 rounded-md bg-base-200 text-base-content/60 font-medium">{t}</span>
          ))}
        </div>
      </div>

      <div className="border border-base-200 rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-bold text-base-content/70">致谢</h2>
        <p className="text-sm text-base-content/60 leading-relaxed">
          后端基于 <span className="text-primary cursor-pointer" onClick={() => openLink('https://github.com/lvmiao233/QuotaHub')}>QuotaHub</span> 的 FastAPI + SQLite 架构开发，感谢原作者的开源工作。
        </p>
      </div>

      <div className="border border-base-200 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-base-content/70">联系方式</h2>
        <div className="text-sm text-base-content/60 space-y-2">
          <div className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors" onClick={() => openLink('mailto:1771005798@qq.com')}>
            <svg className="size-4 text-base-content/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M22 7l-10 7L2 7" />
            </svg>
            <span>1771005798@qq.com</span>
          </div>
          <div className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors" onClick={() => openLink('https://t.me/Z6ix8ightBot')}>
            <svg className="size-4 text-base-content/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
            <span>TG @Z6ix8ightBot</span>
          </div>
          <div className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors" onClick={() => openLink('https://www.110.wtf')}>
            <svg className="size-4 text-base-content/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>www.110.wtf</span>
          </div>
        </div>
      </div>
    </div>
  );
}
