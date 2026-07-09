import { catalogByKind } from '../circuit/catalog'
import type { CircuitComponent, PortDirection, SimulationControls } from '../circuit/types'
import { cutoffToSlider, formatFrequency, midiNoteToFrequency, sliderToCutoff } from '../simulation/voice'
import { Icon } from './Icon'

interface InspectorProps {
  component?: CircuitComponent
  controls: SimulationControls
  onControlsChange: (next: Partial<SimulationControls>) => void
  onValueChange: (value: string) => void
  onParameterChange: (key: string, value: number) => void
  onDelete: () => void
  onDuplicate: () => void
}

interface SliderControlProps {
  label: string
  valueLabel: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  accent?: string
}

const datasheetUrls: Partial<Record<CircuitComponent['kind'], string>> = {
  ssi2131: 'https://www.soundsemiconductor.com/downloads/ssi2131datasheet.pdf',
  ssi2144: 'https://www.soundsemiconductor.com/downloads/ssi2144datasheet.pdf',
  ssi2164: 'https://www.soundsemiconductor.com/downloads/ssi2164datasheet.pdf',
}

const supplyDescriptions: Partial<Record<CircuitComponent['kind'], string>> = {
  ssi2131: '+5 V / −5 to −18 V',
  ssi2144: '±4 V to ±16 V',
  ssi2164: '±4 V to ±18 V',
}

function SliderControl({
  label,
  valueLabel,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  accent = '#68c7b2',
}: SliderControlProps) {
  const percentage = ((value - min) / (max - min)) * 100
  return (
    <label className="inspector-control">
      <span className="control-label"><span>{label}</span><output>{valueLabel}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--range-progress': `${percentage}%`, '--range-accent': accent } as React.CSSProperties}
      />
    </label>
  )
}

