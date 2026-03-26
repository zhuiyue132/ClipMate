<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import UiIcon from './components/UiIcon.vue'
import type {
  ClipItem,
  HistoryMutationEvent,
  PreviewOpenMode,
  SettingsSnapshot,
  ThemePreference
} from '../../shared/types'

const previewItem = ref<ClipItem | null>(null)
const previewLoading = ref(false)
const editMode = ref(false)
const editText = ref('')
const linkEditMode = ref(false)
const linkDraft = ref('')
const renameOpen = ref(false)
const renameDraft = ref('')
const colorDraft = ref('#007AFF')
const toast = ref<string | null>(null)
const editAreaRef = ref<HTMLTextAreaElement | null>(null)
const linkEditRef = ref<HTMLInputElement | null>(null)

let toastTimer: number | null = null
let loadSeq = 0
let currentItemId: string | null = null
let unsubSettings: (() => void) | null = null
let unsubHistoryMutation: (() => void) | null = null
let unsubPreviewItem: (() => void) | null = null

function isTextEditableType(type: ClipItem['type'] | undefined): boolean {
  return type === 'text' || type === 'richtext'
}

function previewItemAffected(mutation: HistoryMutationEvent): boolean {
  if (!currentItemId) return false
  if (mutation.type === 'reset') return true
  if (mutation.type === 'delete') {
    return (mutation.ids ?? []).includes(currentItemId)
  }
  return (mutation.items ?? []).some((item) => item.id === currentItemId)
}

function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement
  if (theme === 'system') {
    delete root.dataset.theme
    return
  }

  root.dataset.theme = theme
}

function showToast(message: string): void {
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
    toastTimer = null
  }, 1800)
}

function typeLabel(type: ClipItem['type']): string {
  switch (type) {
    case 'text':
      return '文本'
    case 'richtext':
      return '富文本'
    case 'link':
      return '链接'
    case 'image':
      return '图片'
    case 'file':
      return '文件'
    case 'color':
      return '颜色'
    default:
      return '内容'
  }
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  return `${day} 天前`
}

const previewLinkMeta = computed(() => {
  const item = previewItem.value
  if (!item || item.type !== 'link' || !item.link_meta) return null
  try {
    const meta = JSON.parse(item.link_meta) as {
      title?: string
      description?: string
      image?: string
    }
    return meta
  } catch {
    return null
  }
})

const previewTitle = computed(() => previewItem.value?.title?.trim() ?? '')
const previewBodyEditing = computed(() => {
  const type = previewItem.value?.type
  return editMode.value && isTextEditableType(type)
})

function getFilePaths(item: ClipItem): string[] {
  if (item.type !== 'file') return []
  try {
    const parsed = JSON.parse(item.content) as { paths?: string[] }
    return parsed.paths ?? []
  } catch {
    return (item.plain_text ?? '')
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
  }
}

function currentPreviewMode(): PreviewOpenMode {
  return editMode.value || linkEditMode.value ? 'edit' : 'view'
}

function parsePreviewRequestFromHash(): { itemId: string; mode: PreviewOpenMode } | null {
  const [, query = ''] = window.location.hash.split('?')
  const params = new URLSearchParams(query)
  const itemId = params.get('itemId')
  if (!itemId) return null
  return {
    itemId,
    mode: params.get('mode') === 'edit' ? 'edit' : 'view'
  }
}

function updatePreviewHash(itemId: string, mode: PreviewOpenMode = currentPreviewMode()): void {
  const params = new URLSearchParams({ itemId, mode })
  const nextHash = `#/preview?${params.toString()}`
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, '', nextHash)
  }
}

async function focusActiveEditor(): Promise<void> {
  await nextTick()
  if (editMode.value) {
    editAreaRef.value?.focus()
    editAreaRef.value?.setSelectionRange(editText.value.length, editText.value.length)
    return
  }
  if (linkEditMode.value) {
    linkEditRef.value?.focus()
    linkEditRef.value?.setSelectionRange(linkDraft.value.length, linkDraft.value.length)
  }
}

