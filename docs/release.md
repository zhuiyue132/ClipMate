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
- 在配置好 Apple 凭据时自动完成签名与公证
- 上传构建产物供后续发布

## 5. Auto Update Feed

应用内更新检查依赖一个静态 HTTP 目录。该目录至少需要：

- `latest-mac.yml`
- 当前版本 zip 包
- 后续版本 zip 包

可以将 `dist/` 里的产物同步到 CDN、对象存储或官网静态目录。

## 6. App Store / Website Release

以下步骤仍需要人工完成：

- 将公证后的 `.dmg` 上传到官网/CDN
- 在网站下载页替换最新版本链接
- 如需 Mac App Store，需改用 MAS 构建目标并通过 App Store Connect 提交流程

当前仓库已补齐本地构建、通用二进制、签名/公证所需配置，以及应用内更新机制；最终发布与审核仍依赖外部账号与证书。
