import { describe, expect, it } from 'vitest'
import { demoCircuit } from '../circuit/demo'
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
    expect(notes).toContain('Run KiCad ERC')
  })
})
