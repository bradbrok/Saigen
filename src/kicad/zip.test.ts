import { describe, expect, it } from 'vitest'
import { createZipArchive } from './zip'

const decoder = new TextDecoder()

function uint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true)
}

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true)
}

function localEntries(archive: Uint8Array): Array<{
  path: string
  content: Uint8Array
  checksum: number
  flags: number
  method: number
  date: number
}> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const endOffset = archive.byteLength - 22
  expect(uint32(view, endOffset)).toBe(0x06054b50)
  const centralDirectoryOffset = uint32(view, endOffset + 16)
  const entries = []
  let offset = 0

  while (offset < centralDirectoryOffset) {
    expect(uint32(view, offset)).toBe(0x04034b50)
    const nameLength = uint16(view, offset + 26)
    const extraLength = uint16(view, offset + 28)
    const contentLength = uint32(view, offset + 18)
    const nameOffset = offset + 30
    const contentOffset = nameOffset + nameLength + extraLength
    entries.push({
      path: decoder.decode(archive.subarray(nameOffset, nameOffset + nameLength)),
      content: archive.slice(contentOffset, contentOffset + contentLength),
      checksum: uint32(view, offset + 14),
      flags: uint16(view, offset + 6),
      method: uint16(view, offset + 8),
      date: uint16(view, offset + 12),
    })
    offset = contentOffset + contentLength
  }

  expect(offset).toBe(centralDirectoryOffset)
  return entries
}

describe('ZIP archive builder', () => {
  it('writes deterministic store-only entries in path order', () => {
    const entries = [
      { path: 'symbols/Saigen.kicad_sym', content: new Uint8Array([0, 127, 255]) },
      { path: 'Saigen.kicad_pro', content: '{"meta":"音"}\n' },
    ]
    const forward = createZipArchive(entries)
    const reverse = createZipArchive([...entries].reverse())

    expect([...forward]).toEqual([...reverse])
    expect(localEntries(forward)).toEqual([
      {
        path: 'Saigen.kicad_pro',
        content: new TextEncoder().encode('{"meta":"音"}\n'),
        checksum: 0x66fe8636,
        flags: 0x0800,
        method: 0,
        date: 0x0021,
      },
      {
        path: 'symbols/Saigen.kicad_sym',
        content: new Uint8Array([0, 127, 255]),
        checksum: 0x7ae453a6,
        flags: 0x0800,
        method: 0,
        date: 0x0021,
      },
    ])
  })

  it('writes a matching central directory and end record', () => {
    const archive = createZipArchive([
      { path: 'a.txt', content: 'hello' },
      { path: 'nested/b.txt', content: 'world' },
    ])
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
    const endOffset = archive.byteLength - 22
    const centralDirectorySize = uint32(view, endOffset + 12)
    const centralDirectoryOffset = uint32(view, endOffset + 16)

    expect(uint16(view, endOffset + 8)).toBe(2)
    expect(uint16(view, endOffset + 10)).toBe(2)
    expect(centralDirectoryOffset + centralDirectorySize).toBe(endOffset)

    let offset = centralDirectoryOffset
    for (const expected of [
      { path: 'a.txt', localOffset: 0, checksum: 0x3610a686 },
      { path: 'nested/b.txt', localOffset: 40, checksum: 0x3a771143 },
    ]) {
      expect(uint32(view, offset)).toBe(0x02014b50)
      const nameLength = uint16(view, offset + 28)
      expect(decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength))).toBe(expected.path)
      expect(uint32(view, offset + 16)).toBe(expected.checksum)
      expect(uint32(view, offset + 42)).toBe(expected.localOffset)
      offset += 46 + nameLength + uint16(view, offset + 30) + uint16(view, offset + 32)
    }
    expect(offset).toBe(endOffset)
  })

  it('creates a valid empty archive', () => {
    const archive = createZipArchive([])
    const view = new DataView(archive.buffer)

    expect(archive).toHaveLength(22)
    expect(uint32(view, 0)).toBe(0x06054b50)
    expect(uint16(view, 8)).toBe(0)
    expect(uint32(view, 12)).toBe(0)
    expect(uint32(view, 16)).toBe(0)
  })

  it.each(['', '/absolute.txt', '../escape.txt', 'nested/../escape.txt', 'windows\\path.txt'])
  ('rejects unsafe path %j', (path) => {
    expect(() => createZipArchive([{ path, content: '' }])).toThrow(/invalid zip entry path/i)
  })

  it('rejects duplicate paths', () => {
    expect(() => createZipArchive([
      { path: 'same.txt', content: 'first' },
      { path: 'same.txt', content: 'second' },
    ])).toThrow(/duplicate zip entry path/i)
  })
})
