/**
 * JSON export/import for backup and portability.
 *
 * The payload is intentionally plain data: a small wrapper object with a version
 * string and the raw `characterSchema` shape. No derived values are included, since
 * those are recomputed on import and would only risk going stale.
 */
import type { Character } from '../state/schema'

export const EXPORT_VERSION = 1

export interface CharacterExportFile {
  app: 'dend'
  version: number
  characters: Character[]
}

export function serialize(characters: Character[]): string {
  const payload: CharacterExportFile = {
    app: 'dend',
    version: EXPORT_VERSION,
    characters,
  }
  return JSON.stringify(payload, null, 2)
}

export function unsupportedVersion(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const candidate = payload as Record<string, unknown>
  return typeof candidate.app === 'string' && typeof candidate.version === 'number' && candidate.version !== EXPORT_VERSION
}

export function download(characters: Character[], filename = 'dend-characters.json'): void {
  const blob = new Blob([serialize(characters)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function downloadMarkdown(markdown: string, filename = 'character.md'): void {
  const blob = new Blob([markdown], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}