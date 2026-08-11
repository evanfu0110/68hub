<p align="center">
  <img src="./assets/readme/hero.svg" width="88%" alt="68HUB — OpenCode Go 用量统计面板">
</p>

<p align="center">
  <a href="./README_en.md">🌐 English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/evanfu0110/68hub?style=flat-square&label=Stars&color=4B6BFB" alt="GitHub Stars">
  <img src="https://img.shields.io/github/v/release/evanfu0110/68hub?style=flat-square&label=Release&color=2E9E6B" alt="Latest Release">
  <img src="https://img.shields.io/github/license/evanfu0110/68hub?style=flat-square&label=License&color=E85642" alt="License">
  <img src="https://img.shields.io/badge/Platform-Windows%20%C2%B7%20macOS-64748B?style=flat-square" alt="Platform">
</p>

**68HUB** 是一款基于 Electron 的 OpenCode Go 用量统计面板：多账户配额、Token 消耗、每日趋势、使用记录一目了然，数据全部保存在本地。

---

<p align="center">
  <img src="./assets/readme/section-derived.svg" width="100%" alt="衍生项目 Derived Projects">
</p>

社区基于 68HUB 二次开发的项目（按创建时间排列）：

| 项目 | 平台 | 说明 |
|------|------|------|
| [OCGoQuota](https://github.com/h6161236-spec/OCGoQuota) | 📱 Android | Tauri 2 + Rust 本地核心，Cookie 加密存储，触摸下拉刷新，数据不依赖云端服务 |
| [OpenCodeBoard](https://github.com/KDB-Wind/opencodeboard) | 🖥️ Windows | 个人使用向分支，升级 Electron 43，Token 统计支持模型筛选，独立打包发版 |
| [68HUB 安卓端](https://github.com/moondrop12138/opencode-plan-manager) | 📱 Android | React Native + Expo 移植，UI 与功能对齐桌面端，Auth Cookie KeyStore 加密存储 |

感谢所有二次开发作者的贡献，也欢迎基于 MIT 协议继续衍生你的版本。

---

<p align="center">
  <img src="./assets/readme/section-preview.svg" width="100%" alt="预览 Screenshots">
</p>

| 页面 | 截图 |
|------|------|
| 📊 **用量总览** | ![Dashboard](Preview%20Photo/1.png) |
| 📈 **Token 统计** | ![Token Stats](Preview%20Photo/2.png) |
| 📅 **每日趋势** | ![Daily Trends](Preview%20Photo/3.png) |
| ⚙️ **设置** | ![Settings](Preview%20Photo/5.png) |

<p align="center">
  <img src="./assets/readme/section-features.svg" width="100%" alt="功能 Features">
</p>

| 模块 | 说明 |
|------|------|
| 📊 **用量总览** | 账户数量、剩余配额、总 Token 消耗和今日 Token 使用量一目了然；左侧 5h/7d/30d 配额进度条，右侧 Top 3 模型 Input/Output 环形图与时间切换 |
| 📈 **Token 统计** | 模型 Token 消耗对数比例柱状图与用量趋势，输入/输出柱间距自适应；支持账户和时间范围筛选，默认近 30 天且选择会自动保存 |
| 📅 **每日趋势** | 按日期查看各模型输入、输出、缓存 Token 与缓存率，支持账户筛选 |
| 📋 **使用记录** | 完整的使用记录日志，支持分页和账户筛选 |
| ⚙️ **设置** | 多账户管理（新增/测试/同步/回填/删除），自动同步开关与间隔设置；后端端口冲突时自动切换可用端口 |
| ℹ️ **关于** | 联系方式与技术栈 |

<p align="center">
  <img src="./assets/readme/section-accounts.svg" width="100%" alt="多账户支持 Multi-Account Support">
</p>

- **配额**：每个账户独立显示 5h/7d/30d 进度条
- **图表**：所有账户数据汇总展示，可按账户筛选
- **控制**：每个账户可独立启用/禁用

<p align="center">
  <img src="./assets/readme/section-quickstart.svg" width="100%" alt="快速开始 Quick Start">
</p>

```bash
# 安装依赖
pnpm install

# 开发模式（自动启动后端 + Vite + Electron）
pnpm dev

# 仅启动前端 Vite（需后端或 Mock）
pnpm dev:vite
```

> 内嵌后端（Hono + better-sqlite3）随 Electron 主进程自动启动，无需单独运行 Python 服务。

<p align="center">
  <img src="./assets/readme/section-tech.svg" width="100%" alt="技术栈 Tech Stack">
</p>

| 前端 | 后端 | 工具 |
|------|------|------|
| Electron 31 | Hono + better-sqlite3 | electron-builder |
| React 18 | TypeScript | Windows · macOS |
| Vite 5 + Tailwind 4 | zod | |
| daisyUI 5 + Recharts | fetch (Node) | |

<p align="center">
  <img src="./assets/readme/section-structure.svg" width="100%" alt="项目结构 Project Structure">
</p>

```
68HUB/
├── electron/
│   ├── main.ts            # Electron 主进程 + 内嵌后端启动
│   ├── preload.ts         # IPC 桥接
│   └── backend/           # Node 后端（Hono + better-sqlite3）
│       ├── server.ts      # HTTP 服务生命周期 + 自动同步
│       ├── routes.ts      # 全部 API 路由
│       ├── db.ts          # SQLite CRUD
│       ├── config.ts      # 配置/脱敏
│       ├── quota.ts       # OpenCode 配额获取
│       ├── ollama-quota.ts # Ollama 配额获取
│       ├── opencode-usage.ts # 用量记录获取
│       ├── usage-sync.ts  # 增量/回填同步
│       ├── analytics.ts   # 总览聚合
│       └── ...
├── src/                   # React 前端（api / components / pages / hooks）
├── public/                # 静态资源
└── build/                 # 图标（自动生成）
```

<p align="center">
  <img src="./assets/readme/section-build.svg" width="100%" alt="构建 Build">
</p>

```bash
pnpm dist
```

输出：`release\68HUB Setup <version>.exe`

<p align="center">
  <img src="./assets/readme/section-thanks.svg" width="100%" alt="致谢 Acknowledgments">
</p>

- [QuotaHub](https://github.com/lvmiao233/QuotaHub) — 后端架构灵感
- [OpenCode](https://opencode.ai) — API 提供商

<p align="center">
  <img src="./assets/readme/section-contact.svg" width="100%" alt="联系 Contact">
</p>

- 邮箱：1771005798@qq.com
- Telegram：[@Z6ix8ightBot](https://t.me/Z6ix8ightBot)
- 网站：[www.110.wtf](https://www.110.wtf)

<p align="center">
  <img src="./assets/readme/section-license.svg" width="100%" alt="License MIT">
</p>

[MIT](LICENSE) © 68HUB
