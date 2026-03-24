const hasMacSigningIdentity = Boolean(process.env.CSC_LINK || process.env.CSC_NAME)

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'com.clipmate.app',
  productName: 'ClipMate',
  directories: {
    buildResources: 'build'
  },
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  ],
  asarUnpack: ['resources/**', '**/*.node'],
  extraResources: [
    {
      from: 'build/generated-resources',
      to: '.'
    },
    {
      from: 'build/tray',
      to: 'tray'
    }
  ],
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['universal']
      },
      {
        target: 'zip',
        arch: ['universal']
      }
    ],
    entitlementsInherit: 'build/entitlements.mac.plist',
    extendInfo: {
      NSAccessibilityUsageDescription: 'ClipMate 需要辅助功能权限来执行自动粘贴操作。',
      NSScreenCaptureUsageDescription: 'ClipMate 需要屏幕录制权限以便在屏幕共享时自动隐藏。'
    },
    x64ArchFiles: 'Contents/Resources/ocr/vision_ocr',
    category: 'public.app-category.productivity',
    hardenedRuntime: hasMacSigningIdentity,
    gatekeeperAssess: false,
    artifactName: '${name}-${version}-${os}-${arch}.${ext}',
    ...(hasMacSigningIdentity ? {} : { identity: null })
  },
  dmg: {
    artifactName: '${name}-${version}.${ext}'
  },
  npmRebuild: true,
  extraMetadata: {
    main: './out/main/index.js'
  }
}

export default config
