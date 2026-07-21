# 68HUB Changelog

## v1.1.1

### 更新内容 | What's New

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
