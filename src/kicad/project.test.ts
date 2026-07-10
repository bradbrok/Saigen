import { describe, expect, it } from 'vitest'
import { demoCircuit } from '../circuit/demo'
import { instantiateCircuitTemplate, type CircuitTemplateId } from '../circuit/templates'
import type { CircuitDocument } from '../circuit/types'
import { exportKicadSchematic, importKicadSchematic } from './adapter'
import { parseSExpressions } from './sexpr'
import { createKicadProjectFiles, exportKicadProjectBundle } from './project'

describe('KiCad project bundle', () => {
  it('contains a portable schematic, local libraries, footprints, project settings, and source graph', () => {
    const files = createKicadProjectFiles(demoCircuit)
    const paths = files.map((file) => file.path)

    expect(paths).toEqual(expect.arrayContaining([
      'ssi-signal-path-voice-01.kicad_pro',
      'ssi-signal-path-voice-01.kicad_sch',
      'ssi-signal-path-voice-01.saigen.json',
      'DESIGN-NOTES.md',
      'Saigen.kicad_sym',
      'sym-lib-table',
      'fp-lib-table',
      'Saigen.pretty/SSI_PSL16_SOIC-16_3.9x9.9mm_P1.27mm.kicad_mod',
      'Saigen.pretty/SSI_PSSL16_SSOP-16_3.9x4.9mm_P0.635mm.kicad_mod',
    ]))
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('emits parseable KiCad sources and project-local library references', () => {
    const files = new Map(createKicadProjectFiles(demoCircuit).map((file) => [file.path, file.content]))
    const schematic = files.get('ssi-signal-path-voice-01.kicad_sch')
    const symbols = files.get('Saigen.kicad_sym')

    expect(typeof schematic).toBe('string')
    expect(typeof symbols).toBe('string')
    expect(() => parseSExpressions(schematic as string)).not.toThrow()
    expect(() => parseSExpressions(symbols as string)).not.toThrow()
    expect(files.get('sym-lib-table')).toContain('${KIPRJMOD}/Saigen.kicad_sym')
    expect(files.get('fp-lib-table')).toContain('${KIPRJMOD}/Saigen.pretty')
    expect(() => JSON.parse(files.get('ssi-signal-path-voice-01.kicad_pro') as string)).not.toThrow()
  })

  it('builds a deterministic downloadable ZIP archive', () => {
    const first = exportKicadProjectBundle(demoCircuit)
    const second = exportKicadProjectBundle(demoCircuit)

    expect(first.filename).toBe('ssi-signal-path-voice-01-kicad.zip')
    expect(first.archive).toEqual(second.archive)
    expect(new DataView(first.archive.buffer).getUint32(0, true)).toBe(0x04034b50)
  })

  it('ships explicit fabrication cautions instead of silently adding unsupported circuitry', () => {
    const notes = createKicadProjectFiles(demoCircuit).find((file) => file.path === 'DESIGN-NOTES.md')?.content
    expect(notes).toContain('Every SSI package pin is present exactly once')
    expect(notes).toContain('SSI2131 pin 16 requires regulated +5 V')
    expect(notes).toContain('SSI2164 MODE is explicitly marked no-connect')
    expect(notes).toContain('assign jack/header footprints')
    expect(notes).toContain('bare generic parts remain unassigned')
    expect(notes).toContain('omit version-specific 3D-model paths')
    expect(notes).toContain('Run KiCad ERC')
  })

  it.each([
    ['ssi2131-typical', '16/16'],
    ['ssi2144-typical', '16/16'],
    ['ssi2164-typical', '15/16'],
  ] as const)('round-trips the expanded %s application graph and reports physical-pin coverage', (id, coverage) => {
    const base: CircuitDocument = {
      schemaVersion: 1,
      id: `project-${id}`,
      title: id,
      description: 'Expanded application template',
      revision: 1,
      components: [],
      connections: [],
    }
    const instance = instantiateCircuitTemplate(base, id as CircuitTemplateId, { x: 40, y: 40 })
    const document = {
      ...base,
      components: instance.components,
      connections: instance.connections,
    }
    const source = exportKicadSchematic(document)
    const imported = importKicadSchematic(source).document
    const notes = createKicadProjectFiles(document).find((file) => file.path === 'DESIGN-NOTES.md')?.content

    expect(imported.components).toHaveLength(document.components.length)
    expect(imported.connections).toHaveLength(document.connections.length)
    expect(source).toContain('(property "Footprint" "Resistor_SMD:R_0603_1608Metric"')
    expect(source).toContain('(property "Footprint" "Capacitor_SMD:C_')
    expect(notes).toContain(coverage)
  })

  it('does not count a malformed opposite endpoint as a wired physical pin', () => {
    const base: CircuitDocument = {
      schemaVersion: 1,
      id: 'project-malformed-coverage',
      title: 'Malformed coverage',
      description: 'Coverage validation fixture',
      revision: 1,
      components: [],
      connections: [],
    }
    const instance = instantiateCircuitTemplate(base, 'ssi2131-typical', { x: 40, y: 40 })
    const sawConnection = instance.connections.find((connection) =>
      connection.from.componentId === instance.primaryComponentId && connection.from.portId === 'saw',
    )
    expect(sawConnection).toBeDefined()
    const document = {
      ...base,
      components: instance.components,
      connections: instance.connections.map((connection) => connection.id === sawConnection?.id
        ? { ...connection, to: { ...connection.to, portId: 'missing' } }
        : connection),
    }
    const notes = createKicadProjectFiles(document).find((file) => file.path === 'DESIGN-NOTES.md')?.content

    expect(notes).toContain('| U1 SSI2131 | 3 | 15/16 |')
  })
})