function midiNoteName(note: number): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`
}

function portRoleLabel(direction: PortDirection): string {
  switch (direction) {
    case 'input': return 'IN'
    case 'output': return 'OUT'
    case 'passive': return 'PASSIVE'
    case 'powerInput': return 'PWR IN'
    case 'powerOutput': return 'PWR OUT'
  }
}

function parameterPresentation(key: string, value: number, kind: CircuitComponent['kind']): {
  label: string
  min: number
  max: number
  step: number
  valueLabel: string
} {
  const label = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\D)(\d+)/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase())

  if (key === 'frequency' && kind === 'functionGenerator') {
    return { label, min: 20, max: 20_000, step: 1, valueLabel: formatFrequency(value) }
  }
  if (key === 'frequency') return { label, min: 0.01, max: 30, step: 0.01, valueLabel: `${value.toFixed(value < 10 ? 2 : 1)} Hz` }
  if (key === 'rate') return { label, min: 0.1, max: 30, step: 0.1, valueLabel: `${value.toFixed(1)} Hz` }
  if (key === 'bpm') return { label: 'Tempo', min: 20, max: 300, step: 1, valueLabel: `${Math.round(value)} BPM` }
  if (key === 'pulseWidthMs') return { label: 'Pulse width', min: 1, max: 500, step: 1, valueLabel: `${Math.round(value)} ms` }
  if (key === 'dutyCycle' || key === 'pulseWidth' || key === 'sustain') {
    return { label, min: 0.05, max: 0.95, step: 0.01, valueLabel: `${Math.round(value * 100)}%` }
  }
  if (key === 'amplitude') return { label, min: 0, max: 10, step: 0.1, valueLabel: `${value.toFixed(1)} V` }
  if (key === 'voltage' && (kind === 'gateInput' || kind === 'triggerSource')) {
    return { label: 'High voltage', min: 0, max: 12, step: 0.1, valueLabel: `${value.toFixed(1)} V` }
  }
  if (key === 'offset' || key === 'voltage' || key === 'threshold') {
    return { label, min: -12, max: 12, step: 0.1, valueLabel: `${value >= 0 ? '+' : ''}${value.toFixed(1)} V` }
  }
  if (key === 'hysteresis') return { label, min: 0, max: 2, step: 0.01, valueLabel: `${value.toFixed(2)} V` }
  if (key === 'gain') return { label, min: -1, max: 1, step: 0.01, valueLabel: `${value >= 0 ? '+' : ''}${value.toFixed(2)}×` }
  if (/^gain\d+$/.test(key)) return { label, min: 0, max: 1, step: 0.01, valueLabel: `${Math.round(value * 100)}%` }
  return {
    label,
    min: Math.min(0, value * 0.25),
    max: Math.max(1, value * 2),
    step: Math.max(0.01, Math.abs(value) / 100),
    valueLabel: Number.isInteger(value) ? String(value) : value.toFixed(2),
  }
}

export function Inspector({
  component,
  controls,
  onControlsChange,
  onValueChange,
  onParameterChange,
  onDelete,
  onDuplicate,
}: InspectorProps) {
  if (!component) {
    return (
      <aside className="inspector" aria-label="Inspector">
        <div className="panel-heading">
          <div><span className="eyebrow">INSPECTOR</span><h2>Nothing selected</h2></div>
        </div>
        <div className="empty-state inspector-empty">
          <span className="empty-glyph"><Icon name="cursor" size={24} /></span>
          <strong>Select a part</strong>
          <p>Choose a component to inspect its model, pins, and live parameters.</p>
        </div>
      </aside>
    )
  }

  const catalog = catalogByKind[component.kind]
  const datasheetUrl = datasheetUrls[component.kind]
  const specialParameters = ['ssi2144', 'ssi2131', 'ssi2164', 'envelope'].includes(component.kind)
  const genericParameters = specialParameters ? [] : Object.entries(component.parameters)
  const fidelityLabel = catalog.category === 'sources'
    ? 'Ideal source preview'
    : component.kind.startsWith('ssi')
      ? 'Datasheet macro preview'
      : catalog.modelStage === 'behavioral'
        ? 'Behavioral preview'
    : catalog.modelStage === 'electrical'
      ? 'Electrical primitive'
      : 'Visual only'

  return (
    <aside className="inspector" aria-label="Component inspector">
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className="inspector-part-mark" style={{ '--part-color': catalog.color } as React.CSSProperties}>
            {catalog.shortName}
          </span>
          <div>
            <span className="eyebrow">{component.reference} · SELECTED</span>
            <h2>{catalog.name}</h2>
          </div>
        </div>
        <div className="inspector-actions">
          <button className="icon-button subtle" onClick={onDuplicate} aria-label="Duplicate component" title="Duplicate"><Icon name="copy" size={15} /></button>
          <button className="icon-button subtle danger" onClick={onDelete} aria-label="Delete component" title="Delete"><Icon name="trash" size={15} /></button>
        </div>
      </div>

      <div className="inspector-scroll">
        <div className="model-summary">
          <span className={`fidelity-badge stage-${catalog.modelStage}`}><i />{fidelityLabel}</span>
          <p>{catalog.description}</p>
          {datasheetUrl && (
            <a href={datasheetUrl} target="_blank" rel="noreferrer">
              SSI datasheet <span>↗</span>
            </a>
          )}
        </div>

        <section className="inspector-section">
          <div className="section-label"><span>LIVE PARAMETERS</span><span>01</span></div>

          {component.kind === 'ssi2144' && (
            <div className="controls-stack">
              <SliderControl
                label="Cutoff"
                valueLabel={formatFrequency(controls.cutoff)}
                value={cutoffToSlider(controls.cutoff)}
                onChange={(value) => onControlsChange({ cutoff: Math.round(sliderToCutoff(value)) })}
                accent={catalog.color}
              />
              <SliderControl
                label="Resonance"
                valueLabel={`${Math.round(controls.resonance * 100)}%`}
                value={controls.resonance}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => onControlsChange({ resonance: value })}
                accent={catalog.color}
              />
              <SliderControl
                label="Input drive"
                valueLabel={`+${controls.drive.toFixed(1)} dB`}
                value={controls.drive}
                min={0}
                max={18}
                step={0.5}
                onChange={(value) => onControlsChange({ drive: value })}
                accent="#f2bf5e"
              />
            </div>
          )}

          {component.kind === 'ssi2131' && (
            <div className="controls-stack">
              <SliderControl
                label="Keyboard note"
                valueLabel={`${midiNoteName(controls.note)} · ${formatFrequency(midiNoteToFrequency(controls.note))}`}
                value={controls.note}
                min={24}
                max={84}
                step={1}
                onChange={(value) => onControlsChange({ note: value })}
                accent={catalog.color}
              />
              <SliderControl
                label="Pulse width"
                valueLabel={`${Math.round((component.parameters.pulseWidth ?? 0.5) * 100)}%`}
                value={component.parameters.pulseWidth ?? 0.5}
                min={0.05}
                max={0.95}
                step={0.01}
                onChange={(value) => onParameterChange('pulseWidth', value)}
                accent={catalog.color}
              />
            </div>
          )}

          {component.kind === 'ssi2164' && (
            <div className="controls-stack">
              <SliderControl
                label="VCA level"
                valueLabel={`${Math.round(controls.envelope * 100)}%`}
                value={controls.envelope}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => onControlsChange({ envelope: value })}
                accent={catalog.color}
              />
              <div className="control-law">
                <span>CONTROL LAW</span>
                <strong>−33 mV / dB</strong>
              </div>
            </div>
          )}

          {component.kind === 'envelope' && (
            <div className="controls-stack">
              {(['attack', 'decay', 'sustain', 'release'] as const).map((parameter) => (
                <SliderControl
                  key={parameter}
                  label={parameter[0].toUpperCase() + parameter.slice(1)}
                  valueLabel={parameter === 'sustain'
                    ? `${Math.round((component.parameters[parameter] ?? 0) * 100)}%`
                    : `${(component.parameters[parameter] ?? 0).toFixed(2)} s`}
                  value={component.parameters[parameter] ?? 0}
                  min={parameter === 'sustain' ? 0 : 0.01}
                  max={parameter === 'sustain' ? 1 : 2}
                  step={0.01}
                  onChange={(value) => onParameterChange(parameter, value)}
                  accent={catalog.color}
                />
              ))}
            </div>
          )}

          {!specialParameters && component.value !== undefined && (
            <label className="text-control">
              <span>Value</span>
              <input
                value={component.value ?? component.label}
                onChange={(event) => onValueChange(event.target.value)}
                spellCheck={false}
              />
            </label>
          )}

          {genericParameters.length > 0 && (
            <div className="controls-stack generic-parameter-stack">
              {genericParameters.map(([key, value]) => {
                if (key === 'closed' || key === 'state') {
                  return (
                    <div className="parameter-toggle-row" key={key}>
                      <span>{key === 'closed' ? 'Contact state' : 'Gate state'}</span>
                      <button
                        className={value ? 'is-on' : ''}
                        onClick={() => onParameterChange(key, value ? 0 : 1)}
                      >{key === 'closed' ? (value ? 'CLOSED' : 'OPEN') : (value ? 'HIGH' : 'LOW')}</button>
                    </div>
                  )
                }
                const presentation = parameterPresentation(key, value, component.kind)
                return (
                  <SliderControl
                    key={key}
                    label={presentation.label}
                    valueLabel={presentation.valueLabel}
                    value={value}
                    min={presentation.min}
                    max={presentation.max}
                    step={presentation.step}
                    onChange={(nextValue) => onParameterChange(key, nextValue)}
                    accent={catalog.color}
                  />
                )
              })}
            </div>
          )}
        </section>

        {catalog.ports.length > 0 && (
          <section className="inspector-section">
            <div className="section-label"><span>MACRO PORTS</span><span>02</span></div>
            <div className="pin-table">
              {catalog.ports.map((port) => (
                <div className="pin-row" key={port.id}>
                  <span className={`pin-signal signal-${port.signal}`} />
                  <span className="pin-number">{port.pinNumber ?? '—'}</span>
                  <strong>{port.label}</strong>
                  <span>{port.defaultNet
                    ? `AUTO ${port.defaultNet}`
                    : `${port.signal.toUpperCase()} · ${portRoleLabel(port.direction)}`}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(supplyDescriptions[component.kind] || catalog.modelStage === 'behavioral' || catalog.category === 'sources') && (
          <section className="inspector-section">
            <div className="section-label"><span>MODEL NOTES</span><span>03</span></div>
            {supplyDescriptions[component.kind] && (
              <div className="spec-row"><span>Supply range</span><strong>{supplyDescriptions[component.kind]}</strong></div>
            )}
            <div className="model-notice">
              <Icon name="info" size={16} />
              <p>
                {catalog.category === 'sources'
                  ? 'Ideal live source for wiring and scope preview. Input-driven reset, sync, and downstream circuit response will move into the graph solver.'
                  : catalog.modelStage === 'behavioral'
                  ? 'Fast musical preview. The macro exposes key signal pins but is not yet a fabrication-ready package symbol or transistor-level sign-off model.'
                  : 'This primitive is included in the electrical-core validation path.'}
              </p>
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}
