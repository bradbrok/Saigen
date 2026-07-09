import type { CircuitConnection, PortRef, SignalType } from '../circuit/types'

export const SCOPE_CHANNEL_IDS = ['A', 'B', 'C', 'D'] as const

export type ScopeChannelId = typeof SCOPE_CHANNEL_IDS[number]
export type TriggerSlope = 'rising' | 'falling'
export type TriggerMode = 'auto' | 'normal' | 'single'

export const SCOPE_CHANNEL_COLORS: Readonly<Record<ScopeChannelId, string>> = Object.freeze({
  A: '#ffd166',
  B: '#43d9ff',
  C: '#ff62b0',
  D: '#7ee787',
})

export interface ScopeNetAssignment {
  readonly connectionId: string
  readonly label: string
  readonly signal: SignalType
  readonly from: PortRef
  readonly to: PortRef
}

export interface ScopeChannel {
  readonly id: ScopeChannelId
  readonly color: string
  readonly assignment: ScopeNetAssignment | null
  readonly visible: boolean
  /** Vertical sensitivity in volts per major grid division. */
  readonly voltsPerDivision: number
  /** Voltage displayed on the vertical center line. */
  readonly offset: number
}

export interface ScopeTrigger {
  readonly source: ScopeChannelId
  readonly level: number
  readonly slope: TriggerSlope
  readonly mode: TriggerMode
}

export interface ScopeTimebase {
  /** Horizontal duration represented by one major grid division. */
  readonly secondsPerDivision: number
  readonly horizontalDivisions: number
  /** Trigger position as a fraction of the viewport, from 0 (left) to 1 (right). */
  readonly triggerPosition: number
}

export interface ScopeConfiguration {
  readonly channels: readonly ScopeChannel[]
  readonly trigger: ScopeTrigger
  readonly timebase: ScopeTimebase
  /** Index used by the probe tool when no destination channel is specified. */
  readonly assignmentCursor: number
}

export type ScopeChannelPatch = Partial<Pick<ScopeChannel, 'visible' | 'voltsPerDivision' | 'offset'>>

export interface ScopeSample {
  readonly time: number
  /** Values are keyed by circuit connection id (or channel id for synthetic previews). */
  readonly values: Readonly<Record<string, number>>
}

export interface ScopeTriggerCrossing {
  /** Index of the first sample on or beyond the trigger level in time-sorted input. */
  readonly sampleIndex: number
  /** Linearly interpolated threshold-crossing time. */
  readonly time: number
}

export interface TriggerAlignedSlice {
  readonly samples: readonly ScopeSample[]
  readonly startTime: number
  readonly endTime: number
  readonly trigger: ScopeTriggerCrossing | null
  /** Index of the crossing sample in `samples`, or null without a captured trigger. */
  readonly triggerSampleIndex: number | null
}

export interface ScopeTraceOptions {
  readonly width: number
  readonly height: number
  readonly verticalDivisions?: number
  readonly precision?: number
}

export interface ScopeTracePoint {
  readonly time: number
  readonly value: number
  readonly x: number
  readonly y: number
}

export interface ScopeTrace {
  readonly channelId: ScopeChannelId
  readonly color: string
  readonly path: string
  readonly points: readonly ScopeTracePoint[]
  readonly slice: TriggerAlignedSlice
}

export interface ScopeAcquisitionPlan {
  readonly sampleRate: number
  readonly sampleCount: number
}

export interface ScopeAcquisitionOptions {
  readonly preferredSampleRate?: number
  readonly minimumSampleCount?: number
  readonly maximumSampleCount?: number
  readonly overscan?: number
}

const DEFAULT_CHANNEL_SENSITIVITY = 2

function makeDefaultChannels(): ScopeChannel[] {
  return SCOPE_CHANNEL_IDS.map((id) => ({
    id,
    color: SCOPE_CHANNEL_COLORS[id],
    assignment: null,
    visible: true,
    voltsPerDivision: DEFAULT_CHANNEL_SENSITIVITY,
    offset: 0,
  }))
}

export function createDefaultScopeConfiguration(): ScopeConfiguration {
  return {
    channels: makeDefaultChannels(),
    trigger: {
      source: 'A',
      level: 0,
      slope: 'rising',
      mode: 'auto',
    },
    timebase: {
      secondsPerDivision: 0.001,
      horizontalDivisions: 10,
      triggerPosition: 0.25,
    },
    assignmentCursor: 0,
  }
}

