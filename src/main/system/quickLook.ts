import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function quickLookFile(filePath: string): Promise<void> {
  if (process.platform !== 'darwin') return
  await execFileAsync('qlmanage', ['-p', filePath], {
    timeout: 15_000
  })
}
