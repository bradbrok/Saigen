import type { CircuitDocument } from './types'

export function serializeProject(document: CircuitDocument): string {
  return JSON.stringify(document, null, 2)
}

export function parseProject(source: string): CircuitDocument {
  const parsed = JSON.parse(source) as Partial<CircuitDocument>

  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.id !== 'string' ||
    typeof parsed.title !== 'string' ||
    !Array.isArray(parsed.components) ||
    !Array.isArray(parsed.connections)
  ) {
    throw new Error('This is not a supported Saigen project file')
  }

  return parsed as CircuitDocument
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function safeFileStem(value: string): string {
  const stem = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return stem || 'saigen-project'
}
