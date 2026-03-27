<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import UiIcon from './components/UiIcon.vue'
import ToastNotice from './components/panel/ToastNotice.vue'
import PreviewContentSection from './components/preview/PreviewContentSection.vue'
import PreviewFooterBar from './components/preview/PreviewFooterBar.vue'
import PreviewHeaderBar from './components/preview/PreviewHeaderBar.vue'
import PreviewMetaList from './components/preview/PreviewMetaList.vue'
import PreviewShell from './components/preview/PreviewShell.vue'
import FeedbackBanner from './components/shared/FeedbackBanner.vue'
import InlineActionGroup from './components/shared/InlineActionGroup.vue'
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

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
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
const previewSceneEditing = computed(() => previewBodyEditing.value || linkEditMode.value)

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

function defaultPreviewTitle(item: ClipItem): string {
  if (item.type === 'link') return previewLinkMeta.value?.title || item.content
  if (item.type === 'file') {
    const count = getFilePaths(item).length
    return count > 1 ? `${count} 个文件` : getFilePaths(item)[0] || '文件'
  }
  if (item.type === 'image') return item.title?.trim() || '图片条目'
  if (item.type === 'color') return item.content
  return item.plain_text?.trim()?.slice(0, 48) || item.content?.trim()?.slice(0, 48) || '未命名条目'
}

const previewDisplayTitle = computed(() => {
  const item = previewItem.value
  if (!item) return '预览'
  return previewTitle.value || defaultPreviewTitle(item)
})

const previewHeaderSubtitle = computed(() => {
  const item = previewItem.value
  if (!item) return ''
  return `${item.source_app_name || '未知来源'} · ${formatRelativeTime(item.created_at)}`
})

const previewModeLabel = computed(() => {
  if (renameOpen.value) return '重命名'
  if (previewSceneEditing.value) return '编辑中'
  return '浏览'
})

const previewAccentLabel = computed(() => {
  const item = previewItem.value
  if (!item) return ''
  if (item.type === 'image' && item.ocr_text) return 'OCR 已完成'
  if (item.type === 'link' && previewLinkMeta.value?.description) return '含摘要'
  if (item.type === 'file' && getFilePaths(item).length > 1) return '多文件'
  if (item.type === 'color') return '可编辑'
  return ''
})

const previewMetaRows = computed(() => {
  const item = previewItem.value
  if (!item) return []

  const rows = [
    {
      key: 'source',
      label: '来源应用',
      value: item.source_app_name || item.source_app || '未知来源'
    },
    {
      key: 'created',
      label: '创建时间',
      value: formatDateTime(item.created_at)
    },
    {
      key: 'updated',
      label: '更新时间',
      value: formatDateTime(item.updated_at)
    }
  ]

  if (item.type === 'link') {
    rows.push({ key: 'url', label: '链接地址', value: item.content })
  } else if (item.type === 'file') {
    rows.push({
      key: 'files',
      label: '文件数量',
      value: `${getFilePaths(item).length || 0}`
    })
  } else if (item.type === 'image') {
    rows.push({
      key: 'ocr',
      label: 'OCR 状态',
      value: item.ocr_text ? '已完成' : '后台处理中'
    })
  } else if (item.type === 'color') {
    rows.push({ key: 'value', label: '颜色值', value: colorDraft.value })
  }

  return rows
})

const previewFooterHints = computed(() => {
  const hints = ['空格 / ESC 关闭（输入时除外）']
  if (editMode.value || linkEditMode.value) hints.push('⌘S 保存')
  if (renameOpen.value) hints.push('回车保存名称')
  if (!editMode.value && !linkEditMode.value) hints.push('回车直接粘贴')
  if (previewItem.value?.type === 'image') hints.push('支持拖出图片')
  return hints
})

