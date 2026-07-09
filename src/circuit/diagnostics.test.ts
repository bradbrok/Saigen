import { describe, expect, it } from 'vitest'
import { demoCircuit } from './demo'
import { diagnoseCircuit, diagnosticSummary } from './diagnostics'

describe('circuit diagnostics', () => {
  it('treats default-grounded SSI pins as connected', () => {
    const diagnostics = diagnoseCircuit(demoCircuit)
    expect(diagnostics.filter((diagnostic) => diagnostic.id.startsWith('unpowered:'))).toEqual([])
    expect(diagnosticSummary(diagnostics)).toEqual({ errors: 0, warnings: 0, info: 0 })
  })

  it('requires ground and an audio output', () => {
    const document = {
      ...demoCircuit,
      components: demoCircuit.components.filter(
        (component) => component.kind !== 'ground' && component.kind !== 'audioOutput',
      ),
      connections: [],
    }
    const ids = diagnoseCircuit(document).map((diagnostic) => diagnostic.id)
    expect(ids).toContain('missing-ground')
    expect(ids).toContain('missing-output')
  })

  it('detects stale connection endpoints', () => {
    const document = {
      ...demoCircuit,
      connections: [{
        ...demoCircuit.connections[0],
        id: 'broken',
        to: { componentId: 'missing', portId: 'in' },
      }],
    }
    expect(diagnoseCircuit(document)[0].id).toBe('broken-net:broken')
  })

  it('detects connection endpoints that name missing ports', () => {
    const document = {
      ...demoCircuit,
      connections: [{
        id: 'broken-port',
        from: { componentId: 'vcf', portId: 'gnd' },
        to: { componentId: 'ground', portId: 'missing' },
        signal: 'power' as const,
      }],
    }
    const diagnostic = diagnoseCircuit(document).find((item) => item.id === 'broken-net:broken-port')

    expect(diagnostic?.title).toBe('Broken port reference')
    expect(diagnostic?.componentIds).toEqual(['vcf', 'ground'])
  })
})
