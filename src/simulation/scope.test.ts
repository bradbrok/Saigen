import { describe, expect, it } from 'vitest'
import type { CircuitConnection } from '../circuit/types'
import {
  SCOPE_CHANNEL_IDS,
  assignConnection,
  assignConnectionToChannel,
  computeScopeTrace,
  createDefaultScopeConfiguration,
  createUniformScopeSamples,
  findScopeTrigger,
  formatScopeTime,
  formatScopeVoltage,
  getTriggerAlignedSlice,
  planScopeAcquisition,
  toggleScopeChannel,
  updateScopeChannel,
  updateScopeTimebase,
  updateScopeTrigger,
} from './scope'

function connection(index: number): CircuitConnection {
  return {
    id: `net-${index}`,
    from: { componentId: `source-${index}`, portId: 'out' },
    to: { componentId: `sink-${index}`, portId: 'in' },
    signal: 'audio',
  }
}

describe('scope configuration', () => {
  it('defines four independently colored channels', () => {
    const configuration = createDefaultScopeConfiguration()
    expect(configuration.channels.map((channel) => channel.id)).toEqual(SCOPE_CHANNEL_IDS)
    expect(new Set(configuration.channels.map((channel) => channel.color)).size).toBe(4)
    expect(configuration.channels.every((channel) => channel.visible && channel.voltsPerDivision > 0)).toBe(true)
  })

  it('rotates probe assignments through A, B, C, D and wraps', () => {
    let configuration = createDefaultScopeConfiguration()
    for (let index = 0; index < 5; index += 1) {
      configuration = assignConnection(configuration, connection(index), undefined, `NET ${index}`)
    }

    expect(configuration.channels.map((channel) => channel.assignment?.connectionId)).toEqual([
      'net-4',
      'net-1',
      'net-2',
      'net-3',
    ])
    expect(configuration.channels[0].assignment?.label).toBe('NET 4')
    expect(configuration.assignmentCursor).toBe(1)
  })

  it('updates channel, trigger, and timebase state without mutating the input', () => {
    const initial = createDefaultScopeConfiguration()
    const assigned = assignConnectionToChannel(initial, 'C', connection(2))
    const configured = updateScopeTimebase(
      updateScopeTrigger(
        updateScopeChannel(toggleScopeChannel(assigned, 'C'), 'C', { voltsPerDivision: 0.5, offset: -1.25 }),
        { source: 'C', level: 0.2, slope: 'falling', mode: 'normal' },
      ),
      { secondsPerDivision: 0.002, horizontalDivisions: 8, triggerPosition: 0.5 },
    )

    expect(initial.channels[2].assignment).toBeNull()
    expect(configured.channels[2]).toMatchObject({ visible: false, voltsPerDivision: 0.5, offset: -1.25 })
    expect(configured.trigger).toMatchObject({ source: 'C', level: 0.2, slope: 'falling', mode: 'normal' })
    expect(configured.timebase).toEqual({
      secondsPerDivision: 0.002,
      horizontalDivisions: 8,
      triggerPosition: 0.5,
    })
    expect(() => updateScopeChannel(configured, 'A', { voltsPerDivision: 0 })).toThrow(/greater than zero/i)
    expect(() => updateScopeTimebase(configured, { triggerPosition: 2 })).toThrow(/between zero and one/i)
  })
})

describe('scope acquisition and rendering', () => {
  it('returns a trigger-aligned slice for a rising threshold crossing', () => {
    let configuration = assignConnectionToChannel(createDefaultScopeConfiguration(), 'A', connection(0))
    configuration = updateScopeTimebase(configuration, {
      secondsPerDivision: 0.001,
      horizontalDivisions: 4,
      triggerPosition: 0.5,
    })
    const samples = Array.from({ length: 11 }, (_, index) => ({
      time: index * 0.001,
      values: { 'net-0': index * 0.001 - 0.005 },
    }))

    const trigger = findScopeTrigger(samples, configuration)
    const slice = getTriggerAlignedSlice(samples, configuration)

    expect(trigger?.time).toBeCloseTo(0.005, 10)
    expect(slice.startTime).toBeCloseTo(0.003, 10)
    expect(slice.endTime).toBeCloseTo(0.007, 10)
    expect(slice.samples.map((sample) => sample.time)).toEqual(samples.slice(3, 8).map((sample) => sample.time))
    expect(slice.triggerSampleIndex).toBe(3)
  })

  it('detects an edge that departs from a signal resting exactly at the trigger level', () => {
    const rising = findScopeTrigger([
      { time: 0, values: { A: 0 } },
      { time: 0.001, values: { A: 5 } },
    ], createDefaultScopeConfiguration())
    const fallingConfiguration = updateScopeTrigger(createDefaultScopeConfiguration(), { slope: 'falling' })
    const falling = findScopeTrigger([
      { time: 0, values: { A: 0 } },
      { time: 0.001, values: { A: -5 } },
    ], fallingConfiguration)

    expect(rising?.time).toBe(0)
    expect(falling?.time).toBe(0)
  })

  it('uses an auto-mode fallback but waits in normal mode when no edge exists', () => {
    const samples = Array.from({ length: 20 }, (_, index) => ({
      time: index / 1000,
      values: { A: 0.25 },
    }))
    const automatic = getTriggerAlignedSlice(samples, createDefaultScopeConfiguration())
    const normalConfiguration = updateScopeTrigger(createDefaultScopeConfiguration(), { mode: 'normal' })
    const normal = getTriggerAlignedSlice(samples, normalConfiguration)

    expect(automatic.samples.length).toBeGreaterThan(0)
    expect(automatic.trigger).toBeNull()
    expect(normal.samples).toEqual([])
  })

  it('adapts generated samples and emits deterministic, finite SVG trace data', () => {
    const generated = [0, 1, Number.NaN, -1, Number.MAX_VALUE]
    const samples = createUniformScopeSamples(generated, 1000, { A: (value) => value })
    const configuration = updateScopeTimebase(createDefaultScopeConfiguration(), {
      secondsPerDivision: 0.001,
      horizontalDivisions: 4,
      triggerPosition: 0,
    })
    const first = computeScopeTrace(samples, configuration, 'A', { width: 800, height: 160 })
    const second = computeScopeTrace(samples, configuration, 'A', { width: 800, height: 160 })

    expect(first.path).toBe(second.path)
    expect(first.path).toMatch(/^M/)
    expect(first.path).not.toMatch(/NaN|Infinity/)
    expect(first.points.every((point) => Object.values(point).every(Number.isFinite))).toBe(true)
  })

  it('bounds slow acquisitions while covering the complete overscanned window', () => {
    const plan = planScopeAcquisition(100)

    expect(plan.sampleCount).toBe(30_000)
    expect(plan.sampleRate).toBeGreaterThan(0)
    expect((plan.sampleCount - 1) / plan.sampleRate).toBeCloseTo(240)
  })
})

describe('scope engineering-unit formatting', () => {
  it('formats musical time and voltage ranges compactly', () => {
    expect(formatScopeTime(0)).toBe('0 s')
    expect(formatScopeTime(0.0025)).toBe('2.5 ms')
    expect(formatScopeTime(250e-6)).toBe('250 µs')
    expect(formatScopeVoltage(-2.5)).toBe('-2.5 V')
    expect(formatScopeVoltage(0.0025)).toBe('2.5 mV')
    expect(formatScopeVoltage(Number.NaN)).toBe('—')
  })
})
