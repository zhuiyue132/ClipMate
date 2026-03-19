<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  AppSettings,
  SettingsSnapshot,
  ShortcutAction,
  ShortcutRegistrationState,
  SourceAppSummary,
  SystemPermissionSnapshot,
  SyncState,
  ThemePreference,
  UpdateState
} from '../../shared/types'

type SettingsTab = 'general' | 'privacy' | 'storage' | 'sync' | 'about'

const tabs: Array<{ value: SettingsTab; label: string }> = [
  { value: 'general', label: '通用' },
  { value: 'privacy', label: '隐私' },
  { value: 'storage', label: '存储' },
  { value: 'sync', label: '同步' },
  { value: 'about', label: '关于' }
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

const tab = ref<SettingsTab>('general')
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

function permissionPillClass(granted: boolean): string {
  return granted ? 'ok' : 'warn'
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
  await loadSnapshot()
  unsubSettings = window.api.onSettingsChanged((snapshot) => {
    applySnapshot(snapshot)
  })
})

onBeforeUnmount(() => {
  unsubSettings?.()
  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
})
</script>

<template>
  <div class="settings-shell">
    <aside class="settings-sidebar">
      <div class="brand">
        <div class="brand-mark">CM</div>
        <div>
          <div class="brand-title">ClipMate</div>
          <div class="brand-sub">设置与偏好</div>
        </div>
      </div>

      <div class="tab-list">
        <button
          v-for="item in tabs"
          :key="item.value"
          class="tab-btn"
          :class="{ active: tab === item.value }"
          @click="tab = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </aside>

    <main class="settings-main">
      <header class="settings-header">
        <div>
          <div class="page-title">{{ tabs.find((item) => item.value === tab)?.label }}</div>
          <div class="page-sub">调整应用行为、隐私策略与同步偏好</div>
        </div>
        <div v-if="toast" class="settings-toast">{{ toast }}</div>
      </header>

      <div v-if="settings" class="settings-content">
        <template v-if="tab === 'general'">
          <section class="group-card">
            <div class="group-title">基础偏好</div>
            <div class="setting-row">
              <div>
                <div class="setting-name">开机启动</div>
                <div class="setting-hint">登录 macOS 后自动启动 ClipMate</div>
              </div>
              <button
                class="toggle"
                :class="{ on: settings.general.launchAtLogin }"
                @click="toggleBooleanSetting('general', 'launchAtLogin')"
              >
                <span></span>
              </button>
            </div>

            <div class="setting-row">
              <div>
                <div class="setting-name">外观</div>
                <div class="setting-hint">支持跟随系统、浅色和深色</div>
              </div>
              <select
                v-model="settings.general.theme"
                class="select"
                @change="persistSettings('已更新外观设置')"
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </div>
          </section>

          <section class="group-card">
            <div class="group-title">快捷键</div>
            <div v-for="item in shortcutLabels" :key="item.key" class="shortcut-row">
              <div>
                <div class="setting-name">{{ item.label }}</div>
                <div class="setting-hint">{{ item.hint }}</div>
              </div>
              <input
                v-model="settings.shortcuts[item.key]"
                class="shortcut-input"
                @blur="persistSettings('已保存快捷键')"
              />
              <span
                class="state-pill"
                :class="{
                  warn:
                    shortcutStatusLabel(item.key) !== '已注册' &&
                    shortcutStatusLabel(item.key) !== '窗口内' &&
                    shortcutStatusLabel(item.key) !== '条件注册'
                }"
              >
                {{ shortcutStatusLabel(item.key) }}
              </span>
            </div>
          </section>
        </template>

        <template v-else-if="tab === 'privacy'">
          <section class="group-card">
            <div class="group-title">系统权限</div>
            <div class="permission-grid">
              <div class="permission-card">
                <div>
                  <div class="setting-name">辅助功能</div>
                  <div class="setting-hint">
                    用于 Direct Paste、QuickPaste 与 Paste Stack 自动粘贴
                  </div>
                </div>
                <span
                  class="state-pill"
                  :class="permissionPillClass(systemPermissions.accessibility)"
                >
                  {{ permissionStateLabel(systemPermissions.accessibility) }}
                </span>
                <div class="manual-row permission-actions">
                  <button class="primary-btn" @click="requestAccessibilityPermission()">
                    请求授权
                  </button>
                  <button class="ghost-btn" @click="openPrivacySettings('accessibility')">
                    打开系统设置
                  </button>
                </div>
              </div>

              <div class="permission-card">
                <div>
                  <div class="setting-name">屏幕录制</div>
                  <div class="setting-hint">用于检测共享/录屏权限状态，并配合窗口隐藏策略生效</div>
                </div>
                <span
                  class="state-pill"
                  :class="permissionPillClass(systemPermissions.screen === 'granted')"
                >
                  {{ screenPermissionLabel() }}
                </span>
                <div class="manual-row permission-actions">
                  <button class="ghost-btn" @click="openPrivacySettings('screen')">
                    打开系统设置
                  </button>
                  <button class="ghost-btn" @click="refreshSystemPermissions('已刷新权限状态')">
                    重新检测
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="group-card">
            <div class="group-title">保护策略</div>
            <div class="setting-row">
              <div>
                <div class="setting-name">屏幕共享时隐藏</div>
                <div class="setting-hint">启用内容保护，避免窗口出现在共享画面中</div>
              </div>
              <button
                class="toggle"
                :class="{ on: settings.privacy.hideOnScreenShare }"
                @click="toggleBooleanSetting('privacy', 'hideOnScreenShare')"
              >
                <span></span>
              </button>
            </div>

            <div class="setting-row">
              <div>
                <div class="setting-name">忽略机密剪贴板</div>
                <div class="setting-hint">跳过被系统标记为 concealed / transient 的内容</div>
              </div>
              <button
                class="toggle"
                :class="{ on: settings.privacy.ignoreConcealed }"
                @click="toggleBooleanSetting('privacy', 'ignoreConcealed')"
              >
                <span></span>
              </button>
            </div>
          </section>

          <section class="group-card">
            <div class="group-title">应用排除</div>
            <div class="manual-row">
              <input
                v-model="manualBundleId"
                class="text-input"
                placeholder="Bundle ID，例如 com.1password.1password"
              />
              <input v-model="manualBundleName" class="text-input" placeholder="应用名称（可选）" />
              <button class="primary-btn" @click="addManualExcludedApp()">添加</button>
            </div>

            <div v-if="settings.privacy.excludedApps.length === 0" class="empty-hint">
              尚未添加排除应用
            </div>
            <div v-else class="chip-grid">
              <div
                v-for="item in settings.privacy.excludedApps"
                :key="item.bundleId"
                class="app-chip"
              >
                <div>
                  <div class="setting-name">{{ item.name || item.bundleId }}</div>
                  <div class="setting-hint">{{ item.bundleId }}</div>
                </div>
                <button class="ghost-btn" @click="removeExcludedApp(item.bundleId)">移除</button>
              </div>
            </div>

            <div class="sub-title">最近来源应用</div>
            <div class="chip-grid">
              <button
                v-for="item in availableApps"
                :key="item.source_app"
                class="suggest-chip"
                @click="addExcludedApp(item.source_app, item.source_app_name)"
              >
                {{ item.source_app_name || item.source_app }}
              </button>
            </div>
          </section>
        </template>

        <template v-else-if="tab === 'storage'">
          <section class="group-card">
            <div class="group-title">自动清理</div>
            <div class="setting-row">
              <div>
                <div class="setting-name">历史数量上限</div>
                <div class="setting-hint">超出上限时自动删除最旧条目</div>
              </div>
              <select
                v-model="settings.storage.maxItems"
                class="select"
                @change="persistSettings('已更新数量上限')"
              >
                <option :value="100">100</option>
                <option :value="500">500</option>
                <option :value="1000">1000</option>
                <option :value="null">不限</option>
              </select>
            </div>

            <div class="setting-row">
              <div>
                <div class="setting-name">保存时长</div>
                <div class="setting-hint">自动清理超过保留期的历史记录</div>
              </div>
              <select
                v-model="settings.storage.maxAgeDays"
                class="select"
                @change="persistSettings('已更新时间规则')"
              >
                <option :value="7">7 天</option>
                <option :value="30">30 天</option>
                <option :value="90">90 天</option>
                <option :value="null">永久</option>
              </select>
            </div>
          </section>

          <section class="group-card">
            <div class="group-title">数据管理</div>
            <button class="danger-btn" @click="clearHistory()">清空全部历史</button>
          </section>
        </template>

        <template v-else-if="tab === 'sync'">
          <section class="group-card">
            <div class="group-title">iCloud Drive 同步</div>
            <div class="setting-row">
              <div>
                <div class="setting-name">启用同步</div>
                <div class="setting-hint">
                  通过 iCloud Drive 在同一 Apple ID 的设备间同步历史记录
                </div>
              </div>
              <button
                class="toggle"
                :class="{ on: settings.sync.enabled }"
                @click="toggleBooleanSetting('sync', 'enabled')"
              >
                <span></span>
              </button>
            </div>

            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">状态</div>
                <div class="stat-value">{{ syncStatusLabel }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">上次同步</div>
                <div class="stat-value">{{ formatTime(syncState.lastSyncAt) }}</div>
              </div>
            </div>

            <div class="path-card">
              <div class="setting-name">同步文件</div>
              <div class="setting-hint">
                {{ syncState.path || '当前未检测到 iCloud Drive 目录' }}
              </div>
            </div>

            <div v-if="syncState.lastError" class="error-box">{{ syncState.lastError }}</div>

            <button class="primary-btn" :disabled="!settings.sync.enabled" @click="runSyncNow()">
              立即同步
            </button>
          </section>
        </template>

        <template v-else-if="tab === 'about'">
          <section class="group-card">
            <div class="group-title">版本信息</div>
            <div class="info-row">
              <span>当前版本</span>
              <strong>{{ appVersion }}</strong>
            </div>
            <div class="info-row">
              <span>数据库路径</span>
              <code>{{ dbPath }}</code>
            </div>
            <div class="info-row">
              <span>构建模式</span>
              <strong>Electron + Vue 3 + SQLite</strong>
            </div>
          </section>

          <section class="group-card">
            <div class="group-title">更新</div>
            <div class="setting-row">
              <div>
                <div class="setting-name">更新源 URL</div>
                <div class="setting-hint">指向包含 `latest-mac.yml` 与安装包的 HTTP 目录</div>
              </div>
              <input
                v-model="settings.general.updateFeedUrl"
                class="text-input"
                placeholder="https://updates.example.com/clipmate"
                @blur="persistSettings('已保存更新源')"
              />
            </div>
            <div class="info-row">
              <span>更新状态</span>
              <strong>{{ updateState.message || updateState.status }}</strong>
            </div>
            <div v-if="updateState.availableVersion" class="info-row">
              <span>可用版本</span>
              <strong>{{ updateState.availableVersion }}</strong>
            </div>
            <div v-if="typeof updateState.progress === 'number'" class="info-row">
              <span>下载进度</span>
              <strong>{{ Math.round(updateState.progress) }}%</strong>
            </div>

            <div class="manual-row">
              <button class="primary-btn" @click="checkUpdates()">检查更新</button>
              <button
                class="primary-btn"
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
            </div>
          </section>
        </template>
      </div>
    </main>
  </div>
</template>

<style scoped>
.settings-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  background:
    radial-gradient(circle at top left, rgba(0, 122, 255, 0.14), transparent 26%),
    radial-gradient(circle at bottom right, rgba(88, 86, 214, 0.1), transparent 24%),
    var(--bg-primary);
  color: var(--text-primary);
}

