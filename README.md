<p align="center">
  <picture>
    <img src="public/logo.svg" width="80" alt="68HUB" />
  </picture>
  <h1 align="center">68HUB</h1>
  <p align="center">OpenCode Go 平价 Coding Plan 用量统计桌面应用</p>
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
    <img src="https://img.shields.io/badge/下载-v1.1.0-4FC08D?logo=download&style=for-the-badge" />
  </a>
</p>

## 截图

| 页面 | 预览 |
|------|------|
| 1. 用量统计总览 | ![总览](Preview%20Photo/1.png) |
| 2. Token 统计 | ![Token 统计](Preview%20Photo/2.png) |
| 3. 每日趋势 | ![每日趋势](Preview%20Photo/3.png) |
| 5. 设置 | ![设置](Preview%20Photo/5.png) |

## 功能

| 模块 | 说明 |
|------|------|
| 📊 **用量总览** | 账户数、剩余配额、总 Token 消耗一目了然；左侧配额进度条（5h/7d/30d），右侧 Top 3 模型 Input/Output 圆环占比 |
| 📈 **Token 统计** | 各模型 Token 消耗排行（堆叠柱状图）+ 每日各模型趋势（多系列折线图），支持按账户和时间筛选 |
| 📅 **每日趋势** | 每日费用与请求量变化折线图，支持按账户和时间筛选 |
| 📋 **使用记录** | 完整使用记录日志，支持分页和按账户筛选 |
| ⚙️ **设置** | 多账户管理（添加/测试/同步/回填/删除），自动同步开关与间隔设置 |
| ℹ️ **关于** | 联系方式与技术栈 |

## 快速开始

```bash
# 安装依赖
pnpm install

# 以开发者模式运行（自动启动后端 + Vite + Electron）
pnpm dev

# 单独启动 Vite 前端（需先拉起后端或 mock）
pnpm dev:vite
```

> 内嵌后端随 Electron 主进程自动启动（Hono + better-sqlite3），无需单独启动 Python 服务。

## 打包

```bash
pnpm dist
```

产物：`release\68HUB Setup 1.1.0.exe`

## 技术栈

| 前端 | 后端 | 工具 |
|------|------|------|
| Electron 31 | Hono + better-sqlite3 | electron-builder |
| React 18 | TypeScript | Windows x64 |
| Vite 5 + Tailwind 4 | zod | |
| daisyUI 5 + Recharts | fetch (Node) | |

## 项目结构

```
68HUB/
├── electron/
│   ├── main.ts            # Electron 主进程 + 内嵌后端启动
│   ├── preload.ts         # IPC 桥接
│   └── backend/           # Node 后端 (Hono + better-sqlite3)
│       ├── server.ts      # HTTP 服务生命周期 + auto-sync
│       ├── routes.ts      # 全部 API 路由
│       ├── db.ts          # SQLite CRUD
│       ├── config.ts      # 配置/脱敏
│       ├── quota.ts       # OpenCode 额度爬虫
│       ├── ollama-quota.ts # Ollama 额度爬虫
│       ├── opencode-usage.ts # 用量记录爬虫
│       ├── usage-sync.ts  # 增量/回填同步
│       ├── analytics.ts   # 概览聚合
│       └── ...
├── src/                   # React 前端 (api / components / pages / hooks)
├── public/                # 静态资源
└── build/                 # 图标 (自动生成)
```

## 多账户支持

- **配额**：每个账户独立展示 5h/7d/30d 进度条
- **图表**：所有账户数据汇总，可按账户过滤
- **控制**：每个账户单独启用/禁用

## 致谢

- [QuotaHub](https://github.com/lvmiao233/QuotaHub) — 后端架构灵感来源
- [OpenCode](https://opencode.ai) — 提供 API

## 联系方式

- Email：1771005798@qq.com
- Telegram：[@Z6ix8ightBot](https://t.me/Z6ix8ightBot)
- 网站：[www.110.wtf](https://www.110.wtf)
