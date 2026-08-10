# 68HUB Changelog

## v1.1.4

### 更新 / Updates

- 模型图标改用本地 `@lobehub/icons` 组件：支持品牌彩色（Color）与单色（Mono）显示，不再依赖 Simple Icons CDN 和 Google favicon 外网加载。
  Model icons now use local `@lobehub/icons` components with brand color (Color) and mono variants, removing Simple Icons CDN and Google favicon dependencies.

### 修复 / Fixes

- 修复用量费用显示偏低 10 倍的问题：OpenCode 用量 API 的 `cost` 字段单位为 1e-8 USD，此前按 1e-9 换算，导致所有费用仅为真实值的 1/10；应用启动时会自动按原始 `cost_raw` 修正存量数据。
  Fixed usage costs being underreported by 10x: the API `cost` field is in 1e-8 USD but was divided by 1e9; existing records are auto-migrated from `cost_raw` on startup.
  （本项修复来自 PR #6，由 KDB-Wind 提供 / Provided by KDB-Wind via PR #6）

- 修复按天统计按 UTC 分天、与 OpenCode Go 网页（本地时区）每日总额不一致的问题：日统计分组、“今天”过滤及前端日期标签改为跟随电脑本地时区。
  Fixed daily stats being bucketed by UTC so daily totals mismatch the Go console; day grouping, the "today" filter and frontend date labels now follow the computer's local timezone.

- 修复前端一处类型检查报错（ModelRankChart 图表 Tooltip 存在未使用参数）。
  Fixed a frontend type-check error (unused parameter in the ModelRankChart tooltip).

- 设置页账户列表与用量记录表格中的账户名称过长时自动截断，悬停可查看完整名称。
  Long account names are now truncated in the settings account list and usage records table, with the full name shown on hover.
