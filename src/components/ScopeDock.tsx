import { useMemo, useRef, useState } from 'react'
import type { CircuitConnection, CircuitDocument, SimulationControls } from '../circuit/types'
import {
  clearChannelAssignment,
  computeScopeTrace,
  createUniformScopeSamples,
  formatScopeTime,
  formatScopeVoltage,
  planScopeAcquisition,
  toggleScopeChannel,
  updateScopeChannel,
  updateScopeTimebase,
  updateScopeTrigger,
  type ScopeChannelId,
  type ScopeConfiguration,
} from '../simulation/scope'
import { evaluateSourceWaveform, isWaveformSourceKind } from '../simulation/sourceWaveforms'
import {
  formatFrequency,
  generateFilterResponse,
  generateVoiceSamples,
  responseToPath,
  type VoiceSample,
} from '../simulation/voice'
import { Icon } from './Icon'

interface ScopeDockProps {
  document: CircuitDocument
  controls: SimulationControls
  scope: ScopeConfiguration
  onScopeChange: (scope: ScopeConfiguration) => void
}

type ScopeTab = 'scope' | 'sweep' | 'spice'

const SAMPLE_RATE = 48_000
const TIMEBASE_STEPS = [
  50e-6,
  100e-6,
  200e-6,
  500e-6,
  1e-3,
  2e-3,
  5e-3,
  10e-3,
  20e-3,
  50e-3,
  100e-3,
  200e-3,
  500e-3,
  1,
  2,
  5,
  10,
]
const VOLTS_PER_DIVISION_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10]

function ScopeGrid({ width, height }: { width: number; height: number }) {
  const vertical = Array.from({ length: 11 }, (_, index) => index * width / 10)
  const horizontal = Array.from({ length: 9 }, (_, index) => index * height / 8)
  return (
    <g className="scope-grid">
      {vertical.map((x) => <line key={`v-${x}`} x1={x} y1="0" x2={x} y2={height} />)}
      {horizontal.map((y) => <line key={`h-${y}`} x1="0" y1={y} x2={width} y2={y} />)}
    </g>
  )
}

function spicePreview(document: CircuitDocument, controls: SimulationControls): string {
  return `* ${document.title}
* Saigen behavioral interchange preview
.param NOTE=${controls.note} FC=${Math.round(controls.cutoff)} RES=${controls.resonance.toFixed(2)}
XVCO pitch pwm sync saw pulse tri 0 SSI2131_BEHAV
XVCF saw fc_cv res_cv filtered 0 SSI2144_BEHAV
XVCA filtered env output 0 SSI2164_BEHAV
VNOTE pitch 0 DC ${((controls.note - 48) / 12).toFixed(3)}
VENV env 0 PWL(0 0 20m ${controls.envelope.toFixed(2)})
.tran 10u 100m
* Named SSI macros are preview models; verify before fabrication.
.end`
}

function deterministicNoise(index: number): number {
  const raw = Math.sin(index * 12.9898 + 78.233) * 43_758.5453
  return (raw - Math.floor(raw)) * 2 - 1
}

function connectionValue(
  connection: CircuitConnection,
  document: CircuitDocument,
  controls: SimulationControls,
  sample: VoiceSample,
  index: number,
  sampleRate: number,
): number {
  const from = document.components.find((component) => component.id === connection.from.componentId)
  const time = index / sampleRate

  if (connection.signal === 'power') {
    if (from?.kind === 'minus12V') return -12
    if (from?.kind === 'ground') return 0
    return 12
  }

  if (from && isWaveformSourceKind(from.kind)) {
    return evaluateSourceWaveform(from, connection.from.portId, time) ?? 0
  }

  if (connection.signal === 'cv') {
    if (from?.kind === 'noiseSource') return deterministicNoise(index) * 5
    if (from?.kind === 'envelope') {
      const attack = Math.max(0.005, from.parameters.attack ?? 0.02)
      const envelope = 1 - Math.exp(-time / attack)
      return envelope * controls.envelope * 5
    }
    return controls.envelope * 5
  }

  if (from?.kind === 'noiseSource') return deterministicNoise(index) * 2.5
  if (from?.kind === 'ssi2131' || from?.kind === 'audioInput') return sample.input * 2.5
  if (from?.kind === 'ssi2144') return sample.filtered * 4
  if (from?.kind === 'ssi2164') return sample.output * 4
  if (connection.signal === 'passive') return sample.filtered * 3
  return sample.output * 4
}

