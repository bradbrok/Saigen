import { describe, expect, it } from 'vitest'
import { demoCircuit } from './demo'
import { planConnection } from './connections'

describe('directed connection planning', () => {
  it('normalizes an output to connection.from regardless of pointer order', () => {
    const output = { componentId: 'vcf', portId: 'out' }
    const input = { componentId: 'vca', portId: 'audio' }

    expect(planConnection(demoCircuit, input, output)).toEqual({
      ok: true,
      from: output,
      to: input,
      signal: 'audio',
    })
    expect(planConnection(demoCircuit, output, input)).toEqual({
      ok: true,
      from: output,
      to: input,
      signal: 'audio',
    })
  })

  it('normalizes a rail symbol ahead of a component power pin', () => {
    expect(planConnection(
      demoCircuit,
      { componentId: 'vca', portId: 'gnd' },
      { componentId: 'ground', portId: '1' },
    )).toEqual({
      ok: true,
      from: { componentId: 'ground', portId: '1' },
      to: { componentId: 'vca', portId: 'gnd' },
      signal: 'power',
    })
  })

  it('preserves guided connections through passive terminals', () => {
    const resistor = {
      id: 'review-resistor',
      kind: 'resistor' as const,
      reference: 'R99',
      label: 'PASSIVE',
      position: { x: 0, y: 0 },
      parameters: {},
    }
    const document = { ...demoCircuit, components: [...demoCircuit.components, resistor] }

    expect(planConnection(
      document,
      { componentId: 'review-resistor', portId: '1' },
      { componentId: 'ground', portId: '1' },
    )).toEqual({
      ok: true,
      from: { componentId: 'ground', portId: '1' },
      to: { componentId: 'review-resistor', portId: '1' },
      signal: 'power',
    })
    expect(planConnection(
      document,
      { componentId: 'vca', portId: 'audio' },
      { componentId: 'review-resistor', portId: '2' },
    )).toEqual({
      ok: true,
      from: { componentId: 'review-resistor', portId: '2' },
      to: { componentId: 'vca', portId: 'audio' },
      signal: 'audio',
    })
  })

  it('rejects input-input and output-output pairs', () => {
    expect(planConnection(
      demoCircuit,
      { componentId: 'vcf', portId: 'audio' },
      { componentId: 'vca', portId: 'audio' },
    )).toEqual({ ok: false, reason: 'direction-mismatch' })
    expect(planConnection(
      demoCircuit,
      { componentId: 'vco', portId: 'saw' },
      { componentId: 'vcf', portId: 'out' },
    )).toEqual({ ok: false, reason: 'direction-mismatch' })
  })

  it('rejects mismatched signal domains before direction planning', () => {
    expect(planConnection(
      demoCircuit,
      { componentId: 'vco', portId: 'saw' },
      { componentId: 'envelope', portId: 'gate' },
    )).toEqual({ ok: false, reason: 'signal-mismatch' })
  })
})
