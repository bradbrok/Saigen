export interface KiCadFootprintFile {
  /** Library identifier without the `Saigen:` nickname. */
  name: string
  /** Filename relative to the generated `Saigen.pretty` directory. */
  filename: `${string}.kicad_mod`
  content: string
}

interface GullWingFootprintOptions {
  name: string
  description: string
  tags: string
  model: string
  bodyWidth: number
  bodyLength: number
  padRowX: number
  padPitch: number
  padWidth: number
  padHeight: number
  courtyardHalfWidth: number
  courtyardHalfLength: number
  referenceY: number
  valueY: number
}

export const SSI_PSL16_FOOTPRINT_NAME = 'SSI_PSL16_SOIC-16_3.9x9.9mm_P1.27mm'
export const SSI_PSSL16_FOOTPRINT_NAME = 'SSI_PSSL16_SSOP-16_3.9x4.9mm_P0.635mm'

function number(value: number): string {
  const formatted = value.toFixed(4).replace(/\.?0+$/, '')
  return formatted === '-0' ? '0' : formatted
}

function line(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  layer: string,
): string {
  return `  (fp_line (start ${number(startX)} ${number(startY)}) (end ${number(endX)} ${number(endY)})
    (stroke (width ${number(width)}) (type solid)) (layer "${layer}"))`
}

function pad(numberValue: number, x: number, y: number, width: number, height: number): string {
  return `  (pad "${numberValue}" smd roundrect (at ${number(x)} ${number(y)}) (size ${number(width)} ${number(height)})
    (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))`
}

function pads(options: GullWingFootprintOptions): string[] {
  const leftY = Array.from(
    { length: 8 },
    (_, index) => (index - 3.5) * options.padPitch,
  )

  return [
    ...leftY.map((y, index) => pad(index + 1, -options.padRowX, y, options.padWidth, options.padHeight)),
    ...[...leftY].reverse().map((y, index) => pad(index + 9, options.padRowX, y, options.padWidth, options.padHeight)),
  ]
}

function footprint(options: GullWingFootprintOptions): string {
  const bodyHalfWidth = options.bodyWidth / 2
  const bodyHalfLength = options.bodyLength / 2
  const fabChamfer = Math.min(1, options.bodyLength / 5)
  const silkHalfWidth = bodyHalfWidth + 0.11
  const silkHalfLength = bodyHalfLength + 0.11
  const pinOneMarkerY = -bodyHalfLength + 0.75

  const silk = [
    line(-silkHalfWidth, -silkHalfLength, silkHalfWidth, -silkHalfLength, 0.12, 'F.SilkS'),
    line(-silkHalfWidth, silkHalfLength, silkHalfWidth, silkHalfLength, 0.12, 'F.SilkS'),
    line(-silkHalfWidth, -silkHalfLength, -silkHalfWidth, -bodyHalfLength, 0.12, 'F.SilkS'),
    line(silkHalfWidth, -silkHalfLength, silkHalfWidth, -bodyHalfLength, 0.12, 'F.SilkS'),
    line(-silkHalfWidth, bodyHalfLength, -silkHalfWidth, silkHalfLength, 0.12, 'F.SilkS'),
    line(silkHalfWidth, bodyHalfLength, silkHalfWidth, silkHalfLength, 0.12, 'F.SilkS'),
    `  (fp_circle (center ${number(-bodyHalfWidth + 0.55)} ${number(pinOneMarkerY)}) (end ${number(-bodyHalfWidth + 0.7)} ${number(pinOneMarkerY)})
    (stroke (width 0.1) (type solid)) (fill solid) (layer "F.SilkS"))`,
  ]

  const fab = [
    line(-bodyHalfWidth + fabChamfer, -bodyHalfLength, bodyHalfWidth, -bodyHalfLength, 0.1, 'F.Fab'),
    line(bodyHalfWidth, -bodyHalfLength, bodyHalfWidth, bodyHalfLength, 0.1, 'F.Fab'),
    line(bodyHalfWidth, bodyHalfLength, -bodyHalfWidth, bodyHalfLength, 0.1, 'F.Fab'),
    line(-bodyHalfWidth, bodyHalfLength, -bodyHalfWidth, -bodyHalfLength + fabChamfer, 0.1, 'F.Fab'),
    line(-bodyHalfWidth, -bodyHalfLength + fabChamfer, -bodyHalfWidth + fabChamfer, -bodyHalfLength, 0.1, 'F.Fab'),
  ]

  const courtyard = [
    line(
      -options.courtyardHalfWidth,
      -options.courtyardHalfLength,
      options.courtyardHalfWidth,
      -options.courtyardHalfLength,
      0.05,
      'F.CrtYd',
    ),
    line(
      options.courtyardHalfWidth,
      -options.courtyardHalfLength,
      options.courtyardHalfWidth,
      options.courtyardHalfLength,
      0.05,
      'F.CrtYd',
    ),
    line(
      options.courtyardHalfWidth,
      options.courtyardHalfLength,
      -options.courtyardHalfWidth,
      options.courtyardHalfLength,
      0.05,
      'F.CrtYd',
    ),
    line(
      -options.courtyardHalfWidth,
      options.courtyardHalfLength,
      -options.courtyardHalfWidth,
      -options.courtyardHalfLength,
      0.05,
      'F.CrtYd',
    ),
  ]

  return `(footprint "${options.name}" (version 20240108) (generator "saigen")
  (layer "F.Cu")
  (descr "${options.description}")
  (tags "${options.tags}")
  (attr smd)
  (fp_text reference "REF**" (at 0 ${number(options.referenceY)}) (layer "F.SilkS")
    (effects (font (size 1 1) (thickness 0.15))))
  (fp_text value "${options.name}" (at 0 ${number(options.valueY)}) (layer "F.Fab")
    (effects (font (size 1 1) (thickness 0.15))))
${silk.join('\n')}
${courtyard.join('\n')}
${fab.join('\n')}
  (fp_text user "\${REFERENCE}" (at 0 0 90) (layer "F.Fab")
    (effects (font (size 1 1) (thickness 0.15))))
${pads(options).join('\n')}
  (model "${options.model}"
    (offset (xyz 0 0 0))
    (scale (xyz 1 1 1))
    (rotate (xyz 0 0 0)))
)
`
}

