import { catalogByKind } from './catalog'
import type {
  CircuitDocument,
  ComponentPort,
  PortRef,
  SignalType,
} from './types'

export type ConnectionRejectionReason = 'missing-endpoint' | 'signal-mismatch' | 'direction-mismatch'

export type ConnectionPlan =
  | { ok: true; from: PortRef; to: PortRef; signal: SignalType }
  | { ok: false; reason: ConnectionRejectionReason }

interface ResolvedEndpoint {
  ref: PortRef
  port: ComponentPort
}

type EndpointRole = 'driver' | 'sink' | 'passive'

function resolveEndpoint(document: CircuitDocument, ref: PortRef): ResolvedEndpoint | undefined {
  const component = document.components.find((candidate) => candidate.id === ref.componentId)
  if (!component) return undefined
  const port = catalogByKind[component.kind].ports.find((candidate) => candidate.id === ref.portId)
  return port ? { ref, port } : undefined
}

function endpointRole(endpoint: ResolvedEndpoint): EndpointRole {
  if (endpoint.port.direction === 'output' || endpoint.port.direction === 'powerOutput') return 'driver'
  if (endpoint.port.direction === 'input' || endpoint.port.direction === 'powerInput') return 'sink'
  return 'passive'
}

function endpointKey(endpoint: ResolvedEndpoint): string {
  return `${endpoint.ref.componentId}:${endpoint.ref.portId}`
}

function connectionSignal(first: ComponentPort, second: ComponentPort): SignalType {
  if (first.signal === 'passive') return second.signal
  return first.signal
}

/**
 * Validate and orient a guided connection independently of pointer order.
 * Sources and rail symbols lead, sinks trail, and otherwise-undirected passive
 * pairs use a stable key order.
 */
export function planConnection(document: CircuitDocument, firstRef: PortRef, secondRef: PortRef): ConnectionPlan {
  const first = resolveEndpoint(document, firstRef)
  const second = resolveEndpoint(document, secondRef)
  if (!first || !second) return { ok: false, reason: 'missing-endpoint' }

  const signalsMatch = first.port.signal === second.port.signal ||
    first.port.signal === 'passive' || second.port.signal === 'passive'
  if (!signalsMatch) return { ok: false, reason: 'signal-mismatch' }

  const firstRole = endpointRole(first)
  const secondRole = endpointRole(second)
  if (firstRole === secondRole && firstRole !== 'passive') {
    return { ok: false, reason: 'direction-mismatch' }
  }

  let from = first
  let to = second
  if (secondRole === 'driver' || firstRole === 'sink') {
    from = second
    to = first
  } else if (firstRole === 'passive' && secondRole === 'passive' && endpointKey(first) > endpointKey(second)) {
    from = second
    to = first
  }

  return {
    ok: true,
    from: { ...from.ref },
    to: { ...to.ref },
    signal: connectionSignal(first.port, second.port),
  }
}