function scopeMeasurement(points: readonly { time: number; value: number }[]) {
  if (points.length < 2) return { peakToPeak: 0, rms: 0, mean: 0, frequency: 0 }
  const values = points.map((point) => point.value)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const rms = Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length)
  const crossings: number[] = []
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1].value < mean && points[index].value >= mean) crossings.push(points[index].time)
  }
  const frequency = crossings.length > 1
    ? (crossings.length - 1) / (crossings[crossings.length - 1] - crossings[0])
    : 0
  return {
    peakToPeak: Math.max(...values) - Math.min(...values),
    rms,
    mean,
    frequency: Number.isFinite(frequency) ? frequency : 0,
  }
}

function nextSteppedValue(steps: number[], value: number, direction: -1 | 1): number {
  const nearest = steps.reduce((best, candidate, index) =>
    Math.abs(candidate - value) < Math.abs(steps[best] - value) ? index : best, 0)
  return steps[Math.max(0, Math.min(steps.length - 1, nearest + direction))]
}

export function ScopeDock({ document, controls, scope, onScopeChange }: ScopeDockProps) {
  const [tab, setTab] = useState<ScopeTab>('scope')
  const width = 820
  const height = 154
  const duration = scope.timebase.secondsPerDivision * scope.timebase.horizontalDivisions
  const acquisition = planScopeAcquisition(duration, { preferredSampleRate: SAMPLE_RATE })
  const sampleCount = acquisition.sampleCount
  const scopeSampleRate = acquisition.sampleRate
  const voiceSamples = useMemo(
    () => generateVoiceSamples(controls, sampleCount, scopeSampleRate),
    [controls, sampleCount, scopeSampleRate],
  )
  const response = useMemo(() => generateFilterResponse(controls), [controls])

  const liveScopeSamples = useMemo(() => {
    const selectors: Record<string, (sample: VoiceSample, index: number) => number> = {}
    for (const channel of scope.channels) {
      const assignment = channel.assignment
      if (!assignment || selectors[assignment.connectionId]) continue
      const connection = document.connections.find((candidate) => candidate.id === assignment.connectionId)
      if (!connection) continue
      selectors[assignment.connectionId] = (sample, index) =>
        connectionValue(connection, document, controls, sample, index, scopeSampleRate)
    }
    return createUniformScopeSamples(voiceSamples, scopeSampleRate, selectors)
  }, [controls, document, scope.channels, scopeSampleRate, voiceSamples])
  const frozenScopeSamples = useRef(liveScopeSamples)
  if (controls.running) frozenScopeSamples.current = liveScopeSamples
  const scopeSamples = controls.running ? liveScopeSamples : frozenScopeSamples.current

  const traces = useMemo(() => scope.channels.map((channel) =>
    computeScopeTrace(scopeSamples, scope, channel.id, { width, height, verticalDivisions: 8 }),
  ), [scope, scopeSamples])
  const triggerTrace = traces.find((trace) => trace.channelId === scope.trigger.source)
  const measurement = scopeMeasurement(triggerTrace?.points ?? [])
  const triggerChannel = scope.channels.find((channel) => channel.id === scope.trigger.source) ?? scope.channels[0]
  const triggerY = Math.max(0, Math.min(height,
    height / 2 - ((scope.trigger.level - triggerChannel.offset) / triggerChannel.voltsPerDivision) * (height / 8)))
  const assignedCount = scope.channels.filter((channel) => channel.assignment).length

  const changeTimebase = (direction: -1 | 1) => {
    onScopeChange(updateScopeTimebase(scope, {
      secondsPerDivision: nextSteppedValue(TIMEBASE_STEPS, scope.timebase.secondsPerDivision, direction),
    }))
  }

  const cycleScale = (channelId: ScopeChannelId) => {
    const channel = scope.channels.find((candidate) => candidate.id === channelId)
    if (!channel) return
    onScopeChange(updateScopeChannel(scope, channelId, {
      voltsPerDivision: nextSteppedValue(VOLTS_PER_DIVISION_STEPS, channel.voltsPerDivision, 1),
    }))
  }

  const cycleTriggerMode = () => {
    const modes = ['auto', 'normal', 'single'] as const
    const index = modes.indexOf(scope.trigger.mode)
    onScopeChange(updateScopeTrigger(scope, { mode: modes[(index + 1) % modes.length] }))
  }

  return (
    <section className="scope-dock" aria-label="Analysis dock">
      <div className="scope-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'scope'} className={tab === 'scope' ? 'is-active' : ''} onClick={() => setTab('scope')}>
          Oscilloscope <span>{assignedCount}</span>
        </button>
        <button role="tab" aria-selected={tab === 'sweep'} className={tab === 'sweep' ? 'is-active' : ''} onClick={() => setTab('sweep')}>
          AC sweep
        </button>
        <button role="tab" aria-selected={tab === 'spice'} className={tab === 'spice' ? 'is-active' : ''} onClick={() => setTab('spice')}>
          SPICE preview
        </button>
        <div className="scope-tab-spacer" />
        <span className="analysis-mode"><i />BEHAVIORAL PREVIEW</span>
        <button className="scope-collapse" aria-label="Collapse analysis panel"><span>⌄</span></button>
      </div>

      {tab === 'scope' && (
        <div className="scope-controls" aria-label="Oscilloscope controls">
          <div className="scope-control-group timebase-control">
            <span>TIME / DIV</span>
            <button onClick={() => changeTimebase(-1)} aria-label="Decrease time per division">−</button>
            <output>{formatScopeTime(scope.timebase.secondsPerDivision)}</output>
            <button onClick={() => changeTimebase(1)} aria-label="Increase time per division">+</button>
          </div>
          <div className="scope-control-group trigger-control">
            <span>TRIGGER</span>
            <select
              value={scope.trigger.source}
              onChange={(event) => onScopeChange(updateScopeTrigger(scope, { source: event.target.value as ScopeChannelId }))}
              aria-label="Trigger source"
            >
              {scope.channels.map((channel) => <option key={channel.id} value={channel.id}>CH {channel.id}</option>)}
            </select>
            <button
              className="trigger-slope"
              onClick={() => onScopeChange(updateScopeTrigger(scope, { slope: scope.trigger.slope === 'rising' ? 'falling' : 'rising' }))}
              aria-label="Toggle trigger slope"
            >{scope.trigger.slope === 'rising' ? '↗' : '↘'}</button>
            <button className="trigger-mode" onClick={cycleTriggerMode}>{scope.trigger.mode.toUpperCase()}</button>
          </div>
          <label className="scope-level-control">
            <span>LEVEL</span>
            <input
              type="range"
              min="-10"
              max="10"
              step="0.1"
              value={scope.trigger.level}
              onChange={(event) => onScopeChange(updateScopeTrigger(scope, { level: Number(event.target.value) }))}
            />
            <output>{formatScopeVoltage(scope.trigger.level)}</output>
          </label>
          <span className={`trigger-state ${triggerTrace?.slice.trigger ? 'is-triggered' : ''}`}>
            <i />{triggerTrace?.slice.trigger ? 'TRIGGERED' : scope.trigger.mode === 'auto' ? 'AUTO' : 'WAITING'}
          </span>
        </div>
      )}

      <div className="scope-content">
        {tab === 'scope' && (
          <div className="scope-plot-wrap interactive-scope">
            <div className="channel-rail">
              {scope.channels.map((channel) => (
                <div className={`scope-channel ${channel.visible ? 'is-visible' : ''}`} key={channel.id}>
                  <button
                    className="channel-toggle"
                    style={{ '--channel-color': channel.color } as React.CSSProperties}
                    onClick={() => onScopeChange(toggleScopeChannel(scope, channel.id))}
                    aria-pressed={channel.visible}
                    title={`Toggle channel ${channel.id}`}
                  >{channel.id}</button>
                  <div className="channel-assignment" title={channel.assignment?.label}>
                    <strong>{channel.assignment?.label ?? 'UNASSIGNED'}</strong>
                    <small>{channel.assignment?.signal.toUpperCase() ?? 'PROBE A NET'}</small>
                  </div>
                  <button className="channel-scale" onClick={() => cycleScale(channel.id)} title="Cycle volts per division">
                    {formatScopeVoltage(channel.voltsPerDivision)}<small>/div</small>
                  </button>
                  <button
                    className="channel-clear"
                    onClick={() => onScopeChange(clearChannelAssignment(scope, channel.id))}
                    aria-label={`Clear channel ${channel.id}`}
                    disabled={!channel.assignment}
                  >×</button>
                </div>
              ))}
            </div>
            <svg className="scope-plot" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
              <ScopeGrid width={width} height={height} />
              <line className="scope-zero" x1="0" y1={height / 2} x2={width} y2={height / 2} />
              <line className="trigger-position-line" x1={width * scope.timebase.triggerPosition} y1="0" x2={width * scope.timebase.triggerPosition} y2={height} />
              <line className="trigger-level-line" x1="0" y1={triggerY} x2={width} y2={triggerY} />
              {traces.map((trace) => trace.path && (
                <path
                  key={trace.channelId}
                  className="trace dynamic-trace"
                  d={trace.path}
                  style={{ stroke: trace.color }}
                />
              ))}
              {controls.running && <line className="scope-cursor" x1="0" y1="0" x2="0" y2={height} />}
            </svg>
            <div className="scope-readout">
              <span><small>VPP · CH {scope.trigger.source}</small>{formatScopeVoltage(measurement.peakToPeak)}</span>
              <span><small>RMS</small>{formatScopeVoltage(measurement.rms)}</span>
              <span><small>FREQ</small>{measurement.frequency ? formatFrequency(measurement.frequency) : '—'}</span>
            </div>
          </div>
        )}

        {tab === 'sweep' && (
          <div className="scope-plot-wrap response-wrap">
            <div className="response-axis y-axis"><span>+12</span><span>0</span><span>−24</span><span>−48</span><span>−60 dB</span></div>
            <svg className="scope-plot response-plot" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
              <ScopeGrid width={width} height={height} />
              <line className="scope-zero" x1="0" y1={height / 6} x2={width} y2={height / 6} />
              <path className="response-fill" d={`${responseToPath(response, width, height)} L${width},${height} L0,${height} Z`} />
              <path className="trace trace-response" d={responseToPath(response, width, height)} />
              <line className="cutoff-marker" x1={Math.log10(controls.cutoff / 20) / Math.log10(1000) * width} y1="0" x2={Math.log10(controls.cutoff / 20) / Math.log10(1000) * width} y2={height} />
            </svg>
            <div className="response-axis x-axis"><span>20 Hz</span><span>200 Hz</span><span>2 kHz</span><span>20 kHz</span></div>
            <div className="scope-readout response-readout">
              <span><small>CUTOFF</small>{formatFrequency(controls.cutoff)}</span>
              <span><small>RESONANCE</small>{Math.round(controls.resonance * 100)}%</span>
              <span><small>SLOPE</small>24 dB / oct</span>
            </div>
          </div>
        )}

        {tab === 'spice' && (
          <div className="spice-preview">
            <div className="spice-gutter">{spicePreview(document, controls).split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div>
            <pre>{spicePreview(document, controls)}</pre>
            <div className="spice-note">
              <Icon name="warning" size={15} />
              <span>Adapter seam ready for ngspice/WASM; named SSI subcircuits are not sign-off models yet.</span>
            </div>
          </div>
        )}
      </div>

      <div className="scope-statusbar">
        <span><i className={controls.running ? 'status-led is-on' : 'status-led'} />{controls.running ? 'RUNNING' : 'PAUSED'}</span>
        <span>{formatFrequency(scopeSampleRate)}</span>
        <span>{scopeSamples.length.toLocaleString()} samples</span>
        <span className="scope-status-spacer" />
        <span>Window {formatScopeTime(duration)}</span>
        <span>Solver: Voice DSP 0.2</span>
      </div>
    </section>
  )
}
