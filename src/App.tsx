import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { catalogByKind, referencePrefix } from './circuit/catalog'
import { planConnection } from './circuit/connections'
import { defaultControls, demoCircuit } from './circuit/demo'
import { diagnoseCircuit } from './circuit/diagnostics'
import { downloadBinaryFile, downloadTextFile, parseProject, safeFileStem, serializeProject } from './circuit/persistence'
import {
  circuitTemplates,
  instantiateCircuitTemplate,
  type CircuitTemplateId,
} from './circuit/templates'
import type {
  CircuitComponent,
  CircuitDocument,
  ComponentKind,
  Point,
  PortRef,
  SimulationControls,
} from './circuit/types'
import { ComponentPalette } from './components/ComponentPalette'
import type { EditorTool } from './components/ComponentSymbol'
import { Icon } from './components/Icon'
import { Inspector } from './components/Inspector'
import { SchematicCanvas } from './components/SchematicCanvas'
import { ScopeDock } from './components/ScopeDock'
import { useAudioMonitor } from './hooks/useAudioMonitor'
import { importKicadSchematic } from './kicad/adapter'
import { exportKicadProjectBundle } from './kicad/project'
import {
  assignConnection,
  assignConnectionToChannel,
  clearChannelAssignment,
  createDefaultScopeConfiguration,
  type ScopeChannelId,
  type ScopeConfiguration,
} from './simulation/scope'
import './styles.css'

type ToastKind = 'success' | 'warning' | 'error' | 'info'

interface ToastState {
  kind: ToastKind
  title: string
  message: string
}

function freshDemo(): CircuitDocument {
  return structuredClone(demoCircuit)
}

function connectionLabel(document: CircuitDocument, connection: CircuitDocument['connections'][number]): string {
  const from = document.components.find((component) => component.id === connection.from.componentId)
  const to = document.components.find((component) => component.id === connection.to.componentId)
  const fromPort = from && catalogByKind[from.kind].ports.find((port) => port.id === connection.from.portId)
  const toPort = to && catalogByKind[to.kind].ports.find((port) => port.id === connection.to.portId)
  return `${from?.reference ?? connection.from.componentId} ${fromPort?.label ?? connection.from.portId} → ${to?.reference ?? connection.to.componentId} ${toPort?.label ?? connection.to.portId}`
}

function initialScopeConfiguration(document: CircuitDocument): ScopeConfiguration {
  let configuration = createDefaultScopeConfiguration()
  const preferredConnections = ['vco-to-vcf', 'vcf-to-vca', 'vca-to-out']
    .map((id) => document.connections.find((connection) => connection.id === id))
    .filter((connection): connection is CircuitDocument['connections'][number] => Boolean(connection))
  const fallbackConnections = document.connections.filter(
    (connection) => connection.signal === 'audio' && !preferredConnections.some((preferred) => preferred.id === connection.id),
  )
  const channels: ScopeChannelId[] = ['A', 'B', 'C']
  for (const [index, connection] of [...preferredConnections, ...fallbackConnections].slice(0, 3).entries()) {
    configuration = assignConnectionToChannel(
      configuration,
      channels[index],
      connection,
      connectionLabel(document, connection),
    )
  }
  return configuration
}

function nextReference(document: CircuitDocument, kind: ComponentKind): string {
  const prefix = referencePrefix[kind]
  const values = document.components
    .filter((component) => component.reference.startsWith(prefix))
    .map((component) => Number(component.reference.slice(prefix.length).replace(/\D/g, '')) || 0)
  const next = Math.max(0, ...values) + 1
  return `${prefix}${prefix === '#PWR' ? String(next).padStart(2, '0') : next}`
}

function makeId(kind: string): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function cloneDocumentWithRevision(document: CircuitDocument): CircuitDocument {
  return { ...document, revision: document.revision + 1 }
}

function toastIcon(kind: ToastKind): 'info' | 'warning' {
  return kind === 'warning' || kind === 'error' ? 'warning' : 'info'
}