.settings-sidebar {
  padding: 28px 20px;
  border-right: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-surface) 86%, rgba(255, 255, 255, 0.04));
  backdrop-filter: blur(24px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 30px;
}

.brand-mark {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: linear-gradient(135deg, #007aff, #34c759);
  color: white;
  display: grid;
  place-items: center;
  font-weight: 700;
}

.brand-title {
  font-size: 16px;
  font-weight: 700;
}

.brand-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

.tab-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tab-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 14px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  transition: 0.18s ease;
}

.tab-btn:hover,
.tab-btn.active {
  color: var(--text-primary);
  background: var(--bg-card);
  border-color: var(--border-color);
}

.settings-main {
  min-width: 0;
  padding: 28px;
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
}

.page-sub {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}

.settings-toast {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 122, 255, 0.14);
  border: 1px solid rgba(0, 122, 255, 0.24);
  font-size: 12px;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-card {
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  background: color-mix(in srgb, var(--bg-card) 92%, rgba(255, 255, 255, 0.04));
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08);
}

.group-title,
.sub-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 14px;
}

.sub-title {
  margin-top: 18px;
}

.setting-row,
.shortcut-row,
.info-row {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-content: space-between;
  padding: 14px 0;
}

.setting-row + .setting-row,
.shortcut-row + .shortcut-row,
.info-row + .info-row {
  border-top: 1px solid var(--border-color);
}

