import { catalogByKind } from '../circuit/catalog'
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
  const componentsById = new Map(document.components.map((component) => [component.id, component]))
  const validConnections = document.connections.filter((connection) => {
    const fromComponent = componentsById.get(connection.from.componentId)
    const toComponent = componentsById.get(connection.to.componentId)
    return Boolean(
      fromComponent &&
      toComponent &&
      catalogByKind[fromComponent.kind].ports.some((port) => port.id === connection.from.portId) &&
      catalogByKind[toComponent.kind].ports.some((port) => port.id === connection.to.portId),
    )
  })
  const devices = document.components.flatMap((component) => {
    const device = ssiDevices.find((candidate) => candidate.kind === component.kind)
    if (!device) return []
    const connectedPorts = new Set(validConnections.flatMap((connection) => [
      connection.from.componentId === component.id ? connection.from.portId : undefined,
      connection.to.componentId === component.id ? connection.to.portId : undefined,
    ]).filter((portId): portId is string => Boolean(portId)))
    const mappedPins = device.units.flatMap((unit) => unit.pins).filter((pin) => pin.editorPortId)
    const hasGround = document.components.some((candidate) => candidate.kind === 'ground')
    const wiredPins = mappedPins.filter((pin) =>
      connectedPorts.has(pin.editorPortId!) || (pin.editorPortId === 'gnd' && hasGround),
    ).length
    return [{ component, device, wiredPins }]
  })

  const deviceRows = devices.length
    ? devices.map(({ component, device, wiredPins }) =>
      `| ${component.reference} ${device.value} | ${device.units.length} | ${wiredPins}/16 | \`${device.footprint}\` | [datasheet](${device.datasheet}) |`,
    ).join('\n')
    : '| — | — | — | — | — |'

  return `# ${document.title} — KiCad export notes

Open \`${stem}.kicad_sch\` in KiCad. The project-local symbol and footprint tables point to the bundled \`Saigen.kicad_sym\` and \`Saigen.pretty\` libraries through \`\${KIPRJMOD}\`, so the export is portable after the ZIP is extracted.

## Physical device coverage

| Device | Logical units | Wired pins | Assigned footprint | Source |
|---|---:|---:|---|---|
${deviceRows}

Every SSI package pin is present exactly once and every power pin remains visible. The main schematic contains exactly the support components and connections shown on the Saigen canvas. SSI application templates place datasheet networks as editable real parts; dropping a bare IC still leaves those networks for the designer to add. Ground defaults apply only when the visible GND pin has no explicit user connection. SSI2164 MODE is explicitly marked no-connect while unwired, selecting datasheet-defined Class AB operation; wiring MODE overrides that marker. Other unwired pins are not automatically NC pins.

## Production checks still required

- If an IC was placed without its application template, add its timing/pole capacitors, I/V stages, CV scaling, decoupling, references, and rail conditioning before fabrication.
- Treat placed templates as editable starting points, then verify component tolerances, voltage ratings, package choices, and CV/audio scaling for the intended module.
- Source and output symbols are interface placeholders; assign jack/header footprints that match the module's mechanical design before PCB layout.
- Template passives carry reviewed starting footprints, while bare generic parts remain unassigned; every part's footprint can be overridden in the Saigen inspector.
- The bundled SSI land patterns omit version-specific 3D-model paths so the project opens cleanly across supported KiCad installations.
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
