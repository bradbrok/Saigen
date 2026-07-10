import { describe, expect, it } from 'vitest'
import { demoCircuit } from '../circuit/demo'
import { exportKicadSchematic, exportKicadSymbolLibrary, importKicadSchematic, stableUuid } from './adapter'
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
    expect(source).toContain('(symbol "Saigen:SSI2144"')
    expect(source).toContain('(property "Saigen.Kind" "ssi2144"')
    expect(() => parseSExpressions(source)).not.toThrow()
  })

  it('exports all physical SSI pins as locked non-interchangeable units', () => {
    const source = exportKicadSymbolLibrary(['ssi2131', 'ssi2144', 'ssi2164'])
    const root = parseSExpressions(source)[0]
    const symbols = directChildren(root, 'symbol')
    const expectedUnits = new Map([
      ['SSI2131', 3],
      ['SSI2144', 3],
      ['SSI2164', 5],
    ])

    for (const symbol of symbols) {
      const name = atomAt(symbol, 1) ?? ''
      const units = directChildren(symbol, 'symbol')
      const pinNumbers = units.flatMap((unit) =>
        directChildren(unit, 'pin').map((pin) => atomAt(directChild(pin, 'number'), 1)),
      )
      expect(units).toHaveLength(expectedUnits.get(name) ?? 0)
      expect(pinNumbers.sort((left, right) => Number(left) - Number(right))).toEqual(
        Array.from({ length: 16 }, (_, index) => String(index + 1)),
      )
      expect(source).toContain('(property "ki_locked" "yes"')
    }
  })

  it('expands each SSI package into every schematic unit with one shared footprint', () => {
    const source = exportKicadSchematic(demoCircuit)
    const root = parseSExpressions(source)[0]
    const instances = directChildren(root, 'symbol').filter((symbol) => directChild(symbol, 'lib_id'))
    const instancesFor = (id: string) => instances.filter((symbol) =>
      directChildren(symbol, 'property').some((property) =>
        atomAt(property, 1) === 'Saigen.Id' && atomAt(property, 2) === id,
      ),
    )

    expect(instancesFor('vco')).toHaveLength(3)
    expect(instancesFor('vcf')).toHaveLength(3)
    expect(instancesFor('vca')).toHaveLength(5)
    expect(source).toContain('(property "Footprint" "Saigen:SSI_PSL16_SOIC-16_3.9x9.9mm_P1.27mm"')
    expect(source).toContain('(property "Footprint" "Saigen:SSI_PSSL16_SSOP-16_3.9x4.9mm_P0.635mm"')
  })

  it('keeps power and reference symbols out of the BOM and PCB', () => {
    const source = exportKicadSchematic(demoCircuit)
    const root = parseSExpressions(source)[0]
    const instances = directChildren(root, 'symbol').filter((symbol) => directChild(symbol, 'lib_id'))
    const powerKindList = ['plus12V', 'plus5V', 'vref2V5', 'minus12V', 'ground'] as const
    const powerKinds = new Set<string>(powerKindList)
    const powerInstances = instances.filter((symbol) => directChildren(symbol, 'property').some((property) =>
      atomAt(property, 1) === 'Saigen.Kind' && powerKinds.has(atomAt(property, 2) ?? ''),
    ))

    expect(powerInstances).toHaveLength(5)
    for (const symbol of powerInstances) {
      expect(atomAt(directChild(symbol, 'in_bom'), 1)).toBe('no')
      expect(atomAt(directChild(symbol, 'on_board'), 1)).toBe('no')
    }

    const library = parseSExpressions(exportKicadSymbolLibrary(powerKindList))[0]
    for (const symbol of directChildren(library, 'symbol')) {
      expect(atomAt(directChild(symbol, 'in_bom'), 1)).toBe('no')
      expect(atomAt(directChild(symbol, 'on_board'), 1)).toBe('no')
    }
  })

  it('does not guess package, power, or mechanical details for bare generic parts', () => {
    const source = exportKicadSymbolLibrary([
      'resistor',
      'capacitor',
      'inductor',
      'diode',
      'zenerDiode',
      'led',
      'potentiometer',
      'switch',
      'cvInput',
      'opAmp',
    ])
    const root = parseSExpressions(source)[0]
    const footprints = new Map(directChildren(root, 'symbol').map((symbol) => {
      const footprintProperty = directChildren(symbol, 'property').find((property) => atomAt(property, 1) === 'Footprint')
      return [atomAt(symbol, 1), atomAt(footprintProperty, 2)]
    }))

    expect([...footprints.values()].every((footprint) => footprint === '')).toBe(true)
  })

  it('writes explicit per-instance footprint choices into every schematic instance table', () => {
    const parts = [
      ['r1', 'resistor', 'R1', '10k', 'Resistor_SMD:R_0603_1608Metric'],
      ['c1', 'capacitor', 'C1', '999n', 'Capacitor_SMD:C_0603_1608Metric'],
      ['c2', 'capacitor', 'C2', '1000n', 'Capacitor_SMD:C_1206_3216Metric'],
      ['c3', 'capacitor', 'C3', '0.47\u00b5F', 'Capacitor_SMD:C_1206_3216Metric'],
      ['c4', 'capacitor', 'C4', '1000u', ''],
      ['l1', 'inductor', 'L1', '10mH', 'Inductor_SMD:L_0603_1608Metric'],
      ['d1', 'diode', 'D1', '1N4148', 'Diode_SMD:D_SOD-123'],
      ['zd1', 'zenerDiode', 'D2', '5V1', 'Diode_SMD:D_SOD-123'],
      ['led1', 'led', 'D3', 'Red', 'LED_SMD:LED_0603_1608Metric'],
      ['rv1', 'potentiometer', 'RV1', '100k', 'Potentiometer_THT:Potentiometer_Bourns_3296W_Vertical'],
      ['sw1', 'switch', 'SW1', 'SPST', ''],
      ['op1', 'opAmp', 'U1', 'Ideal', ''],
      ['j1', 'cvInput', 'J1', 'CV', ''],
    ] as const
    const document = {
      ...demoCircuit,
      id: 'generic-footprints',
      components: parts.map(([id, kind, reference, value, footprint], index) => ({
        id,
        kind,
        reference,
        label: value,
        value,
        ...(footprint ? { footprint } : {}),
        position: { x: index * 140, y: 100 },
        parameters: {},
      })),
      connections: [],
    }
    const source = exportKicadSchematic(document)
    const root = parseSExpressions(source)[0]
    const symbols = directChildren(root, 'symbol').filter((symbol) => directChild(symbol, 'lib_id'))
    const symbolInstances = directChildren(directChild(root, 'symbol_instances'), 'path')

    for (const [id, , reference, , expectedFootprint] of parts) {
      const symbol = symbols.find((candidate) => directChildren(candidate, 'property').some((property) =>
        atomAt(property, 1) === 'Saigen.Id' && atomAt(property, 2) === id,
      ))
      const properties = directChildren(symbol, 'property')
      const footprintProperty = properties.find((property) => atomAt(property, 1) === 'Footprint')
      expect(atomAt(footprintProperty, 2), `${id} Footprint property`).toBe(expectedFootprint)
      expect(atomAt(directChild(directChild(symbol, 'default_instance'), 'footprint'), 1), `${id} default_instance`)
        .toBe(expectedFootprint)

      const instance = symbolInstances.find((candidate) =>
        atomAt(directChild(candidate, 'reference'), 1) === reference,
      )
      expect(atomAt(directChild(instance, 'footprint'), 1), `${id} symbol_instances`).toBe(expectedFootprint)
    }
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

  it('lets an explicit connection override a default ground connection', () => {
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

    expect(source).toContain(stableUuid(`${document.id}:label:vcf-ground-explicit:vcf:gnd`))
    expect(source).not.toContain(stableUuid(`${document.id}:label:implicit-vcf-gnd-GND:vcf:gnd`))
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

    expect(source).toContain(stableUuid(`${document.id}:label:implicit-vcf-gnd-GND:vcf:gnd`))
    expect(source).not.toContain(stableUuid(`${document.id}:label:vcf-ground-invalid:vcf:gnd`))
  })

  it('marks SSI2164 MODE intentionally open unless an explicit connection overrides it', () => {
    const defaultMarker = stableUuid(`${demoCircuit.id}:no-connect:vca:mode`)
    expect(exportKicadSchematic(demoCircuit)).toContain(defaultMarker)

    const connected = {
      ...demoCircuit,
      connections: [
        ...demoCircuit.connections,
        {
          id: 'vca-mode-explicit',
          from: { componentId: 'vca', portId: 'mode' },
          to: { componentId: 'ground', portId: '1' },
          signal: 'passive' as const,
        },
      ],
    }
    expect(exportKicadSchematic(connected)).not.toContain(defaultMarker)
  })

  it('uses one shared net name for repeated instances of the same power rail', () => {
    const document = {
      ...demoCircuit,
      components: [
        ...demoCircuit.components,
        {
          id: 'ground-2',
          kind: 'ground' as const,
          reference: '#PWR06',
          label: '0V',
          position: { x: 1_450, y: 500 },
          parameters: {},
        },
        {
          id: 'ground-load',
          kind: 'resistor' as const,
          reference: 'R1',
          label: 'GROUND LOAD',
          value: '100k',
          position: { x: 1_350, y: 400 },
          parameters: {},
        },
      ],
      connections: [
        ...demoCircuit.connections,
        {
          id: 'second-ground-net',
          from: { componentId: 'ground-2', portId: '1' },
          to: { componentId: 'ground-load', portId: '1' },
          signal: 'power' as const,
        },
      ],
    }
    const source = exportKicadSchematic(document)

    expect(source).not.toContain('(label "GND_2"')
    expect(source.match(/\(label "GND"/g)?.length).toBeGreaterThanOrEqual(2)
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
    const labelCoordinates = directChildren(root, 'label').flatMap((label) => {
      const at = directChild(label, 'at')
      return [Number(atomAt(at, 1)), Number(atomAt(at, 2))]
    })

    expect(symbolCoordinates.length).toBeGreaterThan(0)
    expect(labelCoordinates.length).toBeGreaterThan(0)
    expect([...symbolCoordinates, ...labelCoordinates].every((coordinate) => coordinate > 0)).toBe(true)
    expect(importKicadSchematic(source).document.components.map((component) => component.position)).toEqual(
      document.components.map((component) => component.position),
    )
  })

  it('places symbol origins and net labels on KiCad’s 1.27 mm schematic grid', () => {
    const source = exportKicadSchematic(demoCircuit)
    const root = parseSExpressions(source)[0]
    const coordinates = [
      ...directChildren(root, 'symbol')
        .filter((symbol) => directChild(symbol, 'lib_id'))
        .flatMap((symbol) => {
          const at = directChild(symbol, 'at')
          return [Number(atomAt(at, 1)), Number(atomAt(at, 2))]
        }),
      ...directChildren(root, 'wire').flatMap((wire) =>
        directChildren(directChild(wire, 'pts'), 'xy').flatMap((point) => [
          Number(atomAt(point, 1)),
          Number(atomAt(point, 2)),
        ]),
      ),
      ...directChildren(root, 'label').flatMap((label) => {
        const at = directChild(label, 'at')
        return [Number(atomAt(at, 1)), Number(atomAt(at, 2))]
      }),
    ]

    expect(coordinates.length).toBeGreaterThan(0)
    expect(coordinates.every((coordinate) => Math.abs(coordinate / 1.27 - Math.round(coordinate / 1.27)) < 1e-6))
      .toBe(true)
  })

  it('attaches labels directly to pins instead of emitting crossing wire geometry', () => {
    const root = parseSExpressions(exportKicadSchematic(demoCircuit))[0]
    const wires = directChildren(root, 'wire')
    const labels = directChildren(root, 'label')

    expect(wires).toHaveLength(0)
    expect(labels.length).toBeGreaterThan(0)
  })

  it.each([
    ['power:+12V', '+12V', 'plus12V'],
    ['power:+5V', '+5V', 'plus5V'],
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

  it.each([
    ['Amplifier_Operational:TL072', 'U1', 'TL072', 'tl072'],
    ['Saigen_Power:VREF_2V5', '#PWR01', '2V5 REF', 'vref2V5'],
  ])('classifies fabrication symbol %s as %s', (libraryId, reference, value, expectedKind) => {
    const result = importKicadSchematic(singleSymbolSchematic({ libraryId, reference, value }))
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
