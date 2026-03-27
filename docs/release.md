# ClipMate Release Guide

## 1. Prerequisites

- Apple Developer 证书已导出为 `.p12`
- App Specific Password 已配置
- 可用的 Apple Team ID
- 可访问的更新源目录，目录内需托管：
  - `latest-mac.yml`
  - `ClipMate-*.zip`
  - `ClipMate-*.dmg`

## 2. Required Environment Variables

```bash
export CSC_LINK="/path/to/developer-id.p12"
export CSC_KEY_PASSWORD="your-cert-password"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"
```

如果要在应用内检查更新，请在设置页或运行环境中配置更新源 URL：

```bash
export CLIPMATE_UPDATE_URL="https://updates.example.com/clipmate"
```

## 3. Local Release Build

```bash
npm ci
npm run typecheck
npm run build:mac
```

如果你是通过 GitHub Actions 在打 tag 时自动构建并上传 Release 资产，需要在仓库
`Settings -> Secrets and variables -> Actions` 中配置：

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

说明：

- workflow 内创建 / 更新 GitHub Release 使用 Actions 自带的 `GITHUB_TOKEN`，无需额外配置 `GH_TOKEN`。
- Apple 相关凭据仍用于签名、公证。

产物默认位于 `dist/`，包含：

- Universal `.dmg`
- Universal `.zip`

说明：

- 若提供了 `CSC_LINK` / `CSC_NAME` 等签名凭据，构建会启用正式 macOS 签名与 Hardened Runtime，供后续公证使用。
- 若未提供签名凭据，构建会自动生成“本地可运行但未正式签名”的包，不启用 Hardened Runtime，避免安装后启动即闪退。
- 未正式签名 / 未公证的包在目标机器上仍可能被 Gatekeeper 拦截，首次打开时需在 Finder 中右键 `Open` 或手动移除 quarantine。

## 4. CI Build

仓库内已提供 GitHub Actions 工作流：

- `.github/workflows/release-mac.yml`

该工作流会：

- 在 macOS runner 上执行 `npm ci`
- 执行类型检查
- 构建通用架构 `dmg/zip`
- 生成自动更新所需的 `latest-mac.yml` 与 `*.blockmap`
- 在配置好 Apple 凭据时自动完成签名与公证
- 在 tag 推送时自动把发布产物附加到 GitHub Release
- 上传同一批构建产物到 GitHub Actions artifacts，便于后续下载和二次分发

当前 CI 自动上传的产物包括：

- Universal `.dmg`
- Universal `.zip`
- `latest-mac.yml`
- `*.blockmap`

## 5. Auto Update Feed

应用内更新检查依赖一个静态 HTTP 目录。该目录至少需要：

- `latest-mac.yml`
- 当前版本 zip 包
- 后续版本 zip 包

可以将 `dist/` 或 GitHub Release / Actions artifacts 中的同批产物同步到 CDN、对象存储或官网静态目录。

## 6. App Store / Website Release

以下步骤仍需要人工完成：

- 将 GitHub Release / Actions artifacts 中的产物同步到官网/CDN
- 在网站下载页替换最新版本链接
- 如需 Mac App Store，需改用 MAS 构建目标并通过 App Store Connect 提交流程

当前仓库已补齐本地构建、通用二进制、签名/公证所需配置，以及 GitHub Release / Actions artifacts 自动上传能力；官网分发、外部对象存储同步与最终审核仍依赖外部账号与后续流程。
