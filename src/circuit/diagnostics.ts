import { catalogByKind } from './catalog'
import type { CircuitDocument } from './types'

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface CircuitDiagnostic {
  id: string
  severity: DiagnosticSeverity
  title: string
  detail: string
  componentIds: string[]
}

export function diagnoseCircuit(document: CircuitDocument): CircuitDiagnostic[] {
  const diagnostics: CircuitDiagnostic[] = []
  const components = new Map(document.components.map((component) => [component.id, component]))
  const componentIds = new Set(components.keys())
  const connectedPorts = new Set<string>()

  for (const connection of document.connections) {
    const fromComponent = components.get(connection.from.componentId)
    const toComponent = components.get(connection.to.componentId)
    if (!fromComponent || !toComponent) {
      diagnostics.push({
        id: `broken-net:${connection.id}`,
        severity: 'error',
        title: 'Broken net reference',
        detail: `${connection.id} points to a component that no longer exists.`,
        componentIds: [connection.from.componentId, connection.to.componentId].filter((id) => componentIds.has(id)),
      })
      continue
    }

    const fromPortExists = catalogByKind[fromComponent.kind].ports.some(
      (port) => port.id === connection.from.portId,
    )
    const toPortExists = catalogByKind[toComponent.kind].ports.some(
      (port) => port.id === connection.to.portId,
    )
    if (!fromPortExists || !toPortExists) {
      diagnostics.push({
        id: `broken-net:${connection.id}`,
        severity: 'error',
        title: 'Broken port reference',
        detail: `${connection.id} points to a port that does not exist.`,
        componentIds: [connection.from.componentId, connection.to.componentId],
      })
      continue
    }

    connectedPorts.add(`${connection.from.componentId}:${connection.from.portId}`)
    connectedPorts.add(`${connection.to.componentId}:${connection.to.portId}`)
  }

  const ground = document.components.find((component) => component.kind === 'ground')
  if (!ground) {
    diagnostics.push({
      id: 'missing-ground',
      severity: 'error',
      title: 'No reference ground',
      detail: 'Add a 0 V reference before running electrical analysis.',
      componentIds: [],
    })
  }

  if (!document.components.some((component) => component.kind === 'audioOutput')) {
    diagnostics.push({
      id: 'missing-output',
      severity: 'warning',
      title: 'No audio output',
      detail: 'Add an output jack or probe to monitor the final signal path.',
      componentIds: [],
    })
  }

  for (const component of document.components) {
    const catalog = catalogByKind[component.kind]
    if (component.kind === 'unknown') {
      diagnostics.push({
        id: `unsupported:${component.id}`,
        severity: 'warning',
        title: `${component.reference} has no model`,
        detail: 'The symbol is preserved visually but excluded from simulation.',
        componentIds: [component.id],
      })
    }

    const unconnectedPowerPorts = catalog.ports.filter(
      (port) => port.signal === 'power' && !port.defaultNet && !connectedPorts.has(`${component.id}:${port.id}`),
    )
    if (unconnectedPowerPorts.length > 0 && component.kind !== 'ground') {
      diagnostics.push({
        id: `unpowered:${component.id}`,
        severity: 'warning',
        title: `${component.reference} power is incomplete`,
        detail: `${unconnectedPowerPorts.map((port) => port.label).join(', ')} ${unconnectedPowerPorts.length === 1 ? 'is' : 'are'} not connected.`,
        componentIds: [component.id],
      })
    }
  }

  return diagnostics
}

export function diagnosticSummary(diagnostics: CircuitDiagnostic[]): { errors: number; warnings: number; info: number } {
  return diagnostics.reduce((summary, diagnostic) => {
    if (diagnostic.severity === 'error') summary.errors += 1
    else if (diagnostic.severity === 'warning') summary.warnings += 1
    else summary.info += 1
    return summary
  }, { errors: 0, warnings: 0, info: 0 })
}
