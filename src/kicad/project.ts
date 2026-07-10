import { serializeProject, safeFileStem } from '../circuit/persistence'
import type { CircuitDocument, ComponentKind } from '../circuit/types'
import { exportKicadSchematic, exportKicadSymbolLibrary } from './adapter'
import { ssiDevices } from './devices'
import { ssiFootprints } from './footprints'
import { createZipArchive, type ZipEntry } from './zip'

export interface KiCadProjectBundle {
  filename: string
  files: readonly ZipEntry[]
  archive: Uint8Array
}

function symbolLibraryTable(): string {
  return `(sym_lib_table
  (version 7)
  (lib (name "Saigen")(type "KiCad")(uri "\${KIPRJMOD}/Saigen.kicad_sym")(options "")(descr "Saigen project-local symbols"))
)
`
}

function footprintLibraryTable(): string {
  return `(fp_lib_table
  (version 7)
  (lib (name "Saigen")(type "KiCad")(uri "\${KIPRJMOD}/Saigen.pretty")(options "")(descr "Saigen datasheet-verified SSI footprints"))
)
`
}

function projectSettings(stem: string): string {
  return `${JSON.stringify({
    board: {},
    boards: [],
    cvpcb: {},
    erc: {},
    libraries: {},
    meta: {
      filename: `${stem}.kicad_pro`,
      version: 1,
    },
    net_settings: {
      classes: [],
      meta: { version: 3 },
    },
    pcbnew: {},
    schematic: {},
    text_variables: {},
  }, null, 2)}\n`
}

function designNotes(document: CircuitDocument, stem: string): string {
  const devices = [...new Set(document.components.map((component) => component.kind))]
    .flatMap((kind) => ssiDevices.filter((device) => device.kind === kind))

  const deviceRows = devices.length
    ? devices.map((device) =>
      `| ${device.value} | ${device.units.length} | 16 | \`${device.footprint}\` | [datasheet](${device.datasheet}) |`,
    ).join('\n')
    : '| — | — | — | — | — |'

  return `# ${document.title} — KiCad export notes

Open \`${stem}.kicad_sch\` in KiCad. The project-local symbol and footprint tables point to the bundled \`Saigen.kicad_sym\` and \`Saigen.pretty\` libraries through \`\${KIPRJMOD}\`, so the export is portable after the ZIP is extracted.

## Physical device coverage

| Device | Logical units | Physical pins | Assigned footprint | Source |
|---|---:|---:|---|---|
${deviceRows}

Every SSI package pin is present exactly once. Power pins are visible. SSI ground pins are connected to the Saigen GND component by default only when that compact editor port has no explicit user connection. The other full-package pins are intentionally left available for design completion; an unconnected pin in this export is not automatically an NC pin.

## Production checks still required

- Add and verify the datasheet application network around each IC before fabrication. The compact Saigen canvas models signal flow; it does not silently invent timing capacitors, pole capacitors, I/V amplifiers, CV scaling, decoupling, or rail conditioning.
- SSI2131 pin 16 requires regulated +5 V, not the Eurorack +12 V rail. Its pin 14 requires a low-noise 2.5 V reference.
- SSI2144 requires four external pole capacitors and an output I/V amplifier; raw Eurorack audio/CV levels require conditioning.
- SSI2164 inputs and current outputs require their external resistor/stability and transimpedance networks. Ground unused VCA signal pins per the datasheet.
- Run KiCad ERC, inspect every unconnected pin, confirm footprint orientation/pin 1, then run PCB DRC before ordering hardware.

## Package sources

- [Sound Semiconductor PSL16 package outline](https://www.soundsemiconductor.com/downloads/PODPSL16.pdf)
- [Sound Semiconductor PSSL16 package outline](https://www.soundsemiconductor.com/downloads/PODPSSL16.pdf)

The included land patterns follow the matching official KiCad SOIC-16 3.9 × 9.9 mm / 1.27 mm and SSOP-16 3.9 × 4.9 mm / 0.635 mm geometries.
`
}

export function createKicadProjectFiles(document: CircuitDocument): readonly ZipEntry[] {
  const stem = safeFileStem(document.title)
  const kinds: ComponentKind[] = [...new Set([
    ...document.components.map((component) => component.kind),
    ...ssiDevices.map((device) => device.kind),
  ])]

  return [
    { path: `${stem}.kicad_pro`, content: projectSettings(stem) },
    { path: `${stem}.kicad_sch`, content: exportKicadSchematic(document) },
    { path: `${stem}.saigen.json`, content: serializeProject(document) },
    { path: 'DESIGN-NOTES.md', content: designNotes(document, stem) },
    { path: 'Saigen.kicad_sym', content: exportKicadSymbolLibrary(kinds) },
    { path: 'sym-lib-table', content: symbolLibraryTable() },
    { path: 'fp-lib-table', content: footprintLibraryTable() },
    ...ssiFootprints.map((footprint) => ({
      path: `Saigen.pretty/${footprint.filename}`,
      content: footprint.content,
    })),
  ]
}

export function exportKicadProjectBundle(document: CircuitDocument): KiCadProjectBundle {
  const files = createKicadProjectFiles(document)
  return {
    filename: `${safeFileStem(document.title)}-kicad.zip`,
    files,
    archive: createZipArchive(files),
  }
}
