<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="68HUB — OpenCode Go Usage Dashboard">
</p>

<p align="center">
  <a href="./README.md"><img src="./assets/readme/lang-en.svg" width="100%" alt="Switch to 中文"></a>
</p>

---

<p align="center">
  <img src="./assets/readme/section-preview.svg" width="100%" alt="Screenshots">
</p>

| Page | Preview |
|------|---------|
| 📊 **Usage Dashboard** | ![Dashboard](Preview%20Photo/1.png) |
| 📈 **Token Stats** | ![Token Stats](Preview%20Photo/2.png) |
| 📅 **Daily Trends** | ![Daily Trends](Preview%20Photo/3.png) |
| ⚙️ **Settings** | ![Settings](Preview%20Photo/5.png) |

<p align="center">
  <img src="./assets/readme/section-features.svg" width="100%" alt="Features">
</p>

| Module | Description |
|--------|-------------|
| 📊 **Dashboard** | Account count, remaining quota, total token consumption at a glance; quota progress bars (5h/7d/30d) on the left, Top 3 model Input/Output donut chart on the right |
| 📈 **Token Stats** | Model token consumption ranking (stacked bar chart) + daily trends per model (multi-series line chart), filterable by account and time range |
| 📅 **Daily Trends** | Daily cost and request volume line charts, filterable by account and time range |
| 📋 **Usage Records** | Complete usage record log with pagination and account filtering |
| ⚙️ **Settings** | Multi-account management (add/test/sync/backfill/delete), auto-sync toggle and interval setting |
| ℹ️ **About** | Contact info and tech stack |

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
  <img src="./assets/readme/section-accounts.svg" width="100%" alt="Multi-Account Support">
</p>

- **Quota**: Each account independently displays 5h/7d/30d progress bars
- **Charts**: All account data aggregated, filterable by account
- **Control**: Each account can be individually enabled/disabled

<p align="center">
  <img src="./assets/readme/section-tech.svg" width="100%" alt="Tech Stack">
</p>

| Frontend | Backend | Tools |
|----------|---------|-------|
| Electron 31 | Hono + better-sqlite3 | electron-builder |
| React 18 | TypeScript | Windows x64 |
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

Output: `release\68HUB Setup 1.1.1.exe`

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