function applyPreviewMode(item: ClipItem, mode: PreviewOpenMode): void {
  renameOpen.value = false

  if (mode === 'edit') {
    if (isTextEditableType(item.type)) {
      editMode.value = true
      linkEditMode.value = false
      editText.value = item.plain_text ?? item.content ?? ''
      updatePreviewHash(item.id, 'edit')
      void focusActiveEditor()
      return
    }

    if (item.type === 'link') {
      editMode.value = false
      linkEditMode.value = true
      linkDraft.value = item.content
      updatePreviewHash(item.id, 'edit')
      void focusActiveEditor()
      return
    }
  }

  editMode.value = false
  linkEditMode.value = false
  updatePreviewHash(item.id, 'view')
}

function hydratePreviewItem(item: ClipItem, preserveDrafts = false): void {
  previewItem.value = item

  if (!preserveDrafts || !editMode.value) {
    editText.value = item.plain_text ?? item.content ?? ''
  }
  if (!preserveDrafts || !linkEditMode.value) {
    linkDraft.value = item.content
  }
  if (!preserveDrafts || !renameOpen.value) {
    renameDraft.value = item.title ?? ''
  }
  if (item.type === 'color') {
    colorDraft.value = item.content
  }
}

async function loadPreviewItem(
  itemId: string,
  options: { preserveDrafts?: boolean; closeWhenMissing?: boolean; mode?: PreviewOpenMode } = {}
): Promise<void> {
  const seq = ++loadSeq
  previewLoading.value = true

  try {
    const item = await window.api.getClipItem(itemId)
    if (seq !== loadSeq) return

    if (!item) {
      if (options.closeWhenMissing) {
        window.api.closeCurrentWindow()
      } else {
        showToast('条目不存在')
      }
      return
    }

    currentItemId = item.id
    if (options.mode) {
      applyPreviewMode(item, options.mode)
    } else {
      updatePreviewHash(item.id)
    }
    if (
      previewItem.value &&
      previewItem.value.id === item.id &&
      previewItem.value.updated_at === item.updated_at
    ) {
      return
    }
    hydratePreviewItem(item, options.preserveDrafts)
  } finally {
    if (seq === loadSeq) {
      previewLoading.value = false
    }
  }
}

async function refreshPreviewItem(preserveDrafts = false): Promise<void> {
  if (!currentItemId) return
  await loadPreviewItem(currentItemId, { preserveDrafts, closeWhenMissing: true })
}

function closePreviewWindow(): void {
  window.api.closeCurrentWindow()
}

async function copyPreview(plainText = true): Promise<void> {
  const item = previewItem.value
  if (!item) return
  await window.api.copyClipItem(item.id, { plainText })
  showToast('已复制')
}

async function pastePreview(plainText = false): Promise<void> {
  const item = previewItem.value
  if (!item) return
  await window.api.pasteClipItem(item.id, { plainText })
  closePreviewWindow()
}

function toggleEdit(): void {
  const item = previewItem.value
  if (!item || !isTextEditableType(item.type)) return
  linkEditMode.value = false
  editMode.value = !editMode.value
  if (editMode.value) {
    editText.value = item.plain_text ?? item.content ?? ''
    updatePreviewHash(item.id, 'edit')
    void focusActiveEditor()
  } else {
    updatePreviewHash(item.id, 'view')
  }
}

function toggleLinkEdit(): void {
  const item = previewItem.value
  if (!item || item.type !== 'link') return
  editMode.value = false
  linkEditMode.value = !linkEditMode.value
  if (linkEditMode.value) {
    linkDraft.value = item.content
    updatePreviewHash(item.id, 'edit')
    void focusActiveEditor()
  } else {
    updatePreviewHash(item.id, 'view')
  }
}

function toggleRename(): void {
  const item = previewItem.value
  if (!item) return
  renameOpen.value = !renameOpen.value
  if (renameOpen.value) {
    renameDraft.value = item.title ?? ''
  }
}

async function saveRename(): Promise<void> {
  const item = previewItem.value
  if (!item) return
  await window.api.updateClipItemTitle(item.id, renameDraft.value || null)
  await refreshPreviewItem()
  renameOpen.value = false
  showToast('已保存名称')
}

function onRenameInputKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || isComposingEvent(event)) {
    return
  }

  event.preventDefault()
  void saveRename()
}