export default function App() {
  const [circuit, setCircuit] = useState<CircuitDocument>(freshDemo)
  const [controls, setControls] = useState<SimulationControls>({ ...defaultControls })
  const [scope, setScope] = useState<ScopeConfiguration>(() => initialScopeConfiguration(demoCircuit))
  const [selectedId, setSelectedId] = useState<string | undefined>('vcf')
  const [tool, setTool] = useState<EditorTool>('select')
  const [pendingPort, setPendingPort] = useState<PortRef>()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [past, setPast] = useState<CircuitDocument[]>([])
  const [future, setFuture] = useState<CircuitDocument[]>([])
  const [toast, setToast] = useState<ToastState>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<number | undefined>(undefined)

  useAudioMonitor(controls)

  const selected = circuit.components.find((component) => component.id === selectedId)
  const diagnostics = useMemo(() => diagnoseCircuit(circuit), [circuit])

  const announce = (nextToast: ToastState) => {
    setToast(nextToast)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(undefined), 5200)
  }

  const rememberCurrent = () => {
    setPast((history) => [...history, circuit].slice(-40))
    setFuture([])
  }

  const commit = (next: CircuitDocument) => {
    rememberCurrent()
    setCircuit(cloneDocumentWithRevision(next))
  }

  const undo = () => {
    const previous = past[past.length - 1]
    if (!previous) return
    setPast((history) => history.slice(0, -1))
    setFuture((history) => [circuit, ...history].slice(0, 40))
    setCircuit(previous)
    setPendingPort(undefined)
  }

  const redo = () => {
    const next = future[0]
    if (!next) return
    setFuture((history) => history.slice(1))
    setPast((history) => [...history, circuit].slice(-40))
    setCircuit(next)
    setPendingPort(undefined)
  }

  const addComponent = (kind: ComponentKind) => {
    const catalog = catalogByKind[kind]
    const id = makeId(kind)
    const offset = circuit.components.length % 5
    const component: CircuitComponent = {
      id,
      kind,
      reference: nextReference(circuit, kind),
      label: catalog.name.toUpperCase(),
      value: catalog.defaultValue,
      position: { x: 320 + offset * 34, y: 280 + offset * 22 },
      parameters: { ...(catalog.defaultParameters ?? {}) },
    }
    commit({ ...circuit, components: [...circuit.components, component] })
    setSelectedId(id)
    setTool('select')
    announce({ kind: 'success', title: `${catalog.name} added`, message: 'Placed on the canvas and ready to connect.' })
  }

  const addCircuitTemplate = (id: CircuitTemplateId) => {
    const template = circuitTemplates.find((candidate) => candidate.id === id)
    if (!template) return
    const minX = circuit.components.length
      ? Math.min(...circuit.components.map((component) => component.position.x))
      : 40
    const maxY = circuit.components.length
      ? Math.max(...circuit.components.map((component) =>
        component.position.y + catalogByKind[component.kind].size.height,
      ))
      : -80
    const instance = instantiateCircuitTemplate(circuit, id, {
      x: Math.max(40, minX),
      y: maxY + 120,
    })
    commit({
      ...circuit,
      components: [...circuit.components, ...instance.components],
      connections: [...circuit.connections, ...instance.connections],
    })
    setSelectedId(instance.primaryComponentId)
    setPendingPort(undefined)
    setTool('select')
    announce({
      kind: 'success',
      title: `${template.name} placed`,
      message: `${instance.components.length} editable parts and ${instance.connections.length} datasheet connections added as one undoable action.`,
    })
  }

  const deleteSelected = () => {
    if (!selected) return
    const next = {
      ...circuit,
      components: circuit.components.filter((component) => component.id !== selected.id),
      connections: circuit.connections.filter(
        (connection) => connection.from.componentId !== selected.id && connection.to.componentId !== selected.id,
      ),
    }
    commit(next)
    setSelectedId(undefined)
    announce({ kind: 'info', title: `${selected.reference} removed`, message: 'Connected wires were removed with the part.' })
  }

  const duplicateSelected = () => {
    if (!selected) return
    const id = makeId(selected.kind)
    const duplicate: CircuitComponent = {
      ...structuredClone(selected),
      id,
      reference: nextReference(circuit, selected.kind),
      position: { x: selected.position.x + 28, y: selected.position.y + 28 },
    }
    commit({ ...circuit, components: [...circuit.components, duplicate] })
    setSelectedId(id)
  }

  const moveComponent = (componentId: string, position: Point) => {
    setCircuit((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === componentId ? { ...component, position } : component,
      ),
    }))
  }

  const updateControls = (next: Partial<SimulationControls>) => {
    setControls((current) => ({ ...current, ...next }))
    setCircuit((current) => ({
      ...current,
      components: current.components.map((component) => {
        if (component.kind === 'ssi2144') {
          const parameters = { ...component.parameters }
          if (next.cutoff !== undefined) parameters.cutoff = next.cutoff
          if (next.resonance !== undefined) parameters.resonance = next.resonance
          if (next.drive !== undefined) parameters.drive = next.drive
          return { ...component, parameters }
        }
        if (component.kind === 'ssi2164' && next.envelope !== undefined) {
          return { ...component, parameters: { ...component.parameters, level: next.envelope } }
        }
        return component
      }),
    }))
  }

  const updateSelectedValue = (value: string) => {
    if (!selected) return
    setCircuit((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === selected.id ? { ...component, value } : component,
      ),
    }))
  }

  const updateSelectedFootprint = (footprint: string) => {
    if (!selected) return
    setCircuit((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === selected.id
          ? { ...component, footprint: footprint || undefined }
          : component,
      ),
    }))
  }

  const updateSelectedParameter = (key: string, value: number) => {
    if (!selected) return
    setCircuit((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.id === selected.id
          ? { ...component, parameters: { ...component.parameters, [key]: value } }
          : component,
      ),
    }))
  }

  const changeTool = (nextTool: EditorTool) => {
    setTool(nextTool)
    if (nextTool !== 'wire') setPendingPort(undefined)
    if (nextTool === 'probe') {
      announce({ kind: 'info', title: 'Probe mode', message: 'The demo scope is pinned to the VCO, filter, and main output nets.' })
    }
  }

  const createConnection = (from: PortRef, to: PortRef) => {
    const fromComponent = circuit.components.find((component) => component.id === from.componentId)
    const toComponent = circuit.components.find((component) => component.id === to.componentId)
    const fromPort = fromComponent && catalogByKind[fromComponent.kind].ports.find((port) => port.id === from.portId)
    const toPort = toComponent && catalogByKind[toComponent.kind].ports.find((port) => port.id === to.portId)
    if (!fromComponent || !toComponent || !fromPort || !toPort) return

    const plan = planConnection(circuit, from, to)
    if (!plan.ok && plan.reason === 'signal-mismatch') {
      announce({
        kind: 'warning',
        title: 'Signal types do not match',
        message: `${fromPort.signal.toUpperCase()} cannot connect directly to ${toPort.signal.toUpperCase()} in guided wiring mode.`,
      })
      return
    }
    if (!plan.ok && plan.reason === 'direction-mismatch') {
      announce({
        kind: 'warning',
        title: 'Port directions do not match',
        message: `${fromPort.direction.toUpperCase()} cannot connect directly to ${toPort.direction.toUpperCase()} in guided wiring mode.`,
      })
      return
    }
    if (!plan.ok) return

    const exists = circuit.connections.some((connection) =>
      (connection.from.componentId === plan.from.componentId &&
        connection.from.portId === plan.from.portId &&
        connection.to.componentId === plan.to.componentId &&
        connection.to.portId === plan.to.portId) ||
      (connection.from.componentId === plan.to.componentId &&
        connection.from.portId === plan.to.portId &&
        connection.to.componentId === plan.from.componentId &&
        connection.to.portId === plan.from.portId),
    )
    if (exists) return

    const connection = {
      id: makeId('wire'),
      from: plan.from,
      to: plan.to,
      signal: plan.signal,
    }
    commit({ ...circuit, connections: [...circuit.connections, connection] })
    setPendingPort(undefined)
    const driverComponent = circuit.components.find((component) => component.id === plan.from.componentId)
    const sinkComponent = circuit.components.find((component) => component.id === plan.to.componentId)
    const driverPort = driverComponent && catalogByKind[driverComponent.kind].ports.find((port) => port.id === plan.from.portId)
    const sinkPort = sinkComponent && catalogByKind[sinkComponent.kind].ports.find((port) => port.id === plan.to.portId)
    announce({
      kind: 'success',
      title: 'Net connected',
      message: `${driverComponent?.reference ?? plan.from.componentId}.${driverPort?.label ?? plan.from.portId} → ${sinkComponent?.reference ?? plan.to.componentId}.${sinkPort?.label ?? plan.to.portId}`,
    })
  }

  const handlePortClick = (componentId: string, portId: string) => {
    if (!pendingPort) {
      setPendingPort({ componentId, portId })
      return
    }

    if (pendingPort.componentId === componentId && pendingPort.portId === portId) {
      setPendingPort(undefined)
      return
    }

    createConnection(pendingPort, { componentId, portId })
    setPendingPort(undefined)
  }

  const handleProbeConnection = (connectionId: string) => {
    const connection = circuit.connections.find((candidate) => candidate.id === connectionId)
    if (!connection) return
    const label = connectionLabel(circuit, connection)
    const existing = scope.channels.find((channel) => channel.assignment?.connectionId === connectionId)
    if (existing) {
      setScope(clearChannelAssignment(scope, existing.id))
      announce({ kind: 'info', title: `Channel ${existing.id} cleared`, message: `${label} is no longer pinned to the scope.` })
      return
    }
    const destination = scope.channels[scope.assignmentCursor]?.id ?? 'A'
    setScope(assignConnection(scope, connection, undefined, label))
    announce({ kind: 'success', title: `Probe → channel ${destination}`, message: label })
  }

  const resetDemo = () => {
    rememberCurrent()
    const resetCircuit = freshDemo()
    setCircuit(resetCircuit)
    setScope(initialScopeConfiguration(resetCircuit))
    setControls({ ...defaultControls })
    setSelectedId('vcf')
    setPendingPort(undefined)
    announce({ kind: 'info', title: 'Voice reset', message: 'The SSI subtractive voice is back to its reference state.' })
  }

  const exportKicad = () => {
    try {
      const bundle = exportKicadProjectBundle(circuit)
      downloadBinaryFile(bundle.filename, bundle.archive, 'application/zip')
      announce({
        kind: 'success',
        title: 'KiCad project bundle exported',
        message: 'Full multi-unit SSI symbols, assigned footprints, local libraries, project settings, and design notes.',
      })
    } catch (error) {
      announce({ kind: 'error', title: 'Export failed', message: error instanceof Error ? error.message : 'Unknown export error.' })
    }
  }

  const saveProject = () => {
    downloadTextFile(`${safeFileStem(circuit.title)}.saigen.json`, serializeProject(circuit), 'application/json')
    announce({ kind: 'success', title: 'Project saved', message: 'A portable Saigen project file was downloaded.' })
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const source = await file.text()
      const result = file.name.endsWith('.json') || source.trimStart().startsWith('{')
        ? { document: parseProject(source), warnings: [] }
        : importKicadSchematic(source)
      rememberCurrent()
      setCircuit(result.document)
      setScope(initialScopeConfiguration(result.document))
      setSelectedId(result.document.components[0]?.id)
      setPendingPort(undefined)
      announce({
        kind: result.warnings.length ? 'warning' : 'success',
        title: result.warnings.length ? 'Imported with notes' : 'Project imported',
        message: result.warnings[0] ?? `${result.document.components.length} parts loaded from ${file.name}.`,
      })
    } catch (error) {
      announce({ kind: 'error', title: 'Import failed', message: error instanceof Error ? error.message : 'The file could not be read.' })
    }
  }

  useEffect(() => {
    const connectionIds = new Set(circuit.connections.map((connection) => connection.id))
    setScope((current) => current.channels.reduce(
      (next, channel) => channel.assignment && !connectionIds.has(channel.assignment.connectionId)
        ? clearChannelAssignment(next, channel.id)
        : next,
      current,
    ))
  }, [circuit.connections])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (event.code === 'Space') {
        event.preventDefault()
        updateControls({ running: !controls.running })
      } else if (event.key.toLowerCase() === 'v') {
        changeTool('select')
      } else if (event.key.toLowerCase() === 'w') {
        changeTool('wire')
      } else if (event.key.toLowerCase() === 'p') {
        changeTool('probe')
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
        event.preventDefault()
        deleteSelected()
      } else if (event.key === 'Escape') {
        setPendingPort(undefined)
        setTool('select')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><i /><i /><i /></span>
          <div><strong>SAI<span>/</span>GEN</strong><small>BROK MODULAR CIRCUIT LAB</small></div>
        </div>

        <button className="mobile-library-button" onClick={() => setPaletteOpen(true)}>
          <Icon name="grid" size={15} />Parts
        </button>

        <div className="project-identity">
          <span className="project-path">LABS <b>/</b> SUBTRACTIVE VOICE</span>
          <div><strong>{circuit.title}</strong><span>REV {String(circuit.revision).padStart(2, '0')}</span></div>
        </div>

        <div className="history-controls" role="group" aria-label="History controls">
          <button className="icon-button" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo"><Icon name="undo" /></button>
          <button className="icon-button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo"><Icon name="redo" /></button>
        </div>

        <div className="transport" role="group" aria-label="Simulation transport">
          <button className="transport-reset" onClick={resetDemo} title="Reset voice"><Icon name="reset" size={16} /></button>
          <button
            className={`run-button ${controls.running ? 'is-running' : ''}`}
            onClick={() => updateControls({ running: !controls.running })}
          >
            <Icon name={controls.running ? 'pause' : 'play'} size={15} />
            <span>{controls.running ? 'PAUSE' : 'RUN'}</span>
            <kbd>SPACE</kbd>
          </button>
          <button
            className={`monitor-button ${controls.monitor ? 'is-on' : ''}`}
            onClick={() => updateControls({ monitor: !controls.monitor })}
            title="Audio monitor"
            aria-pressed={controls.monitor}
          >
            <Icon name="headphones" size={16} />
          </button>
        </div>

        <div className="file-actions">
          <button className="icon-button" onClick={saveProject} aria-label="Save Saigen project" title="Save project"><Icon name="save" size={17} /></button>
          <button className="secondary-button" onClick={() => fileInputRef.current?.click()}><Icon name="upload" size={15} />Import</button>
          <button className="primary-button" onClick={exportKicad}><Icon name="download" size={15} />Export KiCad bundle</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.kicad_sch,.sch"
            onChange={importFile}
            hidden
          />
        </div>
      </header>

      {paletteOpen && <button className="mobile-palette-backdrop" onClick={() => setPaletteOpen(false)} aria-label="Close component library" />}

      <div className="workspace">
        <ComponentPalette
          onAdd={addComponent}
          onAddTemplate={addCircuitTemplate}
          mobileOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
        />
        <main className="workbench">
          <SchematicCanvas
            document={circuit}
            selectedId={selectedId}
            running={controls.running}
            tool={tool}
            pendingPort={pendingPort}
            probeMarkers={scope.channels.flatMap((channel) => channel.assignment ? [{
              connectionId: channel.assignment.connectionId,
              channel: channel.id,
              color: channel.color,
            }] : [])}
            diagnostics={diagnostics}
            onToolChange={changeTool}
            onSelect={setSelectedId}
            onMoveStart={rememberCurrent}
            onMove={moveComponent}
            onPortClick={handlePortClick}
            onCreateConnection={createConnection}
            onProbeConnection={handleProbeConnection}
          />
          <ScopeDock document={circuit} controls={controls} scope={scope} onScopeChange={setScope} />
        </main>
        <Inspector
          component={selected}
          controls={controls}
          onControlsChange={updateControls}
          onValueChange={updateSelectedValue}
          onFootprintChange={updateSelectedFootprint}
          onParameterChange={updateSelectedParameter}
          onDelete={deleteSelected}
          onDuplicate={duplicateSelected}
        />
      </div>

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          <span className="toast-icon"><Icon name={toastIcon(toast.kind)} size={17} /></span>
          <div><strong>{toast.title}</strong><span>{toast.message}</span></div>
          <button onClick={() => setToast(undefined)} aria-label="Dismiss notification"><Icon name="close" size={14} /></button>
        </div>
      )}
    </div>
  )
}
