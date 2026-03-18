import { clipboard, nativeImage } from 'electron'
import type { ClipItem } from '../../shared/types'

export function writeClipItemToClipboard(item: ClipItem, options: { plainText: boolean }): void {
  if (item.type === 'image') {
    const buffer = Buffer.from(item.content, 'base64')
    const image = nativeImage.createFromBuffer(buffer)
    clipboard.writeImage(image)
    return
  }

  if (item.type === 'richtext' && !options.plainText) {
    clipboard.write({
      html: item.content,
      text: item.plain_text ?? ''
    })
    return
  }

  clipboard.writeText(item.plain_text ?? item.content ?? '')
}
