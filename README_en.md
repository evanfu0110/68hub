<p align="center">
  <picture>
    <img src="public/logo.svg" width="80" alt="68HUB" />
  </picture>
  <h1 align="center">68HUB</h1>
  <p align="center">OpenCode Go Usage Dashboard for Affordable Coding Plans</p>
  <p align="center"><a href="README.md">中文</a></p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/daisyUI-5A0EF8?logo=daisyui&logoColor=white" />
  <img src="https://img.shields.io/badge/Recharts-22B5BF?logo=recharts&logoColor=white" />
  <br/>
  <img src="https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/Windows-0078D4?logo=windows&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
</p>

<p align="center">
  <a href="https://github.com/evanfu0110/68hub/releases">
    <img src="https://img.shields.io/badge/Download-v1.1.1-4FC08D?logo=download&style=for-the-badge" />
  </a>
</p>

## Screenshots

| Page | Preview |
|------|---------|
| 1. Usage Dashboard | ![Dashboard](Preview%20Photo/1.png) |
| 2. Token Stats | ![Token Stats](Preview%20Photo/2.png) |
| 3. Daily Trends | ![Daily Trends](Preview%20Photo/3.png) |
| 5. Settings | ![Settings](Preview%20Photo/5.png) |

## Features

| Module | Description |
|--------|-------------|
| 📊 **Dashboard** | Account count, remaining quota, total token consumption at a glance; quota progress bars (5h/7d/30d) on the left, Top 3 model Input/Output donut chart on the right |
| 📈 **Token Stats** | Model token consumption ranking (stacked bar chart) + daily trends per model (multi-series line chart), filterable by account and time range |
| 📅 **Daily Trends** | Daily cost and request volume line charts, filterable by account and time range |
| 📋 **Usage Records** | Complete usage record log with pagination and account filtering |
| ⚙️ **Settings** | Multi-account management (add/test/sync/backfill/delete), auto-sync toggle and interval setting |
| ℹ️ **About** | Contact info and tech stack |

## Quick Start

```bash
# Install dependencies
pnpm install

# Run in dev mode (auto-starts backend + Vite + Electron)
pnpm dev

# Start Vite frontend only (requires backend or mock)
pnpm dev:vite
```

> The embedded backend starts automatically with the Electron main process (Hono + better-sqlite3), no need to start a separate Python service.

## Build

```bash
pnpm dist
```

Output: `release\68HUB Setup 1.1.1.exe`

## Tech Stack

| Frontend | Backend | Tools |
|----------|---------|-------|
| Electron 31 | Hono + better-sqlite3 | electron-builder |
| React 18 | TypeScript | Windows x64 |
| Vite 5 + Tailwind 4 | zod | |
| daisyUI 5 + Recharts | fetch (Node) | |

## Project Structure

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

## Multi-Account Support

- **Quota**: Each account independently displays 5h/7d/30d progress bars
- **Charts**: All account data aggregated, filterable by account
- **Control**: Each account can be individually enabled/disabled

## Acknowledgments

- [QuotaHub](https://github.com/lvmiao233/QuotaHub) — Backend architecture inspiration
- [OpenCode](https://opencode.ai) — API provider

## Contact

- Email：1771005798@qq.com
- Telegram：[@Z6ix8ightBot](https://t.me/Z6ix8ightBot)
- Website：[www.110.wtf](https://www.110.wtf)
