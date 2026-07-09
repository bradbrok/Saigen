import type { SimulationControls } from '../circuit/types'

export interface VoiceSample {
  input: number
  filtered: number
  output: number
}

export interface ResponsePoint {
  frequency: number
  magnitudeDb: number
}

export function midiNoteToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

export function formatFrequency(frequency: number): string {
  if (frequency >= 1000) {
    const precision = frequency >= 10_000 ? 1 : 2
    return `${(frequency / 1000).toFixed(precision).replace(/\.0+$/, '')} kHz`
  }
  return `${Math.round(frequency)} Hz`
}

export function cutoffToSlider(cutoff: number): number {
  const min = Math.log10(20)
  const max = Math.log10(20_000)
  return ((Math.log10(cutoff) - min) / (max - min)) * 100
}

export function sliderToCutoff(slider: number): number {
  const min = Math.log10(20)
  const max = Math.log10(20_000)
  return 10 ** (min + (Math.max(0, Math.min(100, slider)) / 100) * (max - min))
}

export function generateVoiceSamples(
  controls: SimulationControls,
  sampleCount = 360,
  sampleRate = 48_000,
  phaseOffset = 0,
): VoiceSample[] {
  const oscillatorFrequency = midiNoteToFrequency(controls.note)
  const normalizedCutoff = Math.min(controls.cutoff, sampleRate * 0.18)
  const coefficient = 2 * Math.sin(Math.PI * normalizedCutoff / sampleRate)
  const damping = 1.92 - controls.resonance * 1.5
  const driveGain = 10 ** (controls.drive / 20)
  const warmup = Math.max(800, Math.round(sampleRate / Math.max(30, normalizedCutoff) * 10))
  const samples: VoiceSample[] = []
  let low = 0
  let band = 0

  for (let index = -warmup; index < sampleCount; index += 1) {
    const phase = (phaseOffset + index * oscillatorFrequency / sampleRate) % 1
    const input = 2 * (phase - Math.floor(phase)) - 1
    const driven = Math.tanh(input * driveGain)
    const high = driven - low - damping * band
    band += coefficient * high
    low += coefficient * band
    const filtered = Math.max(-1.2, Math.min(1.2, low))
    const output = filtered * controls.envelope

    if (index >= 0) {
      samples.push({ input, filtered, output })
    }
  }

  return samples
}

export function generateFilterResponse(controls: SimulationControls, count = 120): ResponsePoint[] {
  const points: ResponsePoint[] = []
  const q = 0.65 + controls.resonance * 10
  const driveLift = Math.min(3, controls.drive * 0.12)

  for (let index = 0; index < count; index += 1) {
    const frequency = 20 * 1000 ** (index / (count - 1))
    const ratio = frequency / controls.cutoff
    const secondOrder = 1 / Math.sqrt((1 - ratio ** 2) ** 2 + (ratio / q) ** 2)
    const extraPoles = 1 / Math.sqrt(1 + ratio ** 2)
    const magnitude = Math.max(1e-5, secondOrder * extraPoles ** 2)
    points.push({ frequency, magnitudeDb: 20 * Math.log10(magnitude) + driveLift })
  }

  return points
}

export function samplesToPath(
  samples: VoiceSample[],
  channel: keyof VoiceSample,
  width: number,
  height: number,
  amplitude = 0.4,
): string {
  if (samples.length === 0) return ''
  const middle = height / 2

  return samples
    .map((sample, index) => {
      const x = (index / (samples.length - 1)) * width
      const y = middle - sample[channel] * height * amplitude
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function responseToPath(points: ResponsePoint[], width: number, height: number): string {
  const minDb = -60
  const maxDb = 12
  return points
    .map((point, index) => {
      const x = (Math.log10(point.frequency / 20) / Math.log10(1000)) * width
      const clamped = Math.max(minDb, Math.min(maxDb, point.magnitudeDb))
      const y = ((maxDb - clamped) / (maxDb - minDb)) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
