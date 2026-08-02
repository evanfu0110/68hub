# 68HUB Android

68HUB Android 是一个面向 OpenCode Go 的本地用量统计应用，使用 Tauri 2、Rust、SQLite 和 React 构建。

本项目基于 [evanfu0110/68hub](https://github.com/evanfu0110/68hub/) 二次开发，当前版本专注 Android 移动端，加入了本地 Rust 核心、加密 Cookie 存储、触摸下拉刷新和 Android APK 构建流程。感谢原作者 Evan Fu 的开源项目与基础实现！

## 功能

- 多个 OpenCode Go 账户的配额和用量统计
- Token 排名、每日趋势和使用记录
- Android 触摸布局与下拉刷新
- 数据和 Cookie 保存在当前设备，不依赖云端后台或 localhost 服务
- Rust + SQLite 本地核心，网络请求使用 Android 专用 TLS 配置
- 中英文界面

## 开发

需要 Node.js、pnpm、Rust、Android Studio/SDK、Java 17 和 Android NDK。

```bash
pnpm install

# 浏览器模拟/桌面开发窗口
pnpm dev

# Android 真机或模拟器开发
pnpm dev:android
```

## 构建 APK

```bash
pnpm tauri android init
pnpm build:android
```

默认构建 Android arm64 APK。发布工作流位于 `.github/workflows/release.yml`，需要配置 Android 签名相关 Secrets。

## 项目结构

```text
src/                 React 移动端界面和 Tauri API 客户端
src-tauri/src/       Rust 命令、SQLite、加密存储和同步逻辑
src-tauri/           Tauri Android 配置
.github/workflows/   Android APK 验证、签名和发布
```

## 隐私

账户 Cookie 只在设备本地使用，并以加密形式保存；应用不会把账户信息上传到本项目或第三方服务器。

## 致谢

感谢 [evanfu0110/68hub](https://github.com/evanfu0110/68hub/) 提供原始项目和产品基础。本仓库是其 Android 移动端衍生版本。

## License

MIT
