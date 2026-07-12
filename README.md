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
  <img src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/PyInstaller-1F7C2C?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Windows-0078D4?logo=windows&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
</p>

<p align="center">
  <a href="https://github.com/evanfu0110/68hub/releases">
    <img src="https://img.shields.io/badge/下载-v1.0.0-4FC08D?logo=download&style=for-the-badge" />
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
# 启动后端
cd cola/backend && uv run uvicorn app.main:app --port 8788

# 启动前端开发
pnpm dev:vite    # 浏览器预览 http://localhost:5173

# 或启动 Electron 窗口
pnpm dev
```

## 打包

```bash
pip install pyinstaller
scripts\build-backend.bat
pnpm dist
```

产物：`release\68HUB Setup 1.0.0.exe`

## 技术栈

| 前端 | 后端 | 工具 |
|------|------|------|
| Electron 31 | Python 3.11+ | electron-builder |
| React 18 | FastAPI | PyInstaller |
| TypeScript | SQLite | Windows x64 |
| Vite 5 + Tailwind 4 | httpx + uvicorn | |
| daisyUI 5 + Recharts | uv | |

## 项目结构

```
68HUB/
├── electron/           # Electron 主进程 (main.ts + preload.ts)
├── src/                # React 前端 (api / components / pages / hooks)
├── cola/backend/       # Python 后端 (FastAPI + SQLite)
├── public/             # 静态资源
├── scripts/            # 构建脚本
└── build/              # 图标 (自动生成)
```

## 多账户支持

- **配额**：每个账户独立展示 5h/7d/30d 进度条
- **图表**：所有账户数据汇总，可按账户过滤
- **控制**：每个账户单独启用/禁用

## 致谢

后端基于 [QuotaHub](https://github.com/lvmiao233/QuotaHub) 的 FastAPI + SQLite 架构开发，感谢原作者的开源工作。

## 联系方式

- Email：1771005798@qq.com
- Telegram：[@Z6ix8ightBot](https://t.me/Z6ix8ightBot)
- 网站：[www.110.wtf](https://www.110.wtf)
