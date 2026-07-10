export interface ZipEntry {
  path: string
  content: string | Uint8Array
}

interface EncodedZipEntry {
  path: string
  name: Uint8Array
  content: Uint8Array
  checksum: number
  offset: number
}

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const VERSION_2_0 = 20
const UTF8_FLAG = 0x0800
const STORE_METHOD = 0
const FIXED_DOS_TIME = 0
const FIXED_DOS_DATE = 0x0021 // 1980-01-01, the earliest date representable by ZIP.
const MAX_UINT16 = 0xffff
const MAX_UINT32 = 0xffffffff

const textEncoder = new TextEncoder()

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let checksum = 0xffffffff
  for (const byte of bytes) {
    checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8)
  }
  return (checksum ^ 0xffffffff) >>> 0
}

function assertValidPath(path: string): void {
  const segments = path.split('/')
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid ZIP entry path: ${JSON.stringify(path)}`)
  }
}

function assertUint32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new Error(`${label} exceeds the non-ZIP64 archive limit`)
  }
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}

function writeLocalHeader(
  archive: Uint8Array,
  view: DataView,
  entry: EncodedZipEntry,
): number {
  const offset = entry.offset
  writeUint32(view, offset, LOCAL_FILE_HEADER_SIGNATURE)
  writeUint16(view, offset + 4, VERSION_2_0)
  writeUint16(view, offset + 6, UTF8_FLAG)
  writeUint16(view, offset + 8, STORE_METHOD)
  writeUint16(view, offset + 10, FIXED_DOS_TIME)
  writeUint16(view, offset + 12, FIXED_DOS_DATE)
  writeUint32(view, offset + 14, entry.checksum)
  writeUint32(view, offset + 18, entry.content.byteLength)
  writeUint32(view, offset + 22, entry.content.byteLength)
  writeUint16(view, offset + 26, entry.name.byteLength)
  writeUint16(view, offset + 28, 0)

  const nameOffset = offset + 30
  archive.set(entry.name, nameOffset)
  const contentOffset = nameOffset + entry.name.byteLength
  archive.set(entry.content, contentOffset)
  return contentOffset + entry.content.byteLength
}

function writeCentralDirectoryHeader(
  archive: Uint8Array,
  view: DataView,
  offset: number,
  entry: EncodedZipEntry,
): number {
  writeUint32(view, offset, CENTRAL_DIRECTORY_HEADER_SIGNATURE)
  writeUint16(view, offset + 4, VERSION_2_0)
  writeUint16(view, offset + 6, VERSION_2_0)
  writeUint16(view, offset + 8, UTF8_FLAG)
  writeUint16(view, offset + 10, STORE_METHOD)
  writeUint16(view, offset + 12, FIXED_DOS_TIME)
  writeUint16(view, offset + 14, FIXED_DOS_DATE)
  writeUint32(view, offset + 16, entry.checksum)
  writeUint32(view, offset + 20, entry.content.byteLength)
  writeUint32(view, offset + 24, entry.content.byteLength)
  writeUint16(view, offset + 28, entry.name.byteLength)
  writeUint16(view, offset + 30, 0)
  writeUint16(view, offset + 32, 0)
  writeUint16(view, offset + 34, 0)
  writeUint16(view, offset + 36, 0)
  writeUint32(view, offset + 38, 0)
  writeUint32(view, offset + 42, entry.offset)

  const nameOffset = offset + 46
  archive.set(entry.name, nameOffset)
  return nameOffset + entry.name.byteLength
}

/**
 * Creates a deterministic, store-only ZIP archive suitable for browser downloads.
 * Entries are ordered by their UTF-16 path, encoded as UTF-8, and stamped 1980-01-01.
 * ZIP64 is intentionally unsupported because project bundles should remain small.
 */
export function createZipArchive(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > MAX_UINT16) {
    throw new Error('ZIP archive has more than 65535 entries')
  }

  const encodedEntries: EncodedZipEntry[] = entries
    .map((entry) => {
      assertValidPath(entry.path)
      const name = textEncoder.encode(entry.path)
      if (name.byteLength > MAX_UINT16) {
        throw new Error(`ZIP entry path is too long: ${JSON.stringify(entry.path)}`)
      }
      const content = typeof entry.content === 'string'
        ? textEncoder.encode(entry.content)
        : new Uint8Array(entry.content)
      assertUint32(content.byteLength, `ZIP entry ${JSON.stringify(entry.path)}`)
      return {
        path: entry.path,
        name,
        content,
        checksum: crc32(content),
        offset: 0,
      }
    })
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)

  for (let index = 1; index < encodedEntries.length; index += 1) {
    if (encodedEntries[index - 1].path === encodedEntries[index].path) {
      throw new Error(`Duplicate ZIP entry path: ${JSON.stringify(encodedEntries[index].path)}`)
    }
  }

  let localDirectorySize = 0
  for (const entry of encodedEntries) {
    entry.offset = localDirectorySize
    localDirectorySize += 30 + entry.name.byteLength + entry.content.byteLength
    assertUint32(localDirectorySize, 'ZIP local file data')
  }

  const centralDirectorySize = encodedEntries.reduce(
    (size, entry) => size + 46 + entry.name.byteLength,
    0,
  )
  assertUint32(centralDirectorySize, 'ZIP central directory')
  const totalSize = localDirectorySize + centralDirectorySize + 22
  assertUint32(totalSize, 'ZIP archive')

  const archive = new Uint8Array(totalSize)
  const view = new DataView(archive.buffer)
  let offset = 0
  for (const entry of encodedEntries) {
    offset = writeLocalHeader(archive, view, entry)
  }

  const centralDirectoryOffset = offset
  for (const entry of encodedEntries) {
    offset = writeCentralDirectoryHeader(archive, view, offset, entry)
  }

  writeUint32(view, offset, END_OF_CENTRAL_DIRECTORY_SIGNATURE)
  writeUint16(view, offset + 4, 0)
  writeUint16(view, offset + 6, 0)
  writeUint16(view, offset + 8, encodedEntries.length)
  writeUint16(view, offset + 10, encodedEntries.length)
  writeUint32(view, offset + 12, centralDirectorySize)
  writeUint32(view, offset + 16, centralDirectoryOffset)
  writeUint16(view, offset + 20, 0)

  return archive
}
