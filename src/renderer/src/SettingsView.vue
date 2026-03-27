<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiIcon from './components/UiIcon.vue'
import FeedbackBanner from './components/shared/FeedbackBanner.vue'
import InlineActionGroup from './components/shared/InlineActionGroup.vue'
import StatusPill from './components/shared/StatusPill.vue'
import SettingsRow from './components/settings/SettingsRow.vue'
import SettingsSection from './components/settings/SettingsSection.vue'
import type {
  AppSettings,
  SettingsTabId,
  SettingsSnapshot,
  ShortcutAction,
  ShortcutRegistrationState,
  SourceAppSummary,
  SystemPermissionSnapshot,
  SyncState,
  ThemePreference,
  UpdateState
} from '../../shared/types'

type SettingsNavIcon = 'settings' | 'shield' | 'database' | 'cloud' | 'info'

type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const tabs: Array<{
  value: SettingsTabId
  label: string
  icon: SettingsNavIcon
  description: string
}> = [
  { value: 'general', label: '通用', icon: 'settings', description: '启动、外观与快捷键' },
  { value: 'privacy', label: '隐私', icon: 'shield', description: '权限、保护策略与排除应用' },
  { value: 'storage', label: '存储', icon: 'database', description: '历史保留与清理策略' },
  { value: 'sync', label: '同步', icon: 'cloud', description: 'iCloud Drive 同步状态与操作' },
  { value: 'about', label: '关于', icon: 'info', description: '版本信息与更新通道' }
]

const shortcutLabels: Array<{ key: ShortcutAction; label: string; hint: string }> = [
  { key: 'togglePanel', label: '呼出面板', hint: '全局快捷键' },
  { key: 'quickPasteLatest', label: 'QuickPaste', hint: '最近一条直接粘贴' },
  { key: 'pasteLatestPlainText', label: '纯文本粘贴', hint: '最近一条纯文本粘贴' },
  { key: 'togglePasteStack', label: 'Stack 开关', hint: '全局快捷键' },
  { key: 'pasteStackPaste', label: 'Stack 粘贴', hint: '启用 Stack 后的实际粘贴键' },
  { key: 'togglePauseCapture', label: '暂停收集', hint: '全局快捷键' },
  { key: 'focusSearch', label: '聚焦搜索', hint: '窗口内快捷键' },
  { key: 'newTextItem', label: '新建文本', hint: '窗口内快捷键' },
  { key: 'newLinkItem', label: '新建链接', hint: '窗口内快捷键' }
]

const tab = ref<SettingsTabId>('general')
const settings = ref<AppSettings | null>(null)
const syncState = ref<SyncState>({
  enabled: false,
  status: 'disabled',
  lastSyncAt: null,
  lastError: null,
  path: null
})
const shortcutState = ref<ShortcutRegistrationState | null>(null)
const systemPermissions = ref<SystemPermissionSnapshot>({
  accessibility: false,
  screen: 'unknown'
})
const sourceApps = ref<SourceAppSummary[]>([])
const appVersion = ref('')
const dbPath = ref('')
const updateState = ref<UpdateState>({
  status: 'unavailable',
  currentVersion: '',
  availableVersion: null,
  progress: null,
  message: ''
})
const toast = ref<string | null>(null)
const manualBundleId = ref('')
const manualBundleName = ref('')
let toastTimer: number | null = null
let unsubSettings: (() => void) | null = null
let unsubSettingsTab: (() => void) | null = null

const currentTabMeta = computed(() => tabs.find((item) => item.value === tab.value) ?? tabs[0])

function parseSettingsTabFromHash(): SettingsTabId | null {
  const [, query = ''] = window.location.hash.split('?')
  const params = new URLSearchParams(query)
  const nextTab = params.get('tab')
  return tabs.some((item) => item.value === nextTab) ? (nextTab as SettingsTabId) : null
}

function updateSettingsHash(nextTab: SettingsTabId): void {
  const params = new URLSearchParams({ tab: nextTab })
  const nextHash = `#/settings?${params.toString()}`
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, '', nextHash)
  }
}

