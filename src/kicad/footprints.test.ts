import { describe, expect, it } from 'vitest'
import { atomAt, directChild, directChildren, expressionHead, parseSExpressions } from './sexpr'
import {
  SSI_PSL16_FOOTPRINT_NAME,
  SSI_PSSL16_FOOTPRINT_NAME,
  ssiFootprints,
} from './footprints'

function parsedFootprint(name: string) {
  const file = ssiFootprints.find((candidate) => candidate.name === name)
  expect(file).toBeDefined()
  const roots = parseSExpressions(file!.content)
  expect(roots).toHaveLength(1)
  expect(expressionHead(roots[0])).toBe('footprint')
  return { file: file!, root: roots[0] }
}

function padRecord(root: ReturnType<typeof parsedFootprint>['root'], number: number) {
  const pad = directChildren(root, 'pad').find((candidate) => atomAt(candidate, 1) === String(number))
  expect(pad).toBeDefined()
  return {
    x: Number(atomAt(directChild(pad, 'at'), 1)),
    y: Number(atomAt(directChild(pad, 'at'), 2)),
    width: Number(atomAt(directChild(pad, 'size'), 1)),
    height: Number(atomAt(directChild(pad, 'size'), 2)),
  }
}

describe('SSI KiCad footprints', () => {
  it('exports deterministic, self-describing KiCad footprint files', () => {
    expect(ssiFootprints.map(({ name, filename }) => ({ name, filename }))).toEqual([
      {
        name: SSI_PSL16_FOOTPRINT_NAME,
        filename: `${SSI_PSL16_FOOTPRINT_NAME}.kicad_mod`,
      },
      {
        name: SSI_PSSL16_FOOTPRINT_NAME,
        filename: `${SSI_PSSL16_FOOTPRINT_NAME}.kicad_mod`,
      },
    ])

    for (const file of ssiFootprints) {
      expect(file.content).toMatch(/^\(footprint /)
      expect(file.content).toContain('(version 20240108) (generator "saigen")')
      expect(file.content).toContain('www.soundsemiconductor.com/downloads/PODP')
      expect(file.content.endsWith('\n')).toBe(true)
      expect(parseSExpressions(file.content)).toHaveLength(1)
    }
  })

  it.each([SSI_PSL16_FOOTPRINT_NAME, SSI_PSSL16_FOOTPRINT_NAME])(
    'provides sixteen uniquely numbered SMD pads, fab and assembly layers for %s',
    (name) => {
      const { root } = parsedFootprint(name)
      const pads = directChildren(root, 'pad')
      expect(pads.map((pad) => atomAt(pad, 1))).toEqual(
        Array.from({ length: 16 }, (_, index) => String(index + 1)),
      )
      expect(new Set(pads.map((pad) => atomAt(pad, 1))).size).toBe(16)
      expect(pads.every((pad) => atomAt(pad, 2) === 'smd')).toBe(true)

      expect(directChildren(root, 'fp_text').map((text) => atomAt(text, 1))).toEqual(
        expect.arrayContaining(['reference', 'value', 'user']),
      )
      expect(directChildren(root, 'fp_line').some((line) => atomAt(directChild(line, 'layer'), 1) === 'F.SilkS')).toBe(true)
      expect(directChildren(root, 'fp_line').some((line) => atomAt(directChild(line, 'layer'), 1) === 'F.Fab')).toBe(true)
      expect(directChildren(root, 'fp_line').some((line) => atomAt(directChild(line, 'layer'), 1) === 'F.CrtYd')).toBe(true)
      expect(directChildren(root, 'fp_circle')).toHaveLength(1)
      expect(directChildren(root, 'model')).toHaveLength(1)
    },
  )

  it('matches the official KiCad SOIC-16 land pattern used by PSL16', () => {
    const { root } = parsedFootprint(SSI_PSL16_FOOTPRINT_NAME)
    expect(padRecord(root, 1)).toEqual({ x: -2.475, y: -4.445, width: 1.95, height: 0.6 })
    expect(padRecord(root, 8)).toEqual({ x: -2.475, y: 4.445, width: 1.95, height: 0.6 })
    expect(padRecord(root, 9)).toEqual({ x: 2.475, y: 4.445, width: 1.95, height: 0.6 })
    expect(padRecord(root, 16)).toEqual({ x: 2.475, y: -4.445, width: 1.95, height: 0.6 })
  })

  it('matches the official KiCad SSOP-16 land pattern used by PSSL16', () => {
    const { root } = parsedFootprint(SSI_PSSL16_FOOTPRINT_NAME)
    expect(padRecord(root, 1)).toEqual({ x: -2.625, y: -2.2225, width: 1.65, height: 0.4 })
    expect(padRecord(root, 8)).toEqual({ x: -2.625, y: 2.2225, width: 1.65, height: 0.4 })
    expect(padRecord(root, 9)).toEqual({ x: 2.625, y: 2.2225, width: 1.65, height: 0.4 })
    expect(padRecord(root, 16)).toEqual({ x: 2.625, y: -2.2225, width: 1.65, height: 0.4 })
  })
})
