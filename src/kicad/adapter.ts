import { catalogByKind } from '../circuit/catalog'
import type {
  CircuitComponent,
  CircuitConnection,
  CircuitDocument,
  ComponentKind,
  ComponentPort,
  ImportResult,
  SignalType,
} from '../circuit/types'
import {
  atomAt,
  directChild,
  directChildren,
  expressionHead,
  parseSExpressions,
  type SExpression,
} from './sexpr'
import {
  editorPin,
  ssiDeviceByKind,
  ssiDevices,
  type KiCadDeviceDefinition,
  type KiCadDevicePin,
  type KiCadDeviceUnit,
} from './devices'

const SYMBOL_PIXEL_TO_MM = 0.1
const CANVAS_PIXEL_TO_MM = 0.2
const ORIGIN_X = 30
const ORIGIN_Y = 25
const PIN_LENGTH = 2.54
const KICAD_GRID = 1.27

interface ExportOrigin {
  x: number
  y: number
}

function compactNumber(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function snapToGrid(value: number): number {
  return Math.round(value / KICAD_GRID) * KICAD_GRID
}

function evenGridCeiling(value: number): number {
  return Math.ceil(value / (KICAD_GRID * 2)) * KICAD_GRID * 2
}

function escapeString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function stableUuid(value: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
  let hex = seeds.map((seed) => hash32(value, seed).toString(16).padStart(8, '0')).join('')
  hex = `${hex.slice(0, 12)}4${hex.slice(13, 16)}a${hex.slice(17)}`
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function symbolName(kind: ComponentKind): string {
  return `Saigen:${symbolEntryName(kind)}`
}

function symbolEntryName(kind: ComponentKind): string {
  return ssiDeviceByKind[kind]?.symbolName ?? kind.replace(/[^a-z0-9_]/gi, '_')
}

function pinType(port: ComponentPort): string {
  switch (port.direction) {
    case 'input': return 'input'
    case 'output': return 'output'
    case 'passive': return 'passive'
    case 'powerInput': return 'power_in'
    case 'powerOutput': return 'power_out'
  }
}

function localPortPosition(kind: ComponentKind, port: ComponentPort): { x: number; y: number; angle: number } {
  const { width: bodyWidth, height: bodyHeight } = genericBodySize(kind)

  switch (port.side) {
    case 'left':
      return {
        x: -bodyWidth / 2 - PIN_LENGTH,
        y: snapToGrid(bodyHeight / 2 - port.offset * SYMBOL_PIXEL_TO_MM),
        angle: 0,
      }
    case 'right':
      return {
        x: bodyWidth / 2 + PIN_LENGTH,
        y: snapToGrid(bodyHeight / 2 - port.offset * SYMBOL_PIXEL_TO_MM),
        angle: 180,
      }
    case 'top':
      return {
        x: snapToGrid(port.offset * SYMBOL_PIXEL_TO_MM - bodyWidth / 2),
        y: bodyHeight / 2 + PIN_LENGTH,
        angle: 270,
      }
    case 'bottom':
      return {
        x: snapToGrid(port.offset * SYMBOL_PIXEL_TO_MM - bodyWidth / 2),
        y: -bodyHeight / 2 - PIN_LENGTH,
        angle: 90,
      }
  }
}

function genericBodySize(kind: ComponentKind): { width: number; height: number } {
  const size = catalogByKind[kind].size
  return {
    width: Math.max(KICAD_GRID * 4, evenGridCeiling(size.width * SYMBOL_PIXEL_TO_MM)),
    height: Math.max(KICAD_GRID * 4, evenGridCeiling(size.height * SYMBOL_PIXEL_TO_MM)),
  }
}

function exportOrigin(document: CircuitDocument): ExportOrigin {
  const minX = Math.min(0, ...document.components.map((component) => component.position.x))
  const minY = Math.min(0, ...document.components.map((component) => component.position.y))
  return {
    x: ORIGIN_X - minX * CANVAS_PIXEL_TO_MM,
    y: ORIGIN_Y - minY * CANVAS_PIXEL_TO_MM,
  }
}

function componentCenter(component: CircuitComponent, origin: ExportOrigin): { x: number; y: number } {
  const { width, height } = catalogByKind[component.kind].size
  return {
    x: snapToGrid(origin.x + (component.position.x + width / 2) * CANVAS_PIXEL_TO_MM),
    y: snapToGrid(origin.y + (component.position.y + height / 2) * CANVAS_PIXEL_TO_MM),
  }
}

interface LocalPinPosition {
  x: number
  y: number
  angle: number
}

function devicePinPosition(unit: KiCadDeviceUnit, pin: KiCadDevicePin): LocalPinPosition {
  const width = unit.width ?? 15.24
  const height = unit.height ?? 12.7
  const peers = unit.pins.filter((candidate) => candidate.side === pin.side)
  const index = peers.indexOf(pin)
  const centered = index - (peers.length - 1) / 2

  switch (pin.side) {
    case 'left':
      return { x: -width / 2 - PIN_LENGTH, y: -centered * 2.54, angle: 0 }
    case 'right':
      return { x: width / 2 + PIN_LENGTH, y: -centered * 2.54, angle: 180 }
    case 'top':
      return { x: centered * 2.54, y: height / 2 + PIN_LENGTH, angle: 270 }
    case 'bottom':
      return { x: centered * 2.54, y: -height / 2 - PIN_LENGTH, angle: 90 }
  }
}

function unitLayout(device: KiCadDeviceDefinition): Map<number, { x: number; y: number }> {
  const maxWidth = Math.max(...device.units.map((unit) => unit.width ?? 15.24))
  const maxHeight = Math.max(...device.units.map((unit) => unit.height ?? 12.7))
  const columnGap = evenGridCeiling(maxWidth + PIN_LENGTH * 2 + 3)
  const rowGap = evenGridCeiling(maxHeight + PIN_LENGTH * 2 + 3)
  const columns = device.units.length === 1 ? 1 : 2
  const rows = Math.ceil(device.units.length / columns)
  const positions = new Map<number, { x: number; y: number }>()

  device.units.forEach((unit, index) => {
    const row = Math.floor(index / columns)
    const rowCount = Math.min(columns, device.units.length - row * columns)
    const column = index % columns
    positions.set(unit.number, {
      x: snapToGrid((column - (rowCount - 1) / 2) * columnGap),
      y: snapToGrid((row - (rows - 1) / 2) * rowGap),
    })
  })

  return positions
}

function unitCenter(
  component: CircuitComponent,
  device: KiCadDeviceDefinition,
  unit: KiCadDeviceUnit,
  origin: ExportOrigin,
): { x: number; y: number } {
  const center = componentCenter(component, origin)
  const offset = unitLayout(device).get(unit.number) ?? { x: 0, y: 0 }
  return { x: center.x + offset.x, y: center.y + offset.y }
}

function absolutePortPosition(
  component: CircuitComponent,
  portId: string,
  origin: ExportOrigin,
): { x: number; y: number } | undefined {
  const catalog = catalogByKind[component.kind]
  const port = catalog.ports.find((candidate) => candidate.id === portId)
  if (!port) return undefined
  const device = ssiDeviceByKind[component.kind]
  if (device) {
    const physicalPin = editorPin(device, portId)
    if (!physicalPin) return undefined
    const center = unitCenter(component, device, physicalPin.unit, origin)
    const local = devicePinPosition(physicalPin.unit, physicalPin.pin)
    return { x: center.x + local.x, y: center.y - local.y }
  }
  const center = componentCenter(component, origin)
  const local = localPortPosition(component.kind, port)
  return { x: center.x + local.x, y: center.y - local.y }
}

function propertyLine(name: string, value: string, id: number, x: number, y: number, hidden = true): string {
  return `    (property "${escapeString(name)}" "${escapeString(value)}" (id ${id}) (at ${compactNumber(x)} ${compactNumber(y)} 0)\n      (effects (font (size 1.27 1.27))${hidden ? ' hide' : ''})\n    )`
}

function genericLibrarySymbolDefinition(kind: ComponentKind, qualified: boolean): string {
  const catalog = catalogByKind[kind]
  const name = symbolEntryName(kind)
  const { width, height } = genericBodySize(kind)
  const halfWidth = width / 2
  const halfHeight = height / 2
  const pins = catalog.ports.map((port) => {
    const position = localPortPosition(kind, port)
    const pinNumber = port.pinNumber ?? port.id
    return `      (pin ${pinType(port)} line (at ${compactNumber(position.x)} ${compactNumber(position.y)} ${position.angle}) (length ${PIN_LENGTH})\n        (name "${escapeString(port.label)}" (effects (font (size 1.02 1.02))))\n        (number "${escapeString(pinNumber)}" (effects (font (size 1.02 1.02))))\n      )`
  }).join('\n')

  return `  (symbol "${qualified ? symbolName(kind) : name}" (pin_names (offset 0.635)) (in_bom yes) (on_board yes)
${propertyLine('Reference', catalogByKind[kind].shortName.startsWith('#') ? '#PWR' : 'U', 0, 0, halfHeight + 2.6, false)}
${propertyLine('Value', catalog.name, 1, 0, -halfHeight - 2.6, false)}
${propertyLine('Footprint', '', 2, 0, 0)}
${propertyLine('Datasheet', '', 3, 0, 0)}
    (symbol "${name}_0_1"
      (rectangle (start ${compactNumber(-halfWidth)} ${compactNumber(halfHeight)}) (end ${compactNumber(halfWidth)} ${compactNumber(-halfHeight)})
        (stroke (width 0.254) (type default))
        (fill (type background))
      )
    )
    (symbol "${name}_1_1"
${pins}
    )
  )`
}

function deviceLibrarySymbolDefinition(device: KiCadDeviceDefinition, qualified: boolean): string {
  const maxHalfHeight = Math.max(...device.units.map((unit) => (unit.height ?? 12.7) / 2))
  const units = device.units.map((unit) => {
    const width = unit.width ?? 15.24
    const height = unit.height ?? 12.7
    const pins = unit.pins.map((pin) => {
      const position = devicePinPosition(unit, pin)
      return `      (pin ${pin.electricalType} line (at ${compactNumber(position.x)} ${compactNumber(position.y)} ${position.angle}) (length ${PIN_LENGTH})
        (name "${escapeString(pin.name)}" (effects (font (size 1.02 1.02))))
        (number "${escapeString(pin.number)}" (effects (font (size 1.02 1.02))))
      )`
    }).join('\n')

    return `    (symbol "${device.symbolName}_${unit.number}_1"
      (rectangle (start ${compactNumber(-width / 2)} ${compactNumber(height / 2)}) (end ${compactNumber(width / 2)} ${compactNumber(-height / 2)})
        (stroke (width 0.254) (type default))
        (fill (type background))
      )
      (text "${escapeString(unit.name.toUpperCase())}" (at 0 0 0)
        (effects (font (size 1.02 1.02) (thickness 0.15)))
      )
${pins}
      (unit_name "${escapeString(unit.name)}")
    )`
  }).join('\n')

  return `  (symbol "${qualified ? `Saigen:${device.symbolName}` : device.symbolName}" (pin_names (offset 0.635)) (in_bom yes) (on_board yes)
${propertyLine('Reference', 'U', 0, 0, maxHalfHeight + 2.6, false)}
${propertyLine('Value', device.value, 1, 0, -maxHalfHeight - 2.6, false)}
${propertyLine('Footprint', device.footprint, 2, 0, 0)}
${propertyLine('Datasheet', device.datasheet, 3, 0, 0)}
${propertyLine('Manufacturer', device.manufacturer, 4, 0, 0)}
${propertyLine('MPN', device.mpn, 5, 0, 0)}
${propertyLine('Package', device.packageName, 6, 0, 0)}
${propertyLine('ki_description', device.description, 7, 0, 0)}
${propertyLine('ki_locked', 'yes', 8, 0, 0)}
${units}
  )`
}

function librarySymbolDefinition(kind: ComponentKind, qualified = true): string {
  const device = ssiDeviceByKind[kind]
  return device
    ? deviceLibrarySymbolDefinition(device, qualified)
    : genericLibrarySymbolDefinition(kind, qualified)
}

export function exportKicadSymbolLibrary(kinds: readonly ComponentKind[] = ssiDevices.map((device) => device.kind)): string {
  const uniqueKinds = [...new Set(kinds)]
  return `(kicad_symbol_lib (version 20231120) (generator saigen)
${uniqueKinds.map((kind) => librarySymbolDefinition(kind, false)).join('\n')}
)
`
}

function outgoingMetadata(document: CircuitDocument, componentId: string): string {
  return document.connections
    .filter((connection) => connection.from.componentId === componentId)
    .map((connection) => [
      connection.id,
      connection.from.portId,
      connection.to.componentId,
      connection.to.portId,
      connection.signal,
    ].join('|'))
    .join(';')
}

function genericInstanceSymbol(document: CircuitDocument, component: CircuitComponent, origin: ExportOrigin): string {
  const center = componentCenter(component, origin)
  const catalog = catalogByKind[component.kind]
  const uuid = stableUuid(`${document.id}:component:${component.id}`)
  const value = component.value ?? catalog.name
  const bodyHeight = genericBodySize(component.kind).height
  const properties = [
    propertyLine('Reference', component.reference, 0, center.x, center.y - bodyHeight / 2 - 2.6, false),
    propertyLine('Value', value, 1, center.x, center.y + bodyHeight / 2 + 2.6, false),
    propertyLine('Footprint', '', 2, center.x, center.y),
    propertyLine('Datasheet', '', 3, center.x, center.y),
    propertyLine('Saigen.Id', component.id, 4, center.x, center.y),
    propertyLine('Saigen.Kind', component.kind, 5, center.x, center.y),
    propertyLine('Saigen.Position', `${component.position.x},${component.position.y}`, 6, center.x, center.y),
    propertyLine('Saigen.Parameters', JSON.stringify(component.parameters), 7, center.x, center.y),
    propertyLine('Saigen.Connections', outgoingMetadata(document, component.id), 8, center.x, center.y),
    propertyLine('Saigen.SourceLibraryId', catalog.kicadLibraryId ?? '', 9, center.x, center.y),
  ].join('\n')
  const pins = catalog.ports.map((port) =>
    `    (pin "${escapeString(port.pinNumber ?? port.id)}" (uuid ${stableUuid(`${uuid}:pin:${port.id}`)}))`,
  ).join('\n')

  return `  (symbol (lib_id "${symbolName(component.kind)}") (at ${compactNumber(center.x)} ${compactNumber(center.y)} 0) (unit 1)
    (in_bom yes) (on_board yes) (uuid ${uuid})
    (default_instance (reference "${escapeString(component.reference)}") (unit 1) (value "${escapeString(value)}") (footprint ""))
${properties}
${pins}
  )`
}

function deviceInstanceSymbols(
  document: CircuitDocument,
  component: CircuitComponent,
  device: KiCadDeviceDefinition,
  origin: ExportOrigin,
): string[] {
  const catalog = catalogByKind[component.kind]
  const value = component.value ?? device.value
  return device.units.map((unit) => {
    const center = unitCenter(component, device, unit, origin)
    const uuid = stableUuid(`${document.id}:component:${component.id}:unit:${unit.number}`)
    const height = unit.height ?? 12.7
    const properties = [
      propertyLine('Reference', component.reference, 0, center.x, center.y - height / 2 - 2.6, false),
      propertyLine('Value', value, 1, center.x, center.y + height / 2 + 2.6, false),
      propertyLine('Footprint', device.footprint, 2, center.x, center.y),
      propertyLine('Datasheet', device.datasheet, 3, center.x, center.y),
      propertyLine('Manufacturer', device.manufacturer, 4, center.x, center.y),
      propertyLine('MPN', device.mpn, 5, center.x, center.y),
      propertyLine('Package', device.packageName, 6, center.x, center.y),
      propertyLine('Saigen.Id', component.id, 20, center.x, center.y),
      propertyLine('Saigen.Kind', component.kind, 21, center.x, center.y),
      propertyLine('Saigen.Position', `${component.position.x},${component.position.y}`, 22, center.x, center.y),
      propertyLine('Saigen.Parameters', JSON.stringify(component.parameters), 23, center.x, center.y),
      propertyLine('Saigen.Connections', outgoingMetadata(document, component.id), 24, center.x, center.y),
      propertyLine('Saigen.SourceLibraryId', catalog.kicadLibraryId ?? '', 25, center.x, center.y),
      propertyLine('Saigen.UnitName', unit.name, 26, center.x, center.y),
    ].join('\n')
    const pins = unit.pins.map((pin) =>
      `    (pin "${escapeString(pin.number)}" (uuid ${stableUuid(`${uuid}:pin:${pin.number}`)}))`,
    ).join('\n')

    return `  (symbol (lib_id "${symbolName(component.kind)}") (at ${compactNumber(center.x)} ${compactNumber(center.y)} 0) (unit ${unit.number})
    (in_bom yes) (on_board yes) (uuid ${uuid})
    (default_instance (reference "${escapeString(component.reference)}") (unit ${unit.number}) (value "${escapeString(value)}") (footprint "${escapeString(device.footprint)}"))
${properties}
${pins}
  )`
  })
}

function instanceSymbols(document: CircuitDocument, component: CircuitComponent, origin: ExportOrigin): string[] {
  const device = ssiDeviceByKind[component.kind]
  return device
    ? deviceInstanceSymbols(document, component, device, origin)
    : [genericInstanceSymbol(document, component, origin)]
}

function effectiveConnections(document: CircuitDocument): CircuitConnection[] {
  const connections = [...document.connections]
  const components = new Map(document.components.map((component) => [component.id, component]))
  const explicitlyConnected = new Set<string>()
  for (const connection of document.connections) {
    const fromComponent = components.get(connection.from.componentId)
    const toComponent = components.get(connection.to.componentId)
    const fromPortExists = fromComponent
      ? catalogByKind[fromComponent.kind].ports.some((port) => port.id === connection.from.portId)
      : false
    const toPortExists = toComponent
      ? catalogByKind[toComponent.kind].ports.some((port) => port.id === connection.to.portId)
      : false
    if (!fromPortExists || !toPortExists) continue
    explicitlyConnected.add(`${connection.from.componentId}:${connection.from.portId}`)
    explicitlyConnected.add(`${connection.to.componentId}:${connection.to.portId}`)
  }

  const defaultTargets = {
    GND: document.components.find((component) => component.kind === 'ground'),
    '+12V': document.components.find((component) => component.kind === 'plus12V'),
    '-12V': document.components.find((component) => component.kind === 'minus12V'),
  }

  for (const component of document.components) {
    for (const port of catalogByKind[component.kind].ports) {
      if (!port.defaultNet || explicitlyConnected.has(`${component.id}:${port.id}`)) continue
      const target = defaultTargets[port.defaultNet]
      if (!target || target.id === component.id) continue
      const targetPort = catalogByKind[target.kind].ports[0]
      if (!targetPort) continue
      connections.push({
        id: `implicit-${component.id}-${port.id}-${port.defaultNet}`,
        from: { componentId: target.id, portId: targetPort.id },
        to: { componentId: component.id, portId: port.id },
        signal: 'power',
      })
    }
  }

  return connections
}

function wireSegments(document: CircuitDocument, origin: ExportOrigin): string[] {
  const components = new Map(document.components.map((component) => [component.id, component]))
  const wires: string[] = []

  for (const connection of effectiveConnections(document)) {
    const fromComponent = components.get(connection.from.componentId)
    const toComponent = components.get(connection.to.componentId)
    if (!fromComponent || !toComponent) continue
    const from = absolutePortPosition(fromComponent, connection.from.portId, origin)
    const to = absolutePortPosition(toComponent, connection.to.portId, origin)
    if (!from || !to) continue
    const middleX = snapToGrid((from.x + to.x) / 2)
    const points = [from, { x: middleX, y: from.y }, { x: middleX, y: to.y }, to]

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      if (Math.abs(start.x - end.x) < 1e-6 && Math.abs(start.y - end.y) < 1e-6) continue
      wires.push(`  (wire (pts (xy ${compactNumber(start.x)} ${compactNumber(start.y)}) (xy ${compactNumber(end.x)} ${compactNumber(end.y)}))
    (stroke (width 0) (type default))
    (uuid ${stableUuid(`${document.id}:wire:${connection.id}:${index}`)})
  )`)
    }
  }

  return wires
}

export function exportKicadSchematic(document: CircuitDocument): string {
  const kinds = [...new Set(document.components.map((component) => component.kind))]
  const origin = exportOrigin(document)
  const rootUuid = stableUuid(`${document.id}:root`)
  const title = escapeString(document.title)
  const libSymbols = kinds.map((kind) => librarySymbolDefinition(kind)).join('\n')
  const symbols = document.components.flatMap((component) => instanceSymbols(document, component, origin)).join('\n')
  const wires = wireSegments(document, origin).join('\n')
  const symbolInstances = document.components.flatMap((component) => {
    const catalog = catalogByKind[component.kind]
    const device = ssiDeviceByKind[component.kind]
    const value = component.value ?? device?.value ?? catalog.name
    const footprint = device?.footprint ?? ''
    const units = device?.units ?? [{ number: 1 }]
    return units.map((unit) => {
      const uuid = device
        ? stableUuid(`${document.id}:component:${component.id}:unit:${unit.number}`)
        : stableUuid(`${document.id}:component:${component.id}`)
      return `    (path "/${uuid}" (reference "${escapeString(component.reference)}") (unit ${unit.number}) (value "${escapeString(value)}") (footprint "${escapeString(footprint)}"))`
    })
  }).join('\n')

  return `(kicad_sch (version 20220404) (generator saigen)
  (uuid ${rootUuid})
  (paper "A4")
  (title_block (title "${title}") (rev "${document.revision}"))
  (lib_symbols
${libSymbols}
  )
${wires}
${symbols}
  (sheet_instances (path "/" (page "1")))
  (symbol_instances
${symbolInstances}
  )
)
`
}

function propertiesOf(symbol: SExpression): Map<string, string> {
  const properties = new Map<string, string>()
  for (const property of directChildren(symbol, 'property')) {
    const name = atomAt(property, 1)
    const value = atomAt(property, 2)
    if (name !== undefined && value !== undefined) properties.set(name, value)
  }
  return properties
}

function embeddedProperty(properties: Map<string, string>, name: string): string | undefined {
  return properties.get(`Saigen.${name}`) ?? properties.get(`EuroSim.${name}`)
}

function isComponentKind(value: string | undefined): value is ComponentKind {
  return value !== undefined && Object.hasOwn(catalogByKind, value)
}

function inferKind(libraryId: string, reference: string): ComponentKind {
  const normalized = libraryId.toLowerCase()
  const librarySymbol = normalized.slice(normalized.lastIndexOf(':') + 1)
  if (normalized.includes('ssi2131')) return 'ssi2131'
  if (normalized.includes('ssi2144')) return 'ssi2144'
  if (normalized.includes('ssi2164')) return 'ssi2164'
  if (librarySymbol === '+12v') return 'plus12V'
  if (librarySymbol === '-12v') return 'minus12V'
  if (librarySymbol.startsWith('gnd')) return 'ground'
  if (normalized.endsWith(':r') || reference.startsWith('R')) return 'resistor'
  if (normalized.endsWith(':c') || reference.startsWith('C')) return 'capacitor'
  if (normalized.includes('potentiometer') || reference.startsWith('RV')) return 'potentiometer'
  if (normalized.includes('opamp') || normalized.includes('tl07')) return 'opAmp'
  if (reference.startsWith('J')) return 'audioInput'
  return 'unknown'
}

function parseConnectionMetadata(source: CircuitComponent, metadata: string): CircuitConnection[] {
  if (!metadata) return []
  return metadata.split(';').flatMap((encoded) => {
    const [id, fromPort, targetId, targetPort, signal] = encoded.split('|')
    const validSignals: SignalType[] = ['audio', 'cv', 'gate', 'power', 'passive']
    if (!id || !fromPort || !targetId || !targetPort || !validSignals.includes(signal as SignalType)) return []
    return [{
      id,
      from: { componentId: source.id, portId: fromPort },
      to: { componentId: targetId, portId: targetPort },
      signal: signal as SignalType,
    }]
  })
}

function findRoot(expressions: SExpression[]): SExpression[] {
  const root = expressions.find(
    (expression): expression is SExpression[] => Array.isArray(expression) && expressionHead(expression) === 'kicad_sch',
  )
  if (!root) throw new Error('This file is not a modern KiCad schematic')
  return root
}

export function importKicadSchematic(source: string): ImportResult {
  const root = findRoot(parseSExpressions(source))
  const warnings: string[] = []
  const symbols = directChildren(root, 'symbol').filter((symbol) => directChild(symbol, 'lib_id'))
  const metadataById = new Map<string, string>()
  const seenLogicalSymbols = new Map<string, string>()
  let usedEmbeddedPositions = false

  const components: CircuitComponent[] = []
  symbols.forEach((symbol, index) => {
    const properties = propertiesOf(symbol)
    const libraryId = atomAt(directChild(symbol, 'lib_id'), 1) ?? 'Unknown:Symbol'
    const reference = properties.get('Reference') ?? `U${index + 1}`
    const embeddedKind = embeddedProperty(properties, 'Kind')
    const kind = isComponentKind(embeddedKind) ? embeddedKind : inferKind(libraryId, reference)
    const embeddedId = embeddedProperty(properties, 'Id')
    const logicalKey = embeddedId ? `saigen:${embeddedId}` : `kicad:${libraryId}:${reference}`
    const existingId = seenLogicalSymbols.get(logicalKey)
    if (existingId) {
      const encodedConnections = embeddedProperty(properties, 'Connections')
      if (encodedConnections && !metadataById.get(existingId)) metadataById.set(existingId, encodedConnections)
      return
    }
    if (kind === 'unknown') warnings.push(`${reference}: ${libraryId} was imported as an unsupported visual block.`)
    const id = embeddedId ?? atomAt(directChild(symbol, 'uuid'), 1) ?? `imported-${index + 1}`
    seenLogicalSymbols.set(logicalKey, id)
    const positionProperty = embeddedProperty(properties, 'Position')
    const at = directChild(symbol, 'at')
    const centerX = Number(atomAt(at, 1) ?? ORIGIN_X)
    const centerY = Number(atomAt(at, 2) ?? ORIGIN_Y)
    const catalog = catalogByKind[kind]
    let position = {
      x: (centerX - ORIGIN_X) / CANVAS_PIXEL_TO_MM - catalog.size.width / 2,
      y: (centerY - ORIGIN_Y) / CANVAS_PIXEL_TO_MM - catalog.size.height / 2,
    }

    if (positionProperty) {
      const [x, y] = positionProperty.split(',').map(Number)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        position = { x, y }
        usedEmbeddedPositions = true
      }
    }

    let parameters: Record<string, number> = { ...(catalog.defaultParameters ?? {}) }
    const encodedParameters = embeddedProperty(properties, 'Parameters')
    if (encodedParameters) {
      try {
        const parsed = JSON.parse(encodedParameters) as Record<string, number>
        parameters = parsed
      } catch {
        warnings.push(`${reference}: Saigen parameter metadata could not be read.`)
      }
    }

    metadataById.set(id, embeddedProperty(properties, 'Connections') ?? '')
    components.push({
      id,
      kind,
      reference,
      label: properties.get('Value') ?? catalog.name,
      value: properties.get('Value'),
      position,
      parameters,
    })
  })

  if (components.length === 0) throw new Error('No schematic symbols were found in this KiCad file')

  if (!usedEmbeddedPositions) {
    const minX = Math.min(...components.map((component) => component.position.x))
    const minY = Math.min(...components.map((component) => component.position.y))
    for (const component of components) {
      component.position.x += 42 - minX
      component.position.y += 82 - minY
    }
  }

  const componentIds = new Set(components.map((component) => component.id))
  const connections = components.flatMap((component) =>
    parseConnectionMetadata(component, metadataById.get(component.id) ?? ''),
  ).filter((connection) => componentIds.has(connection.to.componentId))

  const wireCount = directChildren(root, 'wire').length
  if (wireCount > 0 && connections.length === 0) {
    warnings.push(
      `${wireCount} KiCad wire segments were detected. Generic pin-to-wire connectivity inference is not enabled in this preview.`,
    )
  }

  const titleBlock = directChild(root, 'title_block')
  const title = atomAt(directChild(titleBlock, 'title'), 1) ?? 'Imported KiCad schematic'

  return {
    document: {
      schemaVersion: 1,
      id: `kicad-${Date.now().toString(36)}`,
      title,
      description: 'Imported from a flat KiCad schematic.',
      revision: 1,
      components,
      connections,
    },
    warnings,
  }
}