function freezeDefaultConfiguration(configuration: ScopeConfiguration): ScopeConfiguration {
  configuration.channels.forEach(Object.freeze)
  Object.freeze(configuration.channels)
  Object.freeze(configuration.trigger)
  Object.freeze(configuration.timebase)
  return Object.freeze(configuration)
}

export const DEFAULT_SCOPE_CONFIG = freezeDefaultConfiguration(createDefaultScopeConfiguration())
export const DEFAULT_SCOPE_CONFIGURATION = DEFAULT_SCOPE_CONFIG

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`)
  }
}

function requirePositive(value: number, label: string): void {
  requireFinite(value, label)
  if (value <= 0) {
    throw new RangeError(`${label} must be greater than zero`)
  }
}

function channelIndex(configuration: ScopeConfiguration, id: ScopeChannelId): number {
  const index = configuration.channels.findIndex((channel) => channel.id === id)
  if (index < 0) throw new Error(`Scope channel ${id} is missing`)
  return index
}

function replaceChannel(
  configuration: ScopeConfiguration,
  id: ScopeChannelId,
  update: (channel: ScopeChannel) => ScopeChannel,
): ScopeConfiguration {
  const index = channelIndex(configuration, id)
  return {
    ...configuration,
    channels: configuration.channels.map((channel, channelPosition) =>
      channelPosition === index ? update(channel) : channel,
    ),
  }
}

export function describeConnection(connection: CircuitConnection): string {
  return `${connection.from.componentId}.${connection.from.portId} → ${connection.to.componentId}.${connection.to.portId}`
}

function assignmentFromConnection(connection: CircuitConnection, label?: string): ScopeNetAssignment {
  return {
    connectionId: connection.id,
    label: label?.trim() || describeConnection(connection),
    signal: connection.signal,
    from: { ...connection.from },
    to: { ...connection.to },
  }
}

/** Assign a net explicitly and advance the rotating probe destination to the following channel. */
export function assignConnectionToChannel(
  configuration: ScopeConfiguration,
  channelId: ScopeChannelId,
  connection: CircuitConnection,
  label?: string,
): ScopeConfiguration {
  const index = channelIndex(configuration, channelId)
  const updated = replaceChannel(configuration, channelId, (channel) => ({
    ...channel,
    assignment: assignmentFromConnection(connection, label),
    visible: true,
  }))

  return {
    ...updated,
    assignmentCursor: (index + 1) % SCOPE_CHANNEL_IDS.length,
  }
}

/** Assign a net to A, B, C, D in turn, wrapping back to A. */
export function assignConnectionToNextChannel(
  configuration: ScopeConfiguration,
  connection: CircuitConnection,
  label?: string,
): ScopeConfiguration {
  const cursor = Number.isInteger(configuration.assignmentCursor)
    ? configuration.assignmentCursor
    : 0
  const index = ((cursor % SCOPE_CHANNEL_IDS.length) + SCOPE_CHANNEL_IDS.length) % SCOPE_CHANNEL_IDS.length
  return assignConnectionToChannel(configuration, SCOPE_CHANNEL_IDS[index], connection, label)
}

/** Compact alias for probe handlers; omit `channelId` to use rotating assignment. */
export function assignConnection(
  configuration: ScopeConfiguration,
  connection: CircuitConnection,
  channelId?: ScopeChannelId,
  label?: string,
): ScopeConfiguration {
  return channelId
    ? assignConnectionToChannel(configuration, channelId, connection, label)
    : assignConnectionToNextChannel(configuration, connection, label)
}

export function clearChannelAssignment(
  configuration: ScopeConfiguration,
  channelId: ScopeChannelId,
): ScopeConfiguration {
  return replaceChannel(configuration, channelId, (channel) => ({ ...channel, assignment: null }))
}

export function updateScopeChannel(
  configuration: ScopeConfiguration,
  channelId: ScopeChannelId,
  patch: ScopeChannelPatch,
): ScopeConfiguration {
  if (patch.visible !== undefined && typeof patch.visible !== 'boolean') {
    throw new TypeError('Channel visibility must be a boolean')
  }
  if (patch.voltsPerDivision !== undefined) {
    requirePositive(patch.voltsPerDivision, 'Volts per division')
  }
  if (patch.offset !== undefined) {
    requireFinite(patch.offset, 'Channel offset')
  }

  return replaceChannel(configuration, channelId, (channel) => ({ ...channel, ...patch }))
}

export function toggleScopeChannel(
  configuration: ScopeConfiguration,
  channelId: ScopeChannelId,
): ScopeConfiguration {
  return replaceChannel(configuration, channelId, (channel) => ({ ...channel, visible: !channel.visible }))
}

export function updateScopeTrigger(
  configuration: ScopeConfiguration,
  patch: Partial<ScopeTrigger>,
): ScopeConfiguration {
  if (patch.level !== undefined) requireFinite(patch.level, 'Trigger level')
  if (patch.source !== undefined) channelIndex(configuration, patch.source)
  if (patch.slope !== undefined && patch.slope !== 'rising' && patch.slope !== 'falling') {
    throw new RangeError(`Unsupported trigger slope: ${String(patch.slope)}`)
  }
  if (patch.mode !== undefined && patch.mode !== 'auto' && patch.mode !== 'normal' && patch.mode !== 'single') {
    throw new RangeError(`Unsupported trigger mode: ${String(patch.mode)}`)
  }

  return {
    ...configuration,
    trigger: { ...configuration.trigger, ...patch },
  }
}

export function updateScopeTimebase(
  configuration: ScopeConfiguration,
  patch: Partial<ScopeTimebase>,
): ScopeConfiguration {
  if (patch.secondsPerDivision !== undefined) {
    requirePositive(patch.secondsPerDivision, 'Seconds per division')
  }
  if (patch.horizontalDivisions !== undefined) {
    requirePositive(patch.horizontalDivisions, 'Horizontal divisions')
    if (!Number.isInteger(patch.horizontalDivisions)) {
      throw new RangeError('Horizontal divisions must be an integer')
    }
  }
  if (patch.triggerPosition !== undefined) {
    requireFinite(patch.triggerPosition, 'Trigger position')
    if (patch.triggerPosition < 0 || patch.triggerPosition > 1) {
      throw new RangeError('Trigger position must be between zero and one')
    }
  }

  return {
    ...configuration,
    timebase: { ...configuration.timebase, ...patch },
  }
}

/** Plan a complete acquisition window while bounding memory for very slow timebases. */
export function planScopeAcquisition(
  duration: number,
  options: ScopeAcquisitionOptions = {},
): ScopeAcquisitionPlan {
  const preferredSampleRate = options.preferredSampleRate ?? 48_000
  const minimumSampleCount = options.minimumSampleCount ?? 2048
  const maximumSampleCount = options.maximumSampleCount ?? 30_000
  const overscan = options.overscan ?? 2.4

  requirePositive(duration, 'Acquisition duration')
  requirePositive(preferredSampleRate, 'Preferred sample rate')
  requirePositive(overscan, 'Acquisition overscan')
  if (!Number.isInteger(minimumSampleCount) || minimumSampleCount < 2) {
    throw new RangeError('Minimum sample count must be an integer of at least two')
  }
  if (!Number.isInteger(maximumSampleCount) || maximumSampleCount < minimumSampleCount) {
    throw new RangeError('Maximum sample count must be an integer no smaller than the minimum')
  }

  const acquisitionDuration = duration * overscan
  const preferredSampleCount = Math.ceil(acquisitionDuration * preferredSampleRate) + 1
  if (preferredSampleCount <= maximumSampleCount) {
    return {
      sampleRate: preferredSampleRate,
      sampleCount: Math.max(minimumSampleCount, preferredSampleCount),
    }
  }

  return {
    sampleRate: (maximumSampleCount - 1) / acquisitionDuration,
    sampleCount: maximumSampleCount,
  }
}

/** Adapt arbitrary uniformly sampled solver output to scope frames. */
export function createUniformScopeSamples<T>(
  samples: readonly T[],
  sampleRate: number,
  selectors: Readonly<Record<string, (sample: T, index: number) => number>>,
  startTime = 0,
): ScopeSample[] {
  requirePositive(sampleRate, 'Sample rate')
  requireFinite(startTime, 'Start time')

  return samples.map((sample, index) => {
    const values: Record<string, number> = {}
    for (const [signalKey, selector] of Object.entries(selectors)) {
      values[signalKey] = selector(sample, index)
    }
    return { time: startTime + index / sampleRate, values }
  })
}

export function getChannelSignalKey(
  configuration: ScopeConfiguration,
  channelId: ScopeChannelId,
): string {
  const channel = configuration.channels[channelIndex(configuration, channelId)]
  // The channel-id fallback is useful for synthetic signals before a schematic net exists.
  return channel.assignment?.connectionId ?? channel.id
}

function sortedFiniteTimeSamples(samples: readonly ScopeSample[]): ScopeSample[] {
  return samples
    .map((sample, inputIndex) => ({ sample, inputIndex }))
    .filter(({ sample }) => Number.isFinite(sample.time))
    .sort((left, right) => left.sample.time - right.sample.time || left.inputIndex - right.inputIndex)
    .map(({ sample }) => sample)
}

function crossesLevel(previous: number, current: number, level: number, slope: TriggerSlope): boolean {
  return slope === 'rising'
    ? previous <= level && current > level
    : previous >= level && current < level
}

function crossingTime(
  previous: ScopeSample,
  current: ScopeSample,
  previousValue: number,
  currentValue: number,
  level: number,
): number {
  const change = currentValue - previousValue
  if (change === 0) return current.time
  const fraction = Math.max(0, Math.min(1, (level - previousValue) / change))
  return previous.time + (current.time - previous.time) * fraction
}

function triggerCandidates(
  samples: readonly ScopeSample[],
  configuration: ScopeConfiguration,
): ScopeTriggerCrossing[] {
  const signalKey = getChannelSignalKey(configuration, configuration.trigger.source)
  const candidates: ScopeTriggerCrossing[] = []

  for (let index = 1; index < samples.length; index += 1) {
    const previousValue = samples[index - 1].values[signalKey]
    const currentValue = samples[index].values[signalKey]
    if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue)) continue
    if (!crossesLevel(previousValue, currentValue, configuration.trigger.level, configuration.trigger.slope)) continue

    candidates.push({
      sampleIndex: index,
      time: crossingTime(
        samples[index - 1],
        samples[index],
        previousValue,
        currentValue,
        configuration.trigger.level,
      ),
    })
  }

  return candidates
}

/** Locate the first crossing that can fill the viewport, falling back to the first crossing. */
export function findScopeTrigger(
  inputSamples: readonly ScopeSample[],
  configuration: ScopeConfiguration,
): ScopeTriggerCrossing | null {
  const samples = sortedFiniteTimeSamples(inputSamples)
  const candidates = triggerCandidates(samples, configuration)
  if (candidates.length === 0 || samples.length === 0) return null

  const duration = configuration.timebase.secondsPerDivision * configuration.timebase.horizontalDivisions
  const earliest = samples[0].time
  const latest = samples[samples.length - 1].time
  const position = configuration.timebase.triggerPosition
  return candidates.find((candidate) =>
    candidate.time - duration * position >= earliest &&
    candidate.time + duration * (1 - position) <= latest,
  ) ?? candidates[0]
}

export function getTriggerAlignedSlice(
  inputSamples: readonly ScopeSample[],
  configuration: ScopeConfiguration,
): TriggerAlignedSlice {
  const samples = sortedFiniteTimeSamples(inputSamples)
  const duration = configuration.timebase.secondsPerDivision * configuration.timebase.horizontalDivisions

  if (samples.length === 0) {
    return { samples: [], startTime: 0, endTime: duration, trigger: null, triggerSampleIndex: null }
  }

  const earliest = samples[0].time
  const latest = samples[samples.length - 1].time
  const candidates = triggerCandidates(samples, configuration)
  const position = configuration.timebase.triggerPosition
  const trigger = candidates.find((candidate) =>
    candidate.time - duration * position >= earliest &&
    candidate.time + duration * (1 - position) <= latest,
  ) ?? candidates[0] ?? null

  if (!trigger && configuration.trigger.mode !== 'auto') {
    const fallbackStart = Math.max(earliest, latest - duration)
    return {
      samples: [],
      startTime: fallbackStart,
      endTime: fallbackStart + duration,
      trigger: null,
      triggerSampleIndex: null,
    }
  }

  const desiredStart = trigger
    ? trigger.time - duration * position
    : Math.max(earliest, latest - duration)
  const latestPossibleStart = Math.max(earliest, latest - duration)
  const startTime = Math.max(earliest, Math.min(latestPossibleStart, desiredStart))
  const endTime = startTime + duration
  const epsilon = Math.max(Number.EPSILON, duration * 1e-10)
  const slice = samples.filter((sample) =>
    sample.time >= startTime - epsilon && sample.time <= endTime + epsilon,
  )
  const crossingSample = trigger ? samples[trigger.sampleIndex] : undefined
  const triggerSampleIndex = crossingSample ? slice.indexOf(crossingSample) : -1

  return {
    samples: slice,
    startTime,
    endTime,
    trigger,
    triggerSampleIndex: triggerSampleIndex >= 0 ? triggerSampleIndex : null,
  }
}

function finiteDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function fixed(value: number, precision: number): string {
  return (Object.is(value, -0) ? 0 : value).toFixed(precision)
}

/** Produce an SVG path and numeric points using the selected channel's volts/div and offset. */
export function computeScopeTrace(
  samples: readonly ScopeSample[],
  configuration: ScopeConfiguration,
  channelId: ScopeChannelId,
  options: ScopeTraceOptions,
): ScopeTrace {
  const channel = configuration.channels[channelIndex(configuration, channelId)]
  const slice = getTriggerAlignedSlice(samples, configuration)
  const width = options.width
  const height = options.height
  const verticalDivisions = options.verticalDivisions ?? 8
  const precision = Math.max(0, Math.min(6, Math.floor(options.precision ?? 2)))

  if (!channel.visible || !finiteDimension(width) || !finiteDimension(height) || !finiteDimension(verticalDivisions)) {
    return { channelId, color: channel.color, path: '', points: [], slice }
  }

  const signalKey = getChannelSignalKey(configuration, channelId)
  const duration = slice.endTime - slice.startTime
  if (!finiteDimension(duration)) {
    return { channelId, color: channel.color, path: '', points: [], slice }
  }

  const points: ScopeTracePoint[] = []
  const commands: string[] = []
  let continuing = false

  for (const sample of slice.samples) {
    const value = sample.values[signalKey]
    if (!Number.isFinite(value)) {
      continuing = false
      continue
    }

    const rawX = ((sample.time - slice.startTime) / duration) * width
    const x = Math.max(0, Math.min(width, rawX))
    const delta = value - channel.offset
    const rawDivisionOffset = Number.isFinite(delta / channel.voltsPerDivision)
      ? delta / channel.voltsPerDivision
      : Math.sign(delta) * verticalDivisions * 8
    // Keep pathological solver output finite while still drawing well beyond the viewport.
    const divisionOffset = Math.max(-verticalDivisions * 8, Math.min(verticalDivisions * 8, rawDivisionOffset))
    const y = height / 2 - divisionOffset * (height / verticalDivisions)

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continuing = false
      continue
    }

    points.push({ time: sample.time, value, x, y })
    commands.push(`${continuing ? 'L' : 'M'}${fixed(x, precision)},${fixed(y, precision)}`)
    continuing = true
  }

  return {
    channelId,
    color: channel.color,
    path: commands.join(' '),
    points,
    slice,
  }
}

export function scopeSamplesToPath(
  samples: readonly ScopeSample[],
  configuration: ScopeConfiguration,
  channelId: ScopeChannelId,
  width: number,
  height: number,
  verticalDivisions = 8,
): string {
  return computeScopeTrace(samples, configuration, channelId, { width, height, verticalDivisions }).path
}

interface EngineeringScale {
  readonly threshold: number
  readonly multiplier: number
  readonly unit: string
}

function formatEngineering(value: number, scales: readonly EngineeringScale[], zeroUnit: string): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0 || Object.is(value, -0)) return `0 ${zeroUnit}`

  const absolute = Math.abs(value)
  const scale = scales.find((candidate) => absolute >= candidate.threshold) ?? scales[scales.length - 1]
  const scaled = value * scale.multiplier
  const scaledAbsolute = Math.abs(scaled)
  const precision = scaledAbsolute >= 100 ? 0 : scaledAbsolute >= 10 ? 1 : scaledAbsolute >= 1 ? 2 : 3
  const numeric = scaled.toFixed(precision).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')
  return `${numeric} ${scale.unit}`
}

const TIME_SCALES: readonly EngineeringScale[] = [
  { threshold: 1, multiplier: 1, unit: 's' },
  { threshold: 1e-3, multiplier: 1e3, unit: 'ms' },
  { threshold: 1e-6, multiplier: 1e6, unit: 'µs' },
  { threshold: 1e-9, multiplier: 1e9, unit: 'ns' },
  { threshold: 0, multiplier: 1e12, unit: 'ps' },
]

const VOLTAGE_SCALES: readonly EngineeringScale[] = [
  { threshold: 1e3, multiplier: 1e-3, unit: 'kV' },
  { threshold: 1, multiplier: 1, unit: 'V' },
  { threshold: 1e-3, multiplier: 1e3, unit: 'mV' },
  { threshold: 1e-6, multiplier: 1e6, unit: 'µV' },
  { threshold: 1e-9, multiplier: 1e9, unit: 'nV' },
  { threshold: 0, multiplier: 1e12, unit: 'pV' },
]

export function formatScopeTime(seconds: number): string {
  return formatEngineering(seconds, TIME_SCALES, 's')
}

export function formatScopeVoltage(volts: number): string {
  return formatEngineering(volts, VOLTAGE_SCALES, 'V')
}

export const formatTime = formatScopeTime
export const formatVoltage = formatScopeVoltage
