# 68HUB Android

68HUB Android is a local usage dashboard for OpenCode Go, built with Tauri 2, Rust, SQLite, and React.

This project is adapted from [evanfu0110/68hub](https://github.com/evanfu0110/68hub/). The current version focuses on Android and adds a local Rust core, encrypted Cookie storage, touch pull-to-refresh, and an Android APK release pipeline. Many thanks to Evan Fu for the original open-source project and foundation!

## Features

- Quota and usage statistics for multiple OpenCode Go accounts
- Token rankings, daily trends, and usage records
- Touch-friendly Android layout with pull-to-refresh
- Device-local data with no cloud backend or localhost service
- Rust + SQLite local core with an Android-specific TLS configuration
- Chinese and English interfaces

## Development

You need Node.js, pnpm, Rust, Android Studio/SDK, Java 17, and the Android NDK.

```bash
pnpm install

# Local frontend development
pnpm dev

# Android device or emulator development
pnpm dev:android
```

## Build an APK

```bash
pnpm tauri android init
pnpm build:android
```

The default build targets an Android arm64 APK. The release workflow is in `.github/workflows/release.yml` and requires Android signing Secrets.

## Project structure

```text
src/                 React mobile UI and Tauri API client
src-tauri/src/       Rust commands, SQLite, encrypted storage, and sync logic
src-tauri/           Tauri Android configuration
.github/workflows/   Android APK verification, signing, and release
```

## Privacy

Account Cookies are used only on the device and stored in encrypted form. The app does not upload account information to this repository or a third-party service.

## Credits

Thanks to [evanfu0110/68hub](https://github.com/evanfu0110/68hub/) for the original project and product foundation. This repository is its Android mobile derivative.

## License

MIT
