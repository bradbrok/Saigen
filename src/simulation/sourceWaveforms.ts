import type { CircuitComponent, ComponentKind } from '../circuit/types'

const waveformSourceKinds = new Set<ComponentKind>([
  'cvInput',
  'gateInput',
  'triggerSource',
  'functionGenerator',
  'lfo',
  'clock',
])

function finiteParameter(component: CircuitComponent, key: string, fallback: number): number {
  const value = component.parameters[key]
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}

function normalizedPhase(time: number, frequency: number): number {
  return positiveModulo(time * frequency, 1)
}

export function isWaveformSourceKind(kind: ComponentKind): boolean {
  return waveformSourceKinds.has(kind)
}

/** Evaluate an ideal source output. Input-only ports intentionally return undefined. */
export function evaluateSourceWaveform(
  component: CircuitComponent,
  portId: string,
  time: number,
): number | undefined {
  if (!Number.isFinite(time)) return undefined

  if (component.kind === 'cvInput') {
    return portId === 'out' ? finiteParameter(component, 'voltage', 0) : undefined
  }

  if (component.kind === 'gateInput') {
    if (portId !== 'out') return undefined
    return finiteParameter(component, 'state', 1)
      ? finiteParameter(component, 'voltage', 5)
      : 0
  }

  if (component.kind === 'triggerSource') {
    if (portId !== 'trigger') return undefined
    const rate = Math.max(0.01, finiteParameter(component, 'rate', 2))
    const period = 1 / rate
    const pulseWidth = Math.max(0, finiteParameter(component, 'pulseWidthMs', 10)) / 1000
    const phaseTime = positiveModulo(time, period)
    return phaseTime < Math.min(pulseWidth, period)
      ? finiteParameter(component, 'voltage', 5)
      : 0
  }

  if (component.kind === 'functionGenerator') {
    if (!['sine', 'triangle', 'saw', 'pulse'].includes(portId)) return undefined
    const frequency = Math.max(0.01, finiteParameter(component, 'frequency', 220))
    const phase = normalizedPhase(time, frequency)
    const amplitude = finiteParameter(component, 'amplitude', 5)
    const offset = finiteParameter(component, 'offset', 0)
    const dutyCycle = clamp(finiteParameter(component, 'dutyCycle', 0.5), 0, 1)
    const waveform = portId === 'sine'
      ? Math.sin(phase * Math.PI * 2)
      : portId === 'triangle'
        ? 1 - 4 * Math.abs(phase - 0.5)
        : portId === 'pulse'
          ? phase < dutyCycle ? 1 : -1
          : phase * 2 - 1
    return waveform * amplitude + offset
  }

  if (component.kind === 'lfo') {
    if (!['sine', 'triangle', 'square'].includes(portId)) return undefined
    const frequency = Math.max(0.0001, finiteParameter(component, 'frequency', 1))
    const phase = normalizedPhase(time, frequency)
    const amplitude = finiteParameter(component, 'amplitude', 5)
    const offset = finiteParameter(component, 'offset', 0)
    const waveform = portId === 'sine'
      ? Math.sin(phase * Math.PI * 2)
      : portId === 'triangle'
        ? 1 - 4 * Math.abs(phase - 0.5)
        : phase < 0.5 ? 1 : -1
    return waveform * amplitude + offset
  }

  if (component.kind === 'clock') {
    if (portId !== 'clock' && portId !== 'divide') return undefined
    const beatsPerSecond = Math.max(0.001, finiteParameter(component, 'bpm', 120) / 60)
    const frequency = portId === 'divide' ? beatsPerSecond / 2 : beatsPerSecond
    const dutyCycle = clamp(finiteParameter(component, 'dutyCycle', 0.5), 0, 1)
    return normalizedPhase(time, frequency) < dutyCycle ? 5 : 0
  }

  return undefined
}
