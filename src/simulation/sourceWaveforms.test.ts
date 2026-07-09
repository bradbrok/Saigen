import { describe, expect, it } from 'vitest'
import type { CircuitComponent, ComponentKind } from '../circuit/types'
import { evaluateSourceWaveform } from './sourceWaveforms'

function source(kind: ComponentKind, parameters: Record<string, number>): CircuitComponent {
  return {
    id: kind,
    kind,
    reference: 'V1',
    label: kind,
    position: { x: 0, y: 0 },
    parameters,
  }
}

describe('ideal source waveforms', () => {
  it('keeps constant CV independent of global synth controls', () => {
    const component = source('cvInput', { voltage: 1.25 })
    expect(evaluateSourceWaveform(component, 'out', 0)).toBe(1.25)
    expect(evaluateSourceWaveform(component, 'out', 100)).toBe(1.25)
  })

  it('honors gate state and high voltage', () => {
    expect(evaluateSourceWaveform(source('gateInput', { state: 1, voltage: 8 }), 'out', 0)).toBe(8)
    expect(evaluateSourceWaveform(source('gateInput', { state: 0, voltage: 8 }), 'out', 0)).toBe(0)
  })

  it('uses trigger pulse width in seconds without a duty-cycle floor', () => {
    const component = source('triggerSource', { rate: 0.1, pulseWidthMs: 1, voltage: 5 })
    expect(evaluateSourceWaveform(component, 'trigger', 0.0005)).toBe(5)
    expect(evaluateSourceWaveform(component, 'trigger', 0.002)).toBe(0)
    expect(evaluateSourceWaveform(component, 'trigger', 10.0005)).toBe(5)
  })

  it('produces each function-generator waveform with shared amplitude and offset', () => {
    const component = source('functionGenerator', {
      frequency: 1,
      amplitude: 2,
      offset: 1,
      dutyCycle: 0.25,
    })
    expect(evaluateSourceWaveform(component, 'sine', 0.25)).toBeCloseTo(3)
    expect(evaluateSourceWaveform(component, 'triangle', 0.5)).toBeCloseTo(3)
    expect(evaluateSourceWaveform(component, 'saw', 0.5)).toBeCloseTo(1)
    expect(evaluateSourceWaveform(component, 'pulse', 0.3)).toBe(-1)
  })

  it('distinguishes LFO sine, triangle, and square outputs and applies offset', () => {
    const component = source('lfo', { frequency: 1, amplitude: 2, offset: 1 })
    expect(evaluateSourceWaveform(component, 'sine', 0.5)).toBeCloseTo(1)
    expect(evaluateSourceWaveform(component, 'triangle', 0.5)).toBeCloseTo(3)
    expect(evaluateSourceWaveform(component, 'square', 0.5)).toBe(-1)
    expect(evaluateSourceWaveform(component, 'reset', 0.5)).toBeUndefined()
  })

  it('runs the divided clock output at half the main clock frequency', () => {
    const component = source('clock', { bpm: 120, dutyCycle: 0.5 })
    expect(evaluateSourceWaveform(component, 'clock', 0.3)).toBe(0)
    expect(evaluateSourceWaveform(component, 'divide', 0.3)).toBe(5)
    expect(evaluateSourceWaveform(component, 'clock', 0.6)).toBe(5)
    expect(evaluateSourceWaveform(component, 'divide', 0.6)).toBe(0)
  })
})
