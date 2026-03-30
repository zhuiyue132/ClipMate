export const siteMeta = {
  name: 'ClipMate',
  title: 'ClipMate · 本地优先的 macOS 剪贴板管理器',
  description:
    '保存你复制过的文本、链接、图片、文件与颜色。支持搜索、OCR、直接粘贴与 Paste Stack，把剪贴板真正变成可管理的工作流。',
  siteUrl: 'https://zhuiyue132.github.io/ClipMate/',
  repoUrl: 'https://github.com/zhuiyue132/ClipMate',
  releasesUrl: 'https://github.com/zhuiyue132/ClipMate/releases',
  latestReleaseUrl: 'https://github.com/zhuiyue132/ClipMate/releases/latest'
} as const

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')

export function pageHref(path = '/') {
  if (path === '/' || path === '') return baseUrl
  return `${baseUrl}${path.replace(/^\/+/, '').replace(/\/?$/, '/')}`
}

export function assetHref(path: string) {
  return `${baseUrl}${path.replace(/^\/+/, '')}`
}

export function anchorHref(anchor: string) {
  return `${baseUrl}#${anchor.replace(/^#/, '')}`
}

export const navItems = [
  { label: '产品特性', href: anchorHref('features'), currentPath: '/' },
  { label: '下载', href: pageHref('/download/'), currentPath: '/download/' },
  { label: '隐私', href: pageHref('/privacy/'), currentPath: '/privacy/' },
  { label: 'FAQ', href: pageHref('/faq/'), currentPath: '/faq/' },
  { label: 'GitHub', href: siteMeta.repoUrl, external: true }
] as const

export const heroBadges = ['仅支持 macOS', '本地优先', '可选 iCloud Drive 同步'] as const

export const valueCards = [
  {
    title: '不丢失',
    description: '自动记录你复制过的内容，避免新的复制覆盖旧信息。'
  },
  {
    title: '找得到',
    description: '支持全文搜索、类型筛选、来源应用筛选，以及图片 OCR 搜索。'
  },
  {
    title: '用得顺',
    description: '双击即可直接粘贴，快捷键操作自然融入日常工作流。'
  },
  {
    title: '放得心',
    description: '默认本地存储，可排除应用、忽略机密内容，并按需启用同步。'
  }
] as const

export const features = [
  {
    title: '快速找回任何一条历史记录',
    description:
      '输入关键词后，即可按内容、类型、来源应用或日期快速定位。图片 OCR 结果也会进入搜索索引，让截图里的文字同样可找。',
    image: assetHref('screenshots/main-panel-search.png'),
    alt: 'ClipMate 搜索状态截图',
    reverse: false
  },
  {
    title: '从历史中选中，然后直接粘贴回原来的应用',
    description:
      '单击选中，双击或回车即可直接粘贴。也支持以纯文本方式粘贴，减少网页、文档和 IM 场景中的格式干扰。',
    image: assetHref('screenshots/main-panel-overview.png'),
    alt: 'ClipMate 主面板选中状态截图',
    reverse: true
  },
  {
    title: '不止能保存，还能更完整地查看与编辑',
    description:
      '文本和链接可直接编辑，图片可预览，文件支持 Quick Look，颜色可查看详细色值。常用内容不必重新复制整理，直接在 ClipMate 中继续处理。',
    image: assetHref('screenshots/preview-panel-text.png'),
    alt: 'ClipMate 预览面板截图',
    reverse: false
  },
  {
    title: '把多次复制，变成一个可视化粘贴队列',
    description:
      '开启 Paste Stack 后，每次复制都会按顺序进入队列。你可以查看、调整顺序，并逐项粘贴，特别适合批量整理与重复输入场景。',
    image: assetHref('screenshots/paste-stack.png'),
    alt: 'ClipMate Paste Stack 截图',
    reverse: true
  }
] as const

export const screenshots = [
  {
    title: '主面板',
    description: '集中查看最近复制的内容。',
    image: assetHref('screenshots/main-panel-overview.png'),
    alt: 'ClipMate 主面板总览截图'
  },
  {
    title: '搜索与筛选',
    description: '按关键词、类型、来源快速定位。',
    image: assetHref('screenshots/main-panel-search.png'),
    alt: 'ClipMate 搜索与筛选截图'
  },
  {
    title: '预览面板',
    description: '完整查看并编辑文本、链接或图片内容。',
    image: assetHref('screenshots/preview-panel-text.png'),
    alt: 'ClipMate 预览面板截图'
  },
  {
    title: '设置面板',
    description: '统一管理快捷键、隐私选项与同步设置。',
    image: assetHref('screenshots/settings-panel-storage.png'),
    alt: 'ClipMate 设置面板截图'
  }
] as const

export const privacyPoints = [
  '本地 SQLite 存储',
  'iCloud Drive 同步为可选项',
  '可排除敏感应用',
  '可忽略机密剪贴板内容',
  '支持暂停采集'
] as const

export const faqItems = [
  {
    question: 'ClipMate 只支持 macOS 吗？',
    answer: '是。ClipMate 当前仅为 macOS 设计与实现。'
  },
  {
    question: '为什么需要辅助功能权限？',
    answer: '自动粘贴功能需要系统辅助功能权限支持。'
  },
  {
    question: '剪贴板内容会上传到服务器吗？',
    answer: '默认不会。ClipMate 以本地存储为主，同步是可选功能。'
  },
  {
    question: '图片里的文字也能搜索吗？',
    answer: '可以。图片 OCR 结果会进入搜索索引。'
  },
  {
    question: 'iCloud 同步默认开启吗？',
    answer: '不是。iCloud Drive 同步是可选功能，默认关闭。'
  },
  {
    question: '去哪里下载最新版本？',
    answer: '你可以通过 GitHub Releases 获取最新版本。'
  }
] as const