async function saveTextEdit(): Promise<void> {
  const item = previewItem.value
  if (!item) return
  await window.api.updateClipItemText(item.id, editText.value)
  await refreshPreviewItem()
  editMode.value = false
  updatePreviewHash(item.id, 'view')
  showToast('已保存文本')
}

async function saveLinkEdit(): Promise<void> {
  const item = previewItem.value
  if (!item || item.type !== 'link') return
  await window.api.updateClipItemLink(item.id, linkDraft.value)
  await refreshPreviewItem()
  linkEditMode.value = false
  updatePreviewHash(item.id, 'view')
  showToast('已更新链接')
}

async function saveColor(): Promise<void> {
  const item = previewItem.value
  if (!item) return
  await window.api.updateClipItemColor(item.id, colorDraft.value)
  await refreshPreviewItem()
  showToast('已更新颜色')
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = dataUrl
  })
}

async function rotateImage(direction: 'left' | 'right'): Promise<void> {
  const item = previewItem.value
  if (!item || item.type !== 'image') return

  const img = await loadImage(`data:image/png;base64,${item.content}`)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = img.height
  canvas.height = img.width

  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(direction === 'right' ? Math.PI / 2 : -Math.PI / 2)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)

  const rotatedDataUrl = canvas.toDataURL('image/png')
  const contentBase64 = dataUrlToBase64(rotatedDataUrl)

  const thumbCanvas = document.createElement('canvas')
  const thumbCtx = thumbCanvas.getContext('2d')
  if (!thumbCtx) return
  const thumbWidth = 320
  const scale = thumbWidth / canvas.width
  thumbCanvas.width = thumbWidth
  thumbCanvas.height = Math.max(1, Math.round(canvas.height * scale))
  thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
  const thumbnailBase64 = dataUrlToBase64(thumbCanvas.toDataURL('image/png'))

  await window.api.updateClipItemImage(item.id, { contentBase64, thumbnailBase64 })
  await refreshPreviewItem()
  showToast('已旋转图片')
}

async function extractOcr(mode: 'copy' | 'create'): Promise<void> {
  const item = previewItem.value
  if (!item || item.type !== 'image') return

  const result = await window.api.extractImageOcr(item.id, mode)
  if (!result.text) {
    showToast('OCR 结果尚未就绪')
    return
  }

  await refreshPreviewItem()
  showToast(mode === 'copy' ? '已复制 OCR 文字' : '已创建文本条目')
}

async function quickLook(path: string): Promise<void> {
  await window.api.quickLookFile(path)
}

async function pasteImageAsFile(id: string): Promise<void> {
  await window.api.pasteClipItemAsFile(id)
  closePreviewWindow()
}

function onItemDragStart(event: DragEvent, item: ClipItem): void {
  if (item.type !== 'image') {
    event.preventDefault()
    return
  }

  event.dataTransfer?.setData('text/plain', item.id)
  window.api.startImageDrag(item.id)
}

async function deletePreviewItem(): Promise<void> {
  const item = previewItem.value
  if (!item) return
  const ok = window.confirm('确定删除该条目？')
  if (!ok) return
  await window.api.deleteClipItem(item.id)
  closePreviewWindow()
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || Boolean(el.isContentEditable)
}

function isTypingContext(target: EventTarget | null): boolean {
  return isTypingTarget(target) || isTypingTarget(document.activeElement)
}

function isComposingEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.key === 'Process' || event.keyCode === 229
}

function onWindowKeyDown(event: KeyboardEvent): void {
  if (isComposingEvent(event)) {
    return
  }

  const typing = isTypingContext(event.target)

  if (event.key === 'Escape') {
    event.preventDefault()
    closePreviewWindow()
    return
  }

  if (!typing && event.key === ' ') {
    event.preventDefault()
    closePreviewWindow()
    return
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    if (editMode.value) {
      event.preventDefault()
      void saveTextEdit()
    } else if (linkEditMode.value) {
      event.preventDefault()
      void saveLinkEdit()
    }
    return
  }

  if (!typing && event.key === 'Enter' && previewItem.value) {
    event.preventDefault()
    void pastePreview(false)
  }
}

