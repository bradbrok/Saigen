import { describe, expect, it } from 'vitest'
import { defaultControls } from '../circuit/demo'
import {
  cutoffToSlider,
  generateFilterResponse,
  generateVoiceSamples,
  midiNoteToFrequency,
  sliderToCutoff,
} from './voice'

describe('voice preview', () => {
  it('uses standard MIDI tuning', () => {
    expect(midiNoteToFrequency(69)).toBe(440)
    expect(midiNoteToFrequency(57)).toBe(220)
  })

  it('round-trips the logarithmic cutoff control', () => {
    for (const cutoff of [20, 110, 1240, 10_000, 20_000]) {
      expect(sliderToCutoff(cutoffToSlider(cutoff))).toBeCloseTo(cutoff, 8)
    }
  })

  it('generates finite scope samples', () => {
    const samples = generateVoiceSamples(defaultControls, 256)
    expect(samples).toHaveLength(256)
    expect(samples.every((sample) => Object.values(sample).every(Number.isFinite))).toBe(true)

    const extreme = generateVoiceSamples({
      ...defaultControls,
      cutoff: 20_000,
      resonance: 1,
      drive: 18,
      note: 84,
    }, 256)
    expect(extreme.every((sample) => Object.values(sample).every(Number.isFinite))).toBe(true)
  })

  it('rolls off the response above cutoff', () => {
    const response = generateFilterResponse(defaultControls)
    const low = response.find((point) => point.frequency > 100)
    const high = response.find((point) => point.frequency > 10_000)
    expect(low).toBeDefined()
    expect(high).toBeDefined()
    expect(high!.magnitudeDb).toBeLessThan(low!.magnitudeDb - 25)
  })
})
