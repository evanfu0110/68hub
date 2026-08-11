<p align="center">
  <img src="./assets/readme/hero.svg" width="88%" alt="68HUB — OpenCode Go Usage Dashboard">
</p>

<p align="center">
  <a href="./README.md">🌐 中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/evanfu0110/68hub?style=flat-square&label=Stars&color=4B6BFB" alt="GitHub Stars">
  <img src="https://img.shields.io/github/v/release/evanfu0110/68hub?style=flat-square&label=Release&color=2E9E6B" alt="Latest Release">
  <img src="https://img.shields.io/github/license/evanfu0110/68hub?style=flat-square&label=License&color=E85642" alt="License">
  <img src="https://img.shields.io/badge/Platform-Windows%20%C2%B7%20macOS-64748B?style=flat-square" alt="Platform">
</p>

**68HUB** is an Electron-based dashboard for OpenCode Go usage: multi-account quotas, token consumption, daily trends and usage records at a glance — all data stays on your machine.

---

<p align="center">
  <img src="./assets/readme/section-derived.svg" width="100%" alt="Derived Projects">
</p>

Community projects forked from 68HUB (ordered by creation date):

| Project | Platform | Highlights |
|---------|----------|------------|
| [68HUB Web Server Edition](https://github.com/1chenmm/opencode-go-usage) | 🌐 Web | Electron-free web deployment, Hono + better-sqlite3 backend, Docker / systemd one-click deploy, browser access |
| [OCGoQuota](https://github.com/h6161236-spec/OCGoQuota) | 📱 Android | Tauri 2 + Rust local core, encrypted cookie storage, pull-to-refresh, no cloud dependency |
| [OpenCodeQME](https://github.com/MOSSVENC/OpenCodeQME) | 🧩 Chrome / Edge | Standalone MV3 browser extension, toolbar popup + full detail page, IndexedDB local history, bilingual UI |
| [OpenCodeBoard](https://github.com/KDB-Wind/opencodeboard) | 🖥️ Windows | Personal-use branch, upgraded to Electron 43, model filtering in token stats, independent releases |
| [68HUB Android](https://github.com/moondrop12138/opencode-plan-manager) | 📱 Android | React Native + Expo port, UI and features aligned with the desktop app, auth cookie encrypted via KeyStore |

Thanks to every contributor who forked and improved this project. Feel free to build your own under the MIT license.

---

<p align="center">
  <img src="./assets/readme/section-preview.svg" width="100%" alt="Screenshots">
</p>

| Page | Preview |
|------|---------|
| 📊 **Dashboard** | ![Dashboard](Preview%20Photo/1.png) |
| 📈 **Token Stats** | ![Token Stats](Preview%20Photo/2.png) |
| 📅 **Daily Trends** | ![Daily Trends](Preview%20Photo/3.png) |
| ⚙️ **Settings** | ![Settings](Preview%20Photo/5.png) |

<p align="center">
  <img src="./assets/readme/section-features.svg" width="100%" alt="Features">
</p>

| Module | Description |
|--------|-------------|
| 📊 **Dashboard** | Account count, remaining quota, total and today's token consumption at a glance; quota progress bars (5h/7d/30d) on the left, Top 3 model Input/Output donut chart with period switching on the right |
| 📈 **Token Stats** | Log-scale model token consumption chart and usage trends with adaptive input/output bar spacing; filterable by account and time range, defaulting to the last 30 days with the selection persisted |
| 📅 **Daily Trends** | Browse daily input, output, cache tokens and cache rate by model, with account filtering |
| 📋 **Usage Records** | Complete usage record log with pagination and account filtering |
| ⚙️ **Settings** | Multi-account management (add/test/sync/backfill/delete), auto-sync toggle and interval setting; automatically switches to an available backend port when needed |
| ℹ️ **About** | Contact info and tech stack |

<p align="center">
  <img src="./assets/readme/section-accounts.svg" width="100%" alt="Multi-Account Support">
</p>

- **Quota**: Each account independently displays 5h/7d/30d progress bars
- **Charts**: All account data aggregated, filterable by account
- **Control**: Each account can be individually enabled/disabled

<p align="center">
  <img src="./assets/readme/section-quickstart.svg" width="100%" alt="Quick Start">
</p>

```bash
# Install dependencies
pnpm install

# Run in dev mode (auto-starts backend + Vite + Electron)
pnpm dev

# Start Vite frontend only (requires backend or mock)
pnpm dev:vite
```

> The embedded backend starts automatically with the Electron main process (Hono + better-sqlite3), no need to start a separate Python service.

<p align="center">
  <img src="./assets/readme/section-tech.svg" width="100%" alt="Tech Stack">
</p>

| Frontend | Backend | Tools |
|----------|---------|-------|
| Electron 31 | Hono + better-sqlite3 | electron-builder |
| React 18 | TypeScript | Windows · macOS |
| Vite 5 + Tailwind 4 | zod | |
| daisyUI 5 + Recharts | fetch (Node) | |

<p align="center">
  <img src="./assets/readme/section-structure.svg" width="100%" alt="Project Structure">
</p>

```
68HUB/
├── electron/
│   ├── main.ts            # Electron main process + embedded backend startup
│   ├── preload.ts         # IPC bridge
│   └── backend/           # Node backend (Hono + better-sqlite3)
│       ├── server.ts      # HTTP server lifecycle + auto-sync
│       ├── routes.ts      # All API routes
│       ├── db.ts          # SQLite CRUD
│       ├── config.ts      # Config/masking
│       ├── quota.ts       # OpenCode quota fetcher
│       ├── ollama-quota.ts # Ollama quota fetcher
│       ├── opencode-usage.ts # Usage record fetcher
│       ├── usage-sync.ts  # Incremental/backfill sync
│       ├── analytics.ts   # Dashboard aggregation
│       └── ...
├── src/                   # React frontend (api / components / pages / hooks)
├── public/                # Static assets
└── build/                 # Icons (auto-generated)
```

<p align="center">
  <img src="./assets/readme/section-build.svg" width="100%" alt="Build">
</p>

```bash
pnpm dist
```

Output: `release\68HUB Setup <version>.exe`

<p align="center">
  <img src="./assets/readme/section-thanks.svg" width="100%" alt="Acknowledgments">
</p>

- [QuotaHub](https://github.com/lvmiao233/QuotaHub) — Backend architecture inspiration
- [OpenCode](https://opencode.ai) — API provider

<p align="center">
  <img src="./assets/readme/section-contact.svg" width="100%" alt="Contact">
</p>

- Email: 1771005798@qq.com
- Telegram: [@Z6ix8ightBot](https://t.me/Z6ix8ightBot)
- Website: [www.110.wtf](https://www.110.wtf)

<p align="center">
  <img src="./assets/readme/section-license.svg" width="100%" alt="License MIT">
</p>

[MIT](LICENSE) © 68HUB