function setTab(nextTab: SettingsTabId): void {
  tab.value = nextTab
}

function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') {
    delete root.dataset.theme
    return
  }

  root.dataset.theme = theme
}

function cloneSettings(value: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(value)) as AppSettings
}

function showToast(message: string): void {
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
    toastTimer = null
  }, 1800)
}

function applySnapshot(snapshot: SettingsSnapshot): void {
  settings.value = cloneSettings(snapshot.settings)
  syncState.value = snapshot.syncState
  shortcutState.value = snapshot.shortcutState
  updateState.value = snapshot.updateState
  appVersion.value = snapshot.appVersion
  dbPath.value = snapshot.dbPath
  applyTheme(snapshot.settings.general.theme)
}

async function loadSnapshot(): Promise<void> {
  const [snapshot, apps, permissions] = await Promise.all([
    window.api.getSettingsSnapshot(),
    window.api.getSourceApps(),
    window.api.getSystemPermissions()
  ])
  applySnapshot(snapshot)
  sourceApps.value = apps
  systemPermissions.value = permissions
}

async function persistSettings(message?: string): Promise<void> {
  if (!settings.value) return
  settings.value = cloneSettings(await window.api.updateSettings(settings.value))
  if (message) {
    showToast(message)
  }
}

const availableApps = computed(() => {
  const excluded = new Set(settings.value?.privacy.excludedApps.map((item) => item.bundleId) ?? [])
  return sourceApps.value.filter((item) => !excluded.has(item.source_app))
})

const syncStatusLabel = computed(() => {
  switch (syncState.value.status) {
    case 'idle':
      return '已同步'
    case 'syncing':
      return '同步中'
    case 'error':
      return '同步失败'
    case 'unavailable':
      return '不可用'
    default:
      return '已关闭'
  }
})