onMounted(async () => {
  const snapshot = (await window.api.getSettingsSnapshot()) as SettingsSnapshot
  applyTheme(snapshot.settings.general.theme)

  unsubSettings = window.api.onSettingsChanged((nextSnapshot) => {
    applyTheme(nextSnapshot.settings.general.theme)
  })
  unsubHistoryMutation = window.api.onHistoryMutation((mutation) => {
    if (previewItemAffected(mutation)) {
      void refreshPreviewItem(true)
    }
  })
  unsubPreviewItem = window.api.onPreviewItemRequested((request) => {
    void loadPreviewItem(request.itemId, { mode: request.mode })
  })
  window.addEventListener('keydown', onWindowKeyDown)

  const initialRequest = parsePreviewRequestFromHash()
  if (!initialRequest) {
    closePreviewWindow()
    return
  }

  await loadPreviewItem(initialRequest.itemId, {
    closeWhenMissing: true,
    mode: initialRequest.mode
  })
})

onBeforeUnmount(() => {
  unsubSettings?.()
  unsubHistoryMutation?.()
  unsubPreviewItem?.()
  window.removeEventListener('keydown', onWindowKeyDown)
  if (toastTimer) {
    window.clearTimeout(toastTimer)
  }
})
</script>

<template>
  <div class="preview-shell">
    <div class="preview-window preview-window-standalone">
      <div class="preview-header">
        <div class="preview-left">
          <div class="badge">
            {{ previewItem ? typeLabel(previewItem.type) : '预览' }}
          </div>
          <div class="preview-meta">
            <div v-if="previewTitle" class="preview-title">{{ previewTitle }}</div>
            <div class="preview-sub">
              {{
                previewItem
                  ? `${previewItem.source_app_name || '未知来源'} · ${formatRelativeTime(
                      previewItem.created_at
                    )}`
                  : ''
              }}
            </div>
          </div>
        </div>

        <div class="preview-actions">
          <button class="icon-btn" title="复制" @click="copyPreview(true)">
            <UiIcon name="copy" :size="18" :stroke-width="1.9" />
          </button>
          <button class="icon-btn" title="粘贴" @click="pastePreview(false)">
            <UiIcon name="paste" :size="18" :stroke-width="1.9" />
          </button>
          <button
            v-if="previewItem && (previewItem.type === 'text' || previewItem.type === 'richtext')"
            class="icon-btn"
            :class="{ active: editMode }"
            title="编辑"
            @click="toggleEdit()"
          >
            <UiIcon name="edit" :size="18" :stroke-width="1.9" />
          </button>
          <button v-if="editMode" class="icon-btn" title="保存" @click="saveTextEdit()">
            <UiIcon name="save" :size="18" :stroke-width="1.9" />
          </button>
          <button
            v-if="previewItem?.type === 'link'"
            class="icon-btn"
            :class="{ active: linkEditMode }"
            title="编辑链接"
            @click="toggleLinkEdit()"
          >
            <UiIcon name="link" :size="18" :stroke-width="1.9" />
          </button>
          <button v-if="linkEditMode" class="icon-btn" title="保存链接" @click="saveLinkEdit()">
            <UiIcon name="save" :size="18" :stroke-width="1.9" />
          </button>
          <button
            class="icon-btn"
            :class="{ active: renameOpen }"
            title="重命名"
            @click="toggleRename()"
          >
            <UiIcon name="tag" :size="18" :stroke-width="1.9" />
          </button>
          <button class="icon-btn danger" title="删除" @click="deletePreviewItem()">
            <UiIcon name="trash" :size="18" :stroke-width="1.9" />
          </button>
          <button class="icon-btn" title="关闭" @click="closePreviewWindow()">
            <UiIcon name="close" :size="18" :stroke-width="1.9" />
          </button>
        </div>
      </div>

      <div class="preview-body" :class="{ 'preview-body-editing': previewBodyEditing }">
        <div v-if="previewLoading" class="preview-loading">加载中…</div>

        <template v-else-if="previewItem">
          <div v-if="renameOpen" class="rename-row">
            <input
              v-model="renameDraft"
              class="rename-input"
              placeholder="名称（可选）"
              @keydown="onRenameInputKeyDown"
            />
            <button class="primary-btn" @click="saveRename()">保存</button>
          </div>

          <template v-if="previewItem.type === 'text' || previewItem.type === 'richtext'">
            <textarea
              v-if="editMode"
              ref="editAreaRef"
              v-model="editText"
              class="edit-area"
            ></textarea>
            <pre v-else class="preview-text">{{
              previewItem.plain_text || previewItem.content
            }}</pre>
          </template>

          <template v-else-if="previewItem.type === 'link'">
            <div v-if="linkEditMode" class="rename-row">
              <input
                ref="linkEditRef"
                v-model="linkDraft"
                class="rename-input"
                placeholder="https://example.com"
              />
              <button class="primary-btn" @click="saveLinkEdit()">保存链接</button>
            </div>
            <div v-if="previewLinkMeta" class="link-meta-card">
              <img
                v-if="previewLinkMeta.image"
                class="link-thumb"
                :src="previewLinkMeta.image"
                alt=""
              />
              <div class="link-meta-text">
                <div class="link-title">{{ previewLinkMeta.title || previewItem.content }}</div>
                <div v-if="previewLinkMeta.description" class="link-desc">
                  {{ previewLinkMeta.description }}
                </div>
              </div>
            </div>
            <webview class="webview" :src="previewItem.content"></webview>
          </template>

          <template v-else-if="previewItem.type === 'image'">
            <div class="image-preview-lg">
              <img
                :src="`data:image/png;base64,${previewItem.content}`"
                alt=""
                draggable="true"
                @dragstart="onItemDragStart($event, previewItem)"
              />
            </div>
            <div class="image-tools">
              <button class="tool-btn" @click="rotateImage('left')">⟲</button>
              <button class="tool-btn" @click="rotateImage('right')">⟳</button>
              <button class="tool-btn" @click="pasteImageAsFile(previewItem.id)">文件粘贴</button>
            </div>
            <div class="ocr-card">
              <div class="ocr-head">
                <span>OCR 识别</span>
                <span class="hint">{{ previewItem.ocr_text ? '已完成' : '识别中…' }}</span>
              </div>
              <pre v-if="previewItem.ocr_text" class="ocr-text">{{ previewItem.ocr_text }}</pre>
              <div v-else class="ocr-empty">后台识别完成后会显示在这里</div>
              <div class="ocr-actions">
                <button
                  class="primary-btn"
                  :disabled="!previewItem.ocr_text"
                  @click="extractOcr('copy')"
                >
                  复制文字
                </button>
                <button
                  class="tool-btn"
                  :disabled="!previewItem.ocr_text"
                  @click="extractOcr('create')"
                >
                  转为文本条目
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="previewItem.type === 'color'">
            <div class="color-preview-lg" :style="{ background: colorDraft }">
              <div class="color-value">{{ colorDraft }}</div>
            </div>
            <div class="color-tools">
              <input v-model="colorDraft" type="color" class="color-input" />
              <button class="primary-btn" @click="saveColor()">保存</button>
            </div>
          </template>

          <template v-else-if="previewItem.type === 'file'">
            <div class="file-list">
              <div v-for="path in getFilePaths(previewItem)" :key="path" class="file-row">
                <span>{{ path }}</span>
                <button class="tool-btn small" @click="quickLook(path)">Quick Look</button>
              </div>
            </div>
          </template>
        </template>
      </div>

      <div class="preview-footer">
        <span class="hint">空格 / ESC 关闭（输入时除外）</span>
        <span v-if="editMode || linkEditMode" class="hint">⌘S 保存</span>
        <span v-if="renameOpen" class="hint">回车保存名称</span>
        <span v-else-if="!editMode && !linkEditMode" class="hint">回车直接粘贴</span>
      </div>
    </div>

    <div v-if="toast" class="toast preview-toast">{{ toast }}</div>
  </div>
</template>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
}

.preview-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  padding: 12px;
  display: flex;
  min-height: 0;
}

.preview-window-standalone {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-window-standalone .preview-header {
  -webkit-app-region: drag;
}

.preview-window-standalone .preview-actions {
  -webkit-app-region: no-drag;
}

.preview-window-standalone .preview-body {
  flex: 1;
  min-height: 0;
}

.preview-window-standalone .preview-body.preview-body-editing {
  overflow: hidden;
}

.preview-window-standalone .edit-area {
  flex: 1;
  min-height: 0;
  height: auto;
}

.preview-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-toast {
  position: fixed;
  left: 12px;
  bottom: 12px;
}
</style>