const previewFilePaths = computed(() => {
  const item = previewItem.value
  return item ? getFilePaths(item) : []
})

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
  <PreviewShell>
    <template #header>
      <PreviewHeaderBar
        :kind-label="previewItem ? typeLabel(previewItem.type) : '预览'"
        :mode-label="previewModeLabel"
        :title="previewDisplayTitle"
        :subtitle="previewHeaderSubtitle"
        :accent-label="previewAccentLabel"
      >
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
      </PreviewHeaderBar>
    </template>

    <div class="preview-body" :class="{ 'preview-body-editing': previewSceneEditing }">
      <div v-if="previewLoading" class="preview-loading-state">
        <FeedbackBanner
          tone="accent"
          title="正在载入预览"
          message="正在准备条目内容与操作状态。"
          compact
        />
      </div>

      <template v-else-if="previewItem">
        <FeedbackBanner
          v-if="renameOpen"
          tone="accent"
          compact
          title="编辑名称"
          message="名称只影响展示，不会改动原始剪贴板内容。"
        >
          <div class="preview-inline-editor">
            <input
              v-model="renameDraft"
              class="rename-input preview-inline-editor__field"
              placeholder="名称（可选）"
              @keydown="onRenameInputKeyDown"
            />
            <InlineActionGroup align="end" class="preview-inline-editor__actions">
              <button class="secondary-btn" @click="renameOpen = false">取消</button>
              <button class="primary-btn" @click="saveRename()">保存名称</button>
            </InlineActionGroup>
          </div>
        </FeedbackBanner>

        <div class="preview-scene" :class="[`preview-scene--${previewItem.type}`]">
          <div class="preview-scene__main">
            <template v-if="previewItem.type === 'text' || previewItem.type === 'richtext'">
              <PreviewContentSection
                :eyebrow="previewItem.type === 'richtext' ? 'Rich Text' : 'Text'"
                :title="editMode ? '编辑文本内容' : '文本预览'"
                :description="editMode ? '你可以直接修改文本并保存。' : '当前条目的正文内容。'"
                :tone="editMode ? 'accent' : 'default'"
              >
                <textarea
                  v-if="editMode"
                  ref="editAreaRef"
                  v-model="editText"
                  class="edit-area preview-editor-area"
                ></textarea>
                <pre v-else class="preview-text preview-rich-block">{{
                  previewItem.plain_text || previewItem.content
                }}</pre>
              </PreviewContentSection>
            </template>

            <template v-else-if="previewItem.type === 'link'">
              <PreviewContentSection
                eyebrow="Link"
                :title="linkEditMode ? '编辑链接地址' : '链接概览'"
                :description="
                  linkEditMode
                    ? '更新地址后会保留同一条历史记录。'
                    : '预览链接元数据与可嵌入的网页内容。'
                "
                :tone="linkEditMode ? 'accent' : 'default'"
              >
                <div
                  v-if="linkEditMode"
                  class="preview-inline-editor preview-inline-editor--stacked"
                >
                  <input
                    ref="linkEditRef"
                    v-model="linkDraft"
                    class="rename-input preview-inline-editor__field"
                    placeholder="https://example.com"
                  />
                  <InlineActionGroup align="end" class="preview-inline-editor__actions">
                    <button class="secondary-btn" @click="toggleLinkEdit()">取消</button>
                    <button class="primary-btn" @click="saveLinkEdit()">保存链接</button>
                  </InlineActionGroup>
                </div>

                <div v-if="previewLinkMeta" class="link-meta-card preview-link-meta">
                  <img
                    v-if="previewLinkMeta.image"
                    class="link-thumb"
                    :src="previewLinkMeta.image"
                    alt=""
                  />
                  <div class="link-meta-text">
                    <div class="link-title">{{ previewLinkMeta.title || previewItem.content }}</div>
                    <div class="preview-link-url">{{ previewItem.content }}</div>
                    <div v-if="previewLinkMeta.description" class="link-desc">
                      {{ previewLinkMeta.description }}
                    </div>
                  </div>
                </div>
                <div
                  v-else
                  class="feedback-banner feedback-banner--neutral feedback-banner--compact"
                >
                  <div class="feedback-banner__body">
                    <div class="feedback-banner__title">链接元数据尚未完整</div>
                    <div class="feedback-banner__message">仍可直接编辑、复制或粘贴该链接。</div>
                  </div>
                </div>
              </PreviewContentSection>

              <PreviewContentSection
                eyebrow="Web"
                title="网页预览"
                description="嵌入式预览保持只读。"
                compact
              >
                <webview class="webview" :src="previewItem.content"></webview>
              </PreviewContentSection>
            </template>

            <template v-else-if="previewItem.type === 'image'">
              <PreviewContentSection
                eyebrow="Image"
                title="图片预览"
                description="支持旋转、拖出与文件粘贴。"
              >
                <div class="image-preview-lg preview-image-frame">
                  <img
                    :src="`data:image/png;base64,${previewItem.content}`"
                    alt=""
                    draggable="true"
                    @dragstart="onItemDragStart($event, previewItem)"
                  />
                </div>

                <template #footer>
                  <InlineActionGroup align="start">
                    <button class="tool-btn" @click="rotateImage('left')">向左旋转</button>
                    <button class="tool-btn" @click="rotateImage('right')">向右旋转</button>
                    <button class="tool-btn" @click="pasteImageAsFile(previewItem.id)">
                      作为文件粘贴
                    </button>
                  </InlineActionGroup>
                </template>
              </PreviewContentSection>

              <PreviewContentSection
                eyebrow="OCR"
                title="文字识别"
                :description="
                  previewItem.ocr_text
                    ? '识别结果已就绪，可直接复制或转为文本条目。'
                    : 'OCR 在后台进行，完成后会自动刷新。'
                "
                :tone="previewItem.ocr_text ? 'accent' : 'muted'"
              >
                <pre v-if="previewItem.ocr_text" class="ocr-text">{{ previewItem.ocr_text }}</pre>
                <div v-else class="ocr-empty">后台识别完成后会显示在这里</div>

                <template #footer>
                  <InlineActionGroup align="start">
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
                  </InlineActionGroup>
                </template>
              </PreviewContentSection>
            </template>

            <template v-else-if="previewItem.type === 'color'">
              <PreviewContentSection
                eyebrow="Color"
                title="颜色样本"
                description="保存后会更新该颜色条目的内容。"
                tone="accent"
              >
                <div class="color-preview-lg" :style="{ background: colorDraft }">
                  <div class="color-value">{{ colorDraft }}</div>
                </div>

                <template #footer>
                  <InlineActionGroup align="start">
                    <input v-model="colorDraft" type="color" class="color-input" />
                    <button class="primary-btn" @click="saveColor()">保存颜色</button>
                  </InlineActionGroup>
                </template>
              </PreviewContentSection>
            </template>

            <template v-else-if="previewItem.type === 'file'">
              <PreviewContentSection
                eyebrow="Files"
                :title="
                  previewFilePaths.length > 1 ? `${previewFilePaths.length} 个文件` : '文件预览'
                "
                description="支持逐项 Quick Look。"
              >
                <div class="file-list">
                  <div v-for="path in previewFilePaths" :key="path" class="file-row">
                    <span>{{ path }}</span>
                    <button class="tool-btn small" @click="quickLook(path)">Quick Look</button>
                  </div>
                </div>
              </PreviewContentSection>
            </template>
          </div>

          <aside class="preview-scene__side">
            <PreviewContentSection
              eyebrow="Metadata"
              title="条目详情"
              description="来源、时间与类型相关信息。"
              tone="muted"
              compact
            >
              <PreviewMetaList :rows="previewMetaRows" />
            </PreviewContentSection>

            <PreviewContentSection
              eyebrow="Actions"
              title="常用操作"
              description="保持不同类型条目的动作层级一致。"
              compact
            >
              <InlineActionGroup align="start" class="preview-side-actions">
                <button class="ghost-btn" @click="copyPreview(true)">复制文本</button>
                <button class="ghost-btn" @click="pastePreview(false)">直接粘贴</button>
                <button
                  v-if="previewItem.type === 'image'"
                  class="ghost-btn"
                  @click="pasteImageAsFile(previewItem.id)"
                >
                  粘贴为文件
                </button>
                <button
                  v-if="previewItem.type === 'link'"
                  class="ghost-btn"
                  @click="toggleLinkEdit()"
                >
                  {{ linkEditMode ? '结束编辑' : '编辑链接' }}
                </button>
                <button
                  v-if="previewItem.type === 'text' || previewItem.type === 'richtext'"
                  class="ghost-btn"
                  @click="toggleEdit()"
                >
                  {{ editMode ? '结束编辑' : '编辑文本' }}
                </button>
              </InlineActionGroup>
            </PreviewContentSection>
          </aside>
        </div>
      </template>
    </div>

    <template #footer>
      <PreviewFooterBar :hints="previewFooterHints">
        <template #actions>
          <button v-if="renameOpen" class="primary-btn compact" @click="saveRename()">
            保存名称
          </button>
          <button v-else-if="editMode" class="primary-btn compact" @click="saveTextEdit()">
            保存文本
          </button>
          <button v-else-if="linkEditMode" class="primary-btn compact" @click="saveLinkEdit()">
            保存链接
          </button>
          <button v-else class="secondary-btn compact" @click="closePreviewWindow()">关闭</button>
        </template>
      </PreviewFooterBar>
    </template>

    <template #feedback>
      <ToastNotice v-if="toast" :message="toast" />
    </template>
  </PreviewShell>
