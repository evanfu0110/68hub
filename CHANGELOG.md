# 68HUB Changelog

## v2.0.0

### Android sync crash + Android 9 support

- Fixed Android sync/test/dashboard crash: reqwest's rustls-platform-verifier panics without JNI init; Android now uses Mozilla webpki-roots for HTTPS.
- Lowered Android `minSdkVersion` from 29 (Android 10) to 28 (Android 9) for LDPlayer and other API 28 devices.
- For x86/x86_64 emulators, build with `--target x86_64` (or universal) instead of arm64-only.

### Android save-account crash fix

- Android no longer writes cookies through Android Keystore on save; cookies are encrypted into the app private data dir instead.
- Android SQLite uses DELETE journal mode instead of WAL for better OEM compatibility.
- Windows still uses Windows Credential Manager.

### Windows + Android 本地应用 | Windows + Android local app

- 使用 Tauri 2 + React + Rust + SQLite 重构，支持 Windows x64 和 Android arm64。
- 所有账号、Cookie 和历史用量只保存在当前设备；不需要云端后台、本机 HTTP 服务或固定端口。
- Cookie 在 Windows Credential Manager 保存；Android 使用应用私有目录加密存储；SQLite 只保存凭证 ID。
- 新增统一 `HubClient`、结构化错误、Rust/TypeScript 自动生成 DTO 和 CI 漂移校验。
- 新增可续传的完整同步、单账号并发保护、批次提交和退出/Android 后台取消。
- Windows 跟随系统代理及 PAC，Android 直连。
- 新增移动端安全区、底部导航、单列卡片和窄屏记录卡片布局。
- 2.0 使用独立数据库和应用标识，不迁移 Electron 1.x 数据，可与旧版并存。
- 首版只支持 OpenCode，不包含 Ollama、托盘、后台定时同步、手动代理、自定义 CA、商店发布或自动更新。

- Rebuilt with Tauri 2, React, Rust, and SQLite for Windows x64 and Android arm64.
- Accounts, cookies, and history remain on-device with no cloud backend or localhost service.
- Added OS credential storage, resumable sync, generated DTOs, structured errors, responsive mobile UI, system proxy/PAC support on desktop, and signed CI artifacts with SHA-256 checksums.

## v1.1.1

### 更新内容 | What's New

- 🌐 **系统代理支持**：OpenCode/Ollama 请求默认跟随系统和浏览器代理，支持 PAC；也可选择环境变量、手动代理或直连
  System proxy support: OpenCode/Ollama requests follow the OS/browser proxy and PAC by default, with environment, manual, and direct modes available
- 📚 **历史用量可靠性**：修复回填失败时跳页的问题，并让 Token 排名正确使用所选时间范围
  Historical usage reliability: Failed backfill pages are no longer skipped, and Token rankings now honor the selected time range
- 🟢 **Windows 绿色便携版**：默认产出单文件 `68HUB-Portable-*.exe`，双击即用、免安装；配置与数据保存在 exe 同目录 `data/`，可整体拷贝
  Windows portable build: ships a single `68HUB-Portable-*.exe` (double-click, no installer); settings/data stay in a sibling `data/` folder
- 🌐 **中英双语支持**：可在设置中切换中文/English，默认为跟随系统语言
  Bilingual UI: Switch between Chinese and English in Settings, defaults to system language
- 后端从 Python (FastAPI + PyInstaller) 迁移至 Node.js (Hono + better-sqlite3)，内嵌于 Electron 主进程
  Backend migrated from Python (FastAPI + PyInstaller) to Node.js (Hono + better-sqlite3), embedded in Electron main process
- 单进程单安装包，告别双进程打包
  Single-process single installer,告别 dual-process packaging
- **暗色模式**：支持浅色/深色/跟随系统三种主题（Forest 暗色主题）
  Dark mode: Light / Dark / System themes (Forest dark theme)
- **系统托盘**：关闭窗口时可最小化到托盘，后台继续同步
  System tray: Minimize to tray on close, sync continues in background
- **首次启动引导**：选择主题偏好与托盘行为
  First-run onboarding: Choose theme and tray behavior
- 设置页新增恢复默认设置按钮
  Settings page: Added "Reset to Defaults" button
- 支持 Grok 模型图标显示
  Grok model icon support
- 关闭弹窗改为应用内 Modal，与主题风格一致
  Close dialog replaced with in-app Modal, consistent with theme
- 修复与优化详见提交记录
  Bug fixes and optimizations — see commit history

### 功能 | Features

- 📊 **用量统计总览**：账户配额、Token 消耗一目了然
  Usage dashboard: Account quotas and token consumption at a glance
- 📈 **各模型 Token 消耗排行与每日趋势**
  Model token consumption ranking and daily trends
- 📅 **每日费用与请求量趋势分析**
  Daily cost and request volume trend analysis
- 📋 **完整使用记录查询与筛选**
  Complete usage record query and filtering
- ⚙️ **多账户管理与自动同步**
  Multi-account management and auto-sync