function formatTime(ts: number | null): string {
  if (!ts) return '尚未同步'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function shortcutStatusLabel(key: ShortcutAction): string {
  const status = shortcutState.value?.[key]
  if (!status) return '未加载'
  if (status.scope === 'local') return '窗口内'
  if (key === 'pasteStackPaste' && !status.registered) return '条件注册'
  return status.registered ? '已注册' : '冲突/无权限'
}

function shortcutStatusTone(key: ShortcutAction): StatusTone {
  const label = shortcutStatusLabel(key)
  if (label === '已注册' || label === '窗口内' || label === '条件注册') return 'success'
  if (label === '未加载') return 'neutral'
  return 'warning'
}

function screenPermissionLabel(): string {
  switch (systemPermissions.value.screen) {
    case 'granted':
      return '已授权'
    case 'denied':
      return '已拒绝'
    case 'restricted':
      return '受限'
    case 'not-determined':
      return '未决定'
    default:
      return '未知'
  }
}

function permissionStateLabel(granted: boolean): string {
  return granted ? '已授权' : '未授权'
}

function permissionTone(granted: boolean): StatusTone {
  return granted ? 'success' : 'warning'
}

function syncTone(): StatusTone {
  switch (syncState.value.status) {
    case 'idle':
      return 'success'
    case 'syncing':
      return 'accent'
    case 'error':
      return 'danger'
    case 'unavailable':
      return 'warning'
    default:
      return 'neutral'
  }
}

function updateTone(): StatusTone {
  switch (updateState.value.status) {
    case 'downloaded':
    case 'available':
      return 'success'
    case 'checking':
    case 'downloading':
      return 'accent'
    case 'error':
      return 'danger'
    case 'unavailable':
      return 'warning'
    default:
      return 'neutral'
  }
}

function updateSummary(): string {
  if (updateState.value.message) return updateState.value.message
  switch (updateState.value.status) {
    case 'idle':
      return '等待检查更新'
    case 'checking':
      return '正在检查更新'
    case 'available':
      return '发现可用更新'
    case 'not-available':
      return '当前已是最新版本'
    case 'downloading':
      return '正在下载更新'
    case 'downloaded':
      return '更新已下载，等待安装'
    case 'error':
      return '更新失败'
    default:
      return '当前环境不可用'
  }
}

async function refreshSystemPermissions(message?: string): Promise<void> {
  systemPermissions.value = await window.api.getSystemPermissions()
  if (message) {
    showToast(message)
  }
}

async function requestAccessibilityPermission(): Promise<void> {
  window.api.requestAccessibilityPermission()
  window.setTimeout(() => {
    void refreshSystemPermissions('已触发辅助功能权限请求')
  }, 900)
}

async function openPrivacySettings(kind: 'accessibility' | 'screen'): Promise<void> {
  await window.api.openPrivacySettings(kind)
  showToast('已打开系统设置')
}

async function toggleBooleanSetting(section: keyof AppSettings, key: string): Promise<void> {
  if (!settings.value) return
  const target = settings.value[section] as Record<string, boolean>
  target[key] = !target[key]
  await persistSettings('已保存设置')
}

async function addExcludedApp(bundleId: string, name: string | null): Promise<void> {
  if (!settings.value) return
  const value = bundleId.trim()
  if (!value) return
  if (settings.value.privacy.excludedApps.some((item) => item.bundleId === value)) return
  settings.value.privacy.excludedApps.push({ bundleId: value, name: name?.trim() || null })
  await persistSettings('已添加排除应用')
}

async function removeExcludedApp(bundleId: string): Promise<void> {
  if (!settings.value) return
  settings.value.privacy.excludedApps = settings.value.privacy.excludedApps.filter(
    (item) => item.bundleId !== bundleId
  )
  await persistSettings('已移除排除应用')
}

async function addManualExcludedApp(): Promise<void> {
  await addExcludedApp(manualBundleId.value, manualBundleName.value || null)
  manualBundleId.value = ''
  manualBundleName.value = ''
}

async function runSyncNow(): Promise<void> {
  syncState.value = await window.api.triggerSyncNow()
  showToast(syncState.value.status === 'idle' ? '同步完成' : syncStatusLabel.value)
}

async function clearHistory(): Promise<void> {
  const ok = window.confirm('确定清空所有历史记录？')
  if (!ok) return
  await window.api.clearHistory()
  showToast('历史记录已清空')
}

async function checkUpdates(): Promise<void> {
  updateState.value = await window.api.checkForUpdates()
}

async function downloadUpdatePackage(): Promise<void> {
  updateState.value = await window.api.downloadUpdate()
}

async function installDownloadedUpdate(): Promise<void> {
  await window.api.installUpdate()
}

onMounted(async () => {
  setTab(parseSettingsTabFromHash() ?? 'general')
  await loadSnapshot()
  unsubSettings = window.api.onSettingsChanged((snapshot) => {
    applySnapshot(snapshot)
  })
  unsubSettingsTab = window.api.onSettingsTabRequested((nextTab) => {
    setTab(nextTab)
  })
})

onBeforeUnmount(() => {
  unsubSettings?.()
  unsubSettingsTab?.()
  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
})

watch(tab, (nextTab) => {
  updateSettingsHash(nextTab)
})
</script>

<template>
  <div class="settings-shell">
    <aside class="settings-sidebar">
      <div class="settings-brand">
        <div class="settings-brand__mark">CM</div>
        <div class="settings-brand__meta">
          <div class="settings-brand__title">ClipMate</div>
          <div class="settings-brand__subtitle">设置与偏好</div>
        </div>
      </div>

      <div class="settings-nav">
        <button
          v-for="item in tabs"
          :key="item.value"
          class="settings-nav__item"
          :class="{ 'is-active': tab === item.value }"
          @click="setTab(item.value)"
        >
          <span class="settings-nav__icon"><UiIcon :name="item.icon" :size="18" /></span>
          <span class="settings-nav__copy">
            <span class="settings-nav__label">{{ item.label }}</span>
            <span class="settings-nav__description">{{ item.description }}</span>
          </span>
        </button>
      </div>
    </aside>

    <main class="settings-main">
      <header class="settings-header">
        <div class="settings-header__copy">
          <div class="settings-header__eyebrow">{{ currentTabMeta.label }}</div>
          <div class="settings-header__title-row">
            <UiIcon :name="currentTabMeta.icon" :size="22" />
            <h1 class="settings-header__title">{{ currentTabMeta.label }}</h1>
          </div>
          <p class="settings-header__description">{{ currentTabMeta.description }}</p>
        </div>

        <StatusPill
          :label="toast ? '刚刚更新' : '设置面板'"
          :tone="toast ? 'accent' : 'neutral'"
          :strong="true"
        />
      </header>

      <FeedbackBanner
        v-if="toast"
        tone="accent"
        compact
        :title="toast"
        message="设置已同步到当前应用状态。"
      />

      <div v-if="settings" class="settings-content">
        <template v-if="tab === 'general'">
          <SettingsSection
            eyebrow="General"
            title="启动与外观"
            description="控制应用随系统启动和全局主题表现。"
          >
            <SettingsRow label="开机启动" hint="登录 macOS 后自动启动 ClipMate。">
              <button
                class="toggle"
                :class="{ on: settings.general.launchAtLogin }"
                @click="toggleBooleanSetting('general', 'launchAtLogin')"
              >
                <span></span>
              </button>
            </SettingsRow>

            <SettingsRow label="外观" hint="支持跟随系统、浅色和深色。">
              <select
                v-model="settings.general.theme"
                class="panel-select settings-select"
                @change="persistSettings('已更新外观设置')"
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            eyebrow="Shortcuts"
            title="快捷键"
            description="分为全局快捷键与窗口内快捷键，保持触发范围清晰。"
          >
            <SettingsRow
              v-for="item in shortcutLabels"
              :key="item.key"
              :label="item.label"
              :hint="item.hint"
            >
              <div class="settings-shortcut-control">
                <input
                  v-model="settings.shortcuts[item.key]"
                  class="panel-input settings-shortcut-input"
                  @blur="persistSettings('已保存快捷键')"
                />
                <StatusPill
                  :label="shortcutStatusLabel(item.key)"
                  :tone="shortcutStatusTone(item.key)"
                />
              </div>
            </SettingsRow>
          </SettingsSection>
        </template>

        <template v-else-if="tab === 'privacy'">
          <SettingsSection
            eyebrow="Permissions"
            title="系统权限"
            description="Direct Paste、QuickPaste 与屏幕共享保护都依赖这里的状态。"
          >
            <SettingsRow
              label="辅助功能"
              hint="用于 Direct Paste、QuickPaste 与 Paste Stack 自动粘贴。"
            >
              <div class="settings-row-stack">
                <StatusPill
                  :label="permissionStateLabel(systemPermissions.accessibility)"
                  :tone="permissionTone(systemPermissions.accessibility)"
                />
                <InlineActionGroup align="end">
                  <button class="primary-btn compact" @click="requestAccessibilityPermission()">
                    请求授权
                  </button>
                  <button class="ghost-btn compact" @click="openPrivacySettings('accessibility')">
                    打开系统设置
                  </button>
                </InlineActionGroup>
              </div>
            </SettingsRow>

            <SettingsRow
              label="屏幕录制"
              hint="用于检测共享 / 录屏权限状态，并配合窗口隐藏策略生效。"
            >
              <div class="settings-row-stack">
                <StatusPill
                  :label="screenPermissionLabel()"
                  :tone="permissionTone(systemPermissions.screen === 'granted')"
                />
                <InlineActionGroup align="end">
                  <button class="ghost-btn compact" @click="openPrivacySettings('screen')">
                    打开系统设置
                  </button>
                  <button
                    class="ghost-btn compact"
                    @click="refreshSystemPermissions('已刷新权限状态')"
                  >
                    重新检测
                  </button>
                </InlineActionGroup>
              </div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            eyebrow="Protection"
            title="保护策略"
            description="控制窗口隐藏与对机密内容的处理方式。"
          >
            <SettingsRow label="屏幕共享时隐藏" hint="启用内容保护，避免窗口出现在共享画面中。">
              <button
                class="toggle"
                :class="{ on: settings.privacy.hideOnScreenShare }"
                @click="toggleBooleanSetting('privacy', 'hideOnScreenShare')"
              >
                <span></span>
              </button>
            </SettingsRow>

            <SettingsRow
              label="忽略机密剪贴板"
              hint="跳过被系统标记为 concealed / transient 的内容。"
            >
              <button
                class="toggle"
                :class="{ on: settings.privacy.ignoreConcealed }"
                @click="toggleBooleanSetting('privacy', 'ignoreConcealed')"
              >
                <span></span>
              </button>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            eyebrow="Exclusions"
            title="应用排除"
            description="这些应用的剪贴板将不会被 ClipMate 自动采集。"
          >
            <FeedbackBanner
              compact
              :tone="settings.privacy.excludedApps.length > 0 ? 'success' : 'neutral'"
              :title="
                settings.privacy.excludedApps.length > 0
                  ? `已排除 ${settings.privacy.excludedApps.length} 个应用`
                  : '尚未添加排除应用'
              "
              message="支持手动输入 Bundle ID，也可以从最近来源应用一键添加。"
            />

            <div class="settings-manual-row">
              <input
                v-model="manualBundleId"
                class="panel-input"
                placeholder="Bundle ID，例如 com.1password.1password"
              />
              <input
                v-model="manualBundleName"
                class="panel-input"
                placeholder="应用名称（可选）"
              />
              <button class="primary-btn" @click="addManualExcludedApp()">添加</button>
            </div>

            <div v-if="settings.privacy.excludedApps.length > 0" class="settings-app-grid">
              <div
                v-for="item in settings.privacy.excludedApps"
                :key="item.bundleId"
                class="settings-app-card"
              >
                <div>
                  <div class="settings-card-title">{{ item.name || item.bundleId }}</div>
                  <div class="settings-card-subtitle">{{ item.bundleId }}</div>
                </div>
                <button class="ghost-btn compact" @click="removeExcludedApp(item.bundleId)">
                  移除
                </button>
              </div>
            </div>

            <div class="settings-suggestion-block">
              <div class="sub-title">最近来源应用</div>
              <div class="settings-suggestion-grid">
                <button
                  v-for="item in availableApps"
                  :key="item.source_app"
                  class="ghost-btn compact"
                  @click="addExcludedApp(item.source_app, item.source_app_name)"
                >
                  {{ item.source_app_name || item.source_app }}
                </button>
              </div>
            </div>
          </SettingsSection>
        </template>

        <template v-else-if="tab === 'storage'">
          <SettingsSection
            eyebrow="Retention"
            title="自动清理"
            description="保留策略会在写入历史后自动生效。"
          >
            <SettingsRow label="历史数量上限" hint="超出上限时自动删除最旧条目。">
              <select
                v-model="settings.storage.maxItems"
                class="panel-select settings-select"
                @change="persistSettings('已更新数量上限')"
              >
                <option :value="100">100</option>
                <option :value="500">500</option>
                <option :value="1000">1000</option>
                <option :value="null">不限</option>
              </select>
            </SettingsRow>

            <SettingsRow label="保存时长" hint="自动清理超过保留期的历史记录。">
              <select
                v-model="settings.storage.maxAgeDays"
                class="panel-select settings-select"
                @change="persistSettings('已更新时间规则')"
              >
                <option :value="7">7 天</option>
                <option :value="30">30 天</option>
                <option :value="90">90 天</option>
                <option :value="null">永久</option>
              </select>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            eyebrow="Maintenance"
            title="数据管理"
            description="危险操作会立即影响当前数据库内容。"
            tone="danger"
          >
            <SettingsRow label="清空全部历史" hint="该操作不可撤销。" stacked>
              <InlineActionGroup align="start">
                <button class="danger-btn" @click="clearHistory()">清空历史</button>
              </InlineActionGroup>
            </SettingsRow>
          </SettingsSection>
        </template>

        <template v-else-if="tab === 'sync'">
          <SettingsSection
            eyebrow="iCloud"
            title="iCloud Drive 同步"
            description="通过 iCloud Drive 在同一 Apple ID 的设备间同步历史记录。"
          >
            <SettingsRow label="启用同步" hint="关闭后不会主动写入或拉取同步文件。">
              <div class="settings-row-stack">
                <StatusPill :label="syncStatusLabel" :tone="syncTone()" />
                <button
                  class="toggle"
                  :class="{ on: settings.sync.enabled }"
                  @click="toggleBooleanSetting('sync', 'enabled')"
                >
                  <span></span>
                </button>
              </div>
            </SettingsRow>

            <div class="settings-stat-grid">
              <div class="settings-stat-card">
                <div class="settings-stat-card__label">同步状态</div>
                <div class="settings-stat-card__value">{{ syncStatusLabel }}</div>
              </div>
              <div class="settings-stat-card">
                <div class="settings-stat-card__label">上次同步</div>
                <div class="settings-stat-card__value">{{ formatTime(syncState.lastSyncAt) }}</div>
              </div>
            </div>

            <FeedbackBanner
              compact
              tone="neutral"
              title="同步文件"
              :message="syncState.path || '当前未检测到 iCloud Drive 目录'"
            />

            <FeedbackBanner
              v-if="syncState.lastError"
              compact
              tone="danger"
              title="最近一次错误"
              :message="syncState.lastError"
            />

            <SettingsRow label="立即同步" hint="会触发一次完整的写入 / 拉取流程。" stacked>
              <InlineActionGroup align="start">
                <button
                  class="primary-btn"
                  :disabled="!settings.sync.enabled"
                  @click="runSyncNow()"
                >
                  立即同步
                </button>
              </InlineActionGroup>
            </SettingsRow>
          </SettingsSection>
        </template>

        <template v-else-if="tab === 'about'">
          <SettingsSection
            eyebrow="Build"
            title="版本信息"
            description="当前版本、数据库位置与运行形态。"
          >
            <SettingsRow label="当前版本" hint="应用版本号。">
              <StatusPill :label="appVersion || '0.0.0'" tone="neutral" :strong="true" />
            </SettingsRow>
            <SettingsRow label="数据库路径" hint="本地 SQLite 文件位置。" stacked>
              <code class="settings-code">{{ dbPath }}</code>
            </SettingsRow>
            <SettingsRow label="构建模式" hint="当前桌面端技术栈。">
              <div class="settings-value-strong">Electron + Vue 3 + SQLite</div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            eyebrow="Updates"
            title="更新"
            description="打包版可接入自动更新流程，开发态仅验证接线状态。"
          >
            <SettingsRow
              label="更新源 URL"
              hint="指向包含 latest-mac.yml 与安装包的 HTTP 目录。"
              stacked
            >
              <input
                v-model="settings.general.updateFeedUrl"
                class="panel-input"
                placeholder="https://updates.example.com/clipmate"
                @blur="persistSettings('已保存更新源')"
              />
            </SettingsRow>

            <SettingsRow label="更新状态" hint="当前检查、下载或安装阶段。">
              <StatusPill :label="updateSummary()" :tone="updateTone()" />
            </SettingsRow>

            <SettingsRow
              v-if="updateState.availableVersion"
              label="可用版本"
              hint="服务器返回的目标版本。"
            >
              <div class="settings-value-strong">{{ updateState.availableVersion }}</div>
            </SettingsRow>

            <SettingsRow
              v-if="typeof updateState.progress === 'number'"
              label="下载进度"
              hint="仅在下载中显示。"
            >
              <div class="settings-value-strong">{{ Math.round(updateState.progress) }}%</div>
            </SettingsRow>

            <SettingsRow label="更新操作" hint="根据当前状态提供检查、下载和安装动作。" stacked>
              <InlineActionGroup align="start">
                <button class="primary-btn" @click="checkUpdates()">检查更新</button>
                <button
                  class="ghost-btn"
                  :disabled="updateState.status !== 'available'"
                  @click="downloadUpdatePackage()"
                >
                  下载更新
                </button>
                <button
                  class="danger-btn"
                  :disabled="updateState.status !== 'downloaded'"
                  @click="installDownloadedUpdate()"
                >
                  重启安装
                </button>
              </InlineActionGroup>
            </SettingsRow>
          </SettingsSection>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
.settings-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  background: var(--bg-primary);
  color: var(--text-primary);
}