</template>

<style>
.preview-shell--native {
  position: relative;
  width: 100vw;
  height: 100vh;
  padding: 12px;
  display: flex;
  min-height: 0;
}

.preview-shell__window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-shell__content {
  flex: 1;
  min-height: 0;
  display: flex;
}

.preview-shell__feedback {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.preview-shell__feedback .toast {
  pointer-events: auto;
}

.preview-window-standalone .preview-header {
  -webkit-app-region: drag;
}

.preview-window-standalone .preview-actions,
.preview-window-standalone .preview-footer,
.preview-window-standalone .preview-body,
.preview-window-standalone .preview-shell__content {
  -webkit-app-region: no-drag;
}

.preview-header--native {
  align-items: flex-start;
}

.preview-header__summary,
.preview-header__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-header__badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-header__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-header__subtitle {
  max-width: 100%;
}

.preview-header__actions {
  max-width: min(44vw, 420px);
}

.preview-loading-state {
  width: 100%;
}

.preview-inline-editor {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.preview-inline-editor--stacked {
  flex-direction: column;
  align-items: stretch;
}

.preview-inline-editor__field {
  flex: 1;
}

.preview-inline-editor__actions {
  flex: 0 0 auto;
}

.preview-scene {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
  gap: 14px;
}

.preview-scene__main,
.preview-scene__side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  padding-right: 2px;
}

.preview-rich-block {
  min-height: 220px;
}

.preview-editor-area {
  flex: 1;
  min-height: 280px;
}

.preview-link-meta {
  align-items: stretch;
}

.preview-link-url {
  font-size: var(--font-footnote);
  line-height: 1.45;
  color: var(--text-tertiary);
  word-break: break-all;
}

.preview-image-frame {
  min-height: 260px;
}

.preview-side-actions {
  align-items: flex-start;
}

.preview-footer--native {
  align-items: center;
}

.preview-footer__hints {
  min-width: 0;
  flex: 1;
}

.preview-footer__hint {
  max-width: 100%;
}

.preview-footer__actions {
  flex: 0 0 auto;
}

@media (max-width: 1080px) {
  .preview-scene {
    grid-template-columns: 1fr;
  }

  .preview-header__actions {
    max-width: none;
  }
}

@media (max-width: 760px) {
  .preview-shell--native {
    padding: 8px;
  }

  .preview-header,
  .preview-footer,
  .preview-body {
    padding-left: 12px;
    padding-right: 12px;
  }

  .preview-footer--native,
  .preview-header--native {
    flex-direction: column;
    align-items: stretch;
  }

  .preview-header__actions,
  .preview-footer__actions {
    width: 100%;
    justify-content: flex-start;
  }

  .webview {
    min-height: 280px;
  }
}
</style>
