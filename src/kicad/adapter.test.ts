import { describe, expect, it } from 'vitest'
import { demoCircuit } from '../circuit/demo'
import { exportKicadSchematic, importKicadSchematic, stableUuid } from './adapter'
import { atomAt, directChild, directChildren, parseSExpressions, tokenizeSExpression } from './sexpr'

function singleSymbolSchematic({
  libraryId,
  reference,
  value,
  euroSimKind,
}: {
  libraryId: string
  reference: string
  value: string
  euroSimKind?: string
}): string {
  return `
    (kicad_sch (version 20231120) (generator eeschema)
      (uuid 00000000-0000-4000-a000-000000000001)
      (lib_symbols)
      (symbol (lib_id "${libraryId}") (at 50 50 0) (unit 1)
        (uuid 00000000-0000-4000-a000-000000000002)
        (property "Reference" "${reference}" (at 50 48 0) (effects (font (size 1.27 1.27))))
        (property "Value" "${value}" (at 50 52 0) (effects (font (size 1.27 1.27))))
        ${euroSimKind ? `(property "EuroSim.Kind" "${euroSimKind}" (at 50 54 0) (effects (font (size 1.27 1.27))))` : ''}
      )
      (sheet_instances (path "/" (page "1")))
    )
  `
}

describe('KiCad adapter', () => {
  it('tokenizes quoted strings and comments', () => {
    const tokens = tokenizeSExpression('(root ; comment\n (property "Name" "A \\"voice\\""))')
    expect(tokens).toEqual(['(', 'root', '(', 'property', 'Name', 'A "voice"', ')', ')'])
  })

  it('creates stable UUID-shaped identifiers', () => {
    const first = stableUuid('voice:U1')
    expect(first).toBe(stableUuid('voice:U1'))
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('exports parseable modern KiCad S-expressions with embedded symbols', () => {
    const source = exportKicadSchematic(demoCircuit)
    expect(source).toContain('(generator saigen)')
    expect(source).toContain('(lib_symbols')
    expect(source).toContain('(symbol "Saigen:ssi2144"')
    expect(source).toContain('(property "Saigen.Kind" "ssi2144"')
    expect(() => parseSExpressions(source)).not.toThrow()
  })

  it('derives KiCad pin electrical types from declared port directions', () => {
    const source = exportKicadSchematic(demoCircuit)

    expect(source).toContain('(pin input line')
    expect(source).toContain('(pin output line')
    expect(source).toContain('(pin power_in line')
    expect(source).toContain('(pin power_out line')
  })

  it('round-trips the Saigen graph semantically', () => {
    const result = importKicadSchematic(exportKicadSchematic(demoCircuit))
    expect(result.warnings).toEqual([])
    expect(result.document.title).toBe(demoCircuit.title)
    expect(result.document.components).toHaveLength(demoCircuit.components.length)
    expect(result.document.connections).toHaveLength(demoCircuit.connections.length)
    expect(result.document.components.map((component) => component.id)).toEqual(
      demoCircuit.components.map((component) => component.id),
    )
    expect(result.document.components.find((component) => component.id === 'vcf')?.position)
      .toEqual(demoCircuit.components.find((component) => component.id === 'vcf')?.position)
  })

  it('lets an explicit wire override a default ground connection', () => {
    const document = {
      ...demoCircuit,
      connections: [
        ...demoCircuit.connections,
        {
          id: 'vcf-ground-explicit',
          from: { componentId: 'vcf', portId: 'gnd' },
          to: { componentId: 'ground', portId: '1' },
          signal: 'power' as const,
        },
      ],
    }
    const source = exportKicadSchematic(document)

    expect(source).toContain(stableUuid(`${document.id}:wire:vcf-ground-explicit:0`))
    expect(source).not.toContain(stableUuid(`${document.id}:wire:implicit-vcf-gnd-GND:0`))
  })

  it('keeps a default ground connection when a malformed wire names a missing port', () => {
    const document = {
      ...demoCircuit,
      connections: [
        ...demoCircuit.connections,
        {
          id: 'vcf-ground-invalid',
          from: { componentId: 'vcf', portId: 'gnd' },
          to: { componentId: 'ground', portId: 'missing' },
          signal: 'power' as const,
        },
      ],
    }
    const source = exportKicadSchematic(document)

    expect(source).toContain(stableUuid(`${document.id}:wire:implicit-vcf-gnd-GND:0`))
    expect(source).not.toContain(stableUuid(`${document.id}:wire:vcf-ground-invalid:0`))
  })

  it('normalizes negative canvas positions to positive KiCad coordinates', () => {
    const document = {
      ...demoCircuit,
      id: 'negative-position-review',
      components: demoCircuit.components.map((component) => ({
        ...component,
        position: {
          x: component.position.x - 5_000,
          y: component.position.y - 6_000,
        },
      })),
    }
    const source = exportKicadSchematic(document)
    const root = parseSExpressions(source)[0]
    const symbolCoordinates = directChildren(root, 'symbol')
      .filter((symbol) => directChild(symbol, 'lib_id'))
      .flatMap((symbol) => {
        const at = directChild(symbol, 'at')
        return [Number(atomAt(at, 1)), Number(atomAt(at, 2))]
      })
    const wireCoordinates = directChildren(root, 'wire').flatMap((wire) =>
      directChildren(directChild(wire, 'pts'), 'xy').flatMap((point) => [
        Number(atomAt(point, 1)),
        Number(atomAt(point, 2)),
      ]),
    )

    expect(symbolCoordinates.length).toBeGreaterThan(0)
    expect(wireCoordinates.length).toBeGreaterThan(0)
    expect([...symbolCoordinates, ...wireCoordinates].every((coordinate) => coordinate > 0)).toBe(true)
    expect(importKicadSchematic(source).document.components.map((component) => component.position)).toEqual(
      document.components.map((component) => component.position),
    )
  })

  it.each([
    ['power:+12V', '+12V', 'plus12V'],
    ['power:-12V', '-12V', 'minus12V'],
    ['power:GND', 'GND', 'ground'],
    ['power:GNDA', 'GNDA', 'ground'],
    ['power:VCC', 'VCC', 'unknown'],
  ])('classifies KiCad power symbol %s as %s', (libraryId, value, expectedKind) => {
    const result = importKicadSchematic(singleSymbolSchematic({
      libraryId,
      reference: '#PWR01',
      value,
    }))

    expect(result.document.components[0].kind).toBe(expectedKind)
  })

  it('does not accept inherited object properties as embedded component kinds', () => {
    const result = importKicadSchematic(singleSymbolSchematic({
      libraryId: 'Vendor:Mystery',
      reference: 'U99',
      value: 'Mystery',
      euroSimKind: 'toString',
    }))

    expect(result.document.components[0].kind).toBe('unknown')
  })

  it('imports an unknown KiCad symbol as a preserved visual block', () => {
    const result = importKicadSchematic(`
      (kicad_sch (version 20231120) (generator eeschema)
        (uuid 00000000-0000-4000-a000-000000000001)
        (lib_symbols)
        (symbol (lib_id "Vendor:Mystery") (at 50 50 0) (unit 1)
          (uuid 00000000-0000-4000-a000-000000000002)
          (property "Reference" "U99" (at 50 48 0) (effects (font (size 1.27 1.27))))
          (property "Value" "Mystery" (at 50 52 0) (effects (font (size 1.27 1.27))))
        )
        (sheet_instances (path "/" (page "1")))
      )
    `)
    expect(result.document.components[0].kind).toBe('unknown')
    expect(result.warnings[0]).toMatch(/unsupported visual block/i)
  })
})