const psl16 = footprint({
  name: SSI_PSL16_FOOTPRINT_NAME,
  description: 'Sound Semiconductor PSL16 16-lead SOP, JEDEC MS-012-AC; nominal body 3.9 x 9.9 mm, 1.27 mm pitch; package drawing https://www.soundsemiconductor.com/downloads/PODPSL16.pdf',
  tags: 'SSI PSL16 SOP SOIC-16 MS-012-AC 1.27mm',
  model: '${KICAD10_3DMODEL_DIR}/Package_SO.3dshapes/SOIC-16_3.9x9.9mm_P1.27mm.step',
  bodyWidth: 3.9,
  bodyLength: 9.9,
  padRowX: 2.475,
  padPitch: 1.27,
  padWidth: 1.95,
  padHeight: 0.6,
  courtyardHalfWidth: 3.7,
  courtyardHalfLength: 5.2,
  referenceY: -5.9,
  valueY: 5.9,
})

const pssl16 = footprint({
  name: SSI_PSSL16_FOOTPRINT_NAME,
  description: 'Sound Semiconductor PSSL16 16-lead SSOP, JEDEC MO-137-AB; nominal body 3.9 x 4.9 mm, 0.635 mm pitch; package drawing https://www.soundsemiconductor.com/downloads/PODPSSL16.pdf',
  tags: 'SSI PSSL16 SSOP-16 MO-137-AB 0.635mm',
  model: '${KICAD10_3DMODEL_DIR}/Package_SO.3dshapes/SSOP-16_3.9x4.9mm_P0.635mm.step',
  bodyWidth: 3.9,
  bodyLength: 4.9,
  padRowX: 2.625,
  padPitch: 0.635,
  padWidth: 1.65,
  padHeight: 0.4,
  courtyardHalfWidth: 3.7,
  courtyardHalfLength: 2.7,
  referenceY: -3.4,
  valueY: 3.4,
})

export const ssiFootprints = [
  {
    name: SSI_PSL16_FOOTPRINT_NAME,
    filename: `${SSI_PSL16_FOOTPRINT_NAME}.kicad_mod`,
    content: psl16,
  },
  {
    name: SSI_PSSL16_FOOTPRINT_NAME,
    filename: `${SSI_PSSL16_FOOTPRINT_NAME}.kicad_mod`,
    content: pssl16,
  },
] as const satisfies readonly KiCadFootprintFile[]