.settings-sidebar {
  padding: 24px 18px;
  border-right: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
  background: linear-gradient(180deg, var(--surface-panel-strong) 0%, var(--surface-panel) 100%);
  backdrop-filter: blur(24px) saturate(1.05);
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 8px 20px;
}

.settings-brand__mark {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: linear-gradient(135deg, #007aff, #34c759);
  color: white;
  display: grid;
  place-items: center;
  font-weight: 800;
  box-shadow: 0 14px 34px rgba(0, 122, 255, 0.22);
}

.settings-brand__meta {
  min-width: 0;
}

.settings-brand__title {
  font-size: var(--font-title-sm);
  font-weight: 700;
}

.settings-brand__subtitle {
  margin-top: 4px;
  font-size: var(--font-footnote);
  color: var(--text-secondary);
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-nav__item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
}

.settings-nav__item:hover,
.settings-nav__item.is-active {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--border-color) 78%, transparent);
  background: linear-gradient(180deg, var(--surface-panel-strong) 0%, var(--surface-panel) 100%);
  box-shadow: var(--shadow-section);
}

.settings-nav__icon {
  margin-top: 1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.settings-nav__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-nav__label {
  font-size: var(--font-body-strong);
  font-weight: 650;
}

.settings-nav__description {
  font-size: var(--font-caption);
  line-height: 1.5;
  color: var(--text-tertiary);
}

.settings-main {
  min-width: 0;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow: auto;
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-header__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-header__eyebrow {
  font-size: var(--font-caption);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.settings-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-header__title {
  font-size: var(--font-display);
  line-height: 1.05;
  font-weight: 800;
}

.settings-header__description {
  max-width: 720px;
  font-size: var(--font-body);
  line-height: 1.6;
  color: var(--text-secondary);
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-select {
  min-width: 180px;
}

.settings-shortcut-control,
.settings-row-stack {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}

.settings-shortcut-input {
  width: min(260px, 100%);
}

.settings-manual-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.settings-manual-row .panel-input {
  flex: 1;
  min-width: 240px;
}

.settings-app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 10px;
}

.settings-app-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
  background: color-mix(in srgb, var(--surface-panel-strong) 92%, transparent);
}

.settings-card-title {
  font-size: var(--font-body-strong);
  font-weight: 650;
}

.settings-card-subtitle {
  margin-top: 4px;
  font-size: var(--font-footnote);
  color: var(--text-secondary);
  word-break: break-all;
}

.settings-suggestion-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-suggestion-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.settings-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.settings-stat-card {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
  background: color-mix(in srgb, var(--surface-panel-strong) 92%, transparent);
}

.settings-stat-card__label {
  font-size: var(--font-footnote);
  color: var(--text-secondary);
}

.settings-stat-card__value {
  margin-top: 8px;
  font-size: var(--font-title-sm);
  line-height: 1.35;
  font-weight: 700;
  color: var(--text-primary);
}

.settings-code {
  display: inline-flex;
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
  background: color-mix(in srgb, var(--surface-panel-strong) 92%, transparent);
  font-size: var(--font-footnote);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.settings-value-strong {
  font-size: var(--font-body-strong);
  font-weight: 700;
  color: var(--text-primary);
}

@media (max-width: 980px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    border-right: none;
    border-bottom: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
  }

  .settings-nav {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
}

@media (max-width: 760px) {
  .settings-main {
    padding: 18px 16px 20px;
  }

  .settings-header {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-header__title {
    font-size: 28px;
  }

  .settings-shortcut-control,
  .settings-row-stack,
  .settings-manual-row {
    align-items: stretch;
    justify-content: flex-start;
  }

  .settings-shortcut-input,
  .settings-select,
  .settings-row .surface-row__content {
    width: 100%;
  }
}
</style>