.setting-name {
  font-size: 14px;
  font-weight: 600;
}

.setting-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.select,
.shortcut-input,
.text-input {
  min-width: 180px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  outline: none;
}

.shortcut-row {
  align-items: center;
}

.shortcut-input {
  width: 220px;
}

.state-pill {
  min-width: 92px;
  text-align: center;
  border-radius: 999px;
  padding: 8px 10px;
  font-size: 12px;
  background: rgba(52, 199, 89, 0.14);
  border: 1px solid rgba(52, 199, 89, 0.24);
}

.state-pill.ok {
  background: rgba(52, 199, 89, 0.14);
  border-color: rgba(52, 199, 89, 0.24);
}

.state-pill.warn {
  background: rgba(255, 149, 0, 0.14);
  border-color: rgba(255, 149, 0, 0.22);
}

.toggle {
  width: 52px;
  height: 32px;
  border-radius: 999px;
  border: none;
  padding: 4px;
  background: rgba(120, 120, 128, 0.24);
  cursor: pointer;
}

.toggle span {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: white;
  transition: transform 0.18s ease;
}

.toggle.on {
  background: #34c759;
}

.toggle.on span {
  transform: translateX(20px);
}

.manual-row,
.stats-grid,
.chip-grid,
.permission-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.manual-row {
  margin-bottom: 14px;
}

.permission-grid {
  align-items: stretch;
}

.text-input {
  flex: 1;
  min-width: 220px;
}

.app-chip,
.permission-card,
.path-card,
.stat-card {
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 14px;
}

.permission-card {
  flex: 1;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.permission-actions {
  margin-bottom: 0;
}

.app-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 260px;
}

.suggest-chip,
.ghost-btn,
.danger-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
}

.danger-btn {
  border-color: rgba(255, 59, 48, 0.24);
  color: #ff3b30;
}

.stats-grid {
  margin: 14px 0;
}

.stat-card {
  min-width: 180px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-value {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 700;
}

.path-card,
.error-box {
  margin-bottom: 14px;
}

.error-box {
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 59, 48, 0.12);
  border: 1px solid rgba(255, 59, 48, 0.2);
  color: #ff3b30;
  font-size: 12px;
}

.info-row code {
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .settings-shell {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .tab-list {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .settings-main {
    padding: 20px;
  }

  .shortcut-row,
  .setting-row,
  .info-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .shortcut-input,
  .select {
    width: 100%;
  }
}
</style>
