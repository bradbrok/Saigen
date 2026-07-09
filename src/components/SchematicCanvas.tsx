import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { catalogByKind } from '../circuit/catalog'
import type { CircuitDiagnostic } from '../circuit/diagnostics'
import type { CircuitDocument, Point, PortRef } from '../circuit/types'
import {
  fitCameraToBounds,
  viewportToWorld,
  zoomCameraAround,
  type ViewportCamera,
  type ViewportSize,
} from '../circuit/viewport'
import { ComponentSymbol, getPortPosition, type EditorTool } from './ComponentSymbol'
import { Icon } from './Icon'

interface SchematicCanvasProps {
  document: CircuitDocument
  selectedId?: string
  running: boolean
  tool: EditorTool
  pendingPort?: PortRef
  probeMarkers: Array<{ connectionId: string; channel: string; color: string }>
  diagnostics: CircuitDiagnostic[]
  onToolChange: (tool: EditorTool) => void
  onSelect: (componentId?: string) => void
  onMoveStart: () => void
  onMove: (componentId: string, position: Point) => void
  onPortClick: (componentId: string, portId: string) => void
  onCreateConnection: (from: PortRef, to: PortRef) => void
  onProbeConnection: (connectionId: string) => void
}

interface DragState {
  componentId: string
  pointerId: number
  clientStart: Point
  worldStart: Point
  positionStart: Point
  moved: boolean
}

interface WireDragState {
  source: PortRef
  pointerId: number
  clientStart: Point
  current: Point
  target?: PortRef
  targetPoint?: Point
  moved: boolean
}

interface PanState {
  pointerId: number
  clientStart: Point
  viewportStart: Point
  cameraStart: ViewportCamera
  moved: boolean
  deselectOnClick: boolean
}

interface PinchState {
  pointerIds: [number, number]
  startDistance: number
  startCamera: ViewportCamera
  anchorWorld: Point
}

const BASE_VIEWPORT_WIDTH = 1100
const DEFAULT_VIEWPORT: ViewportSize = { width: BASE_VIEWPORT_WIDTH, height: 560 }

const signalColors = {
  audio: '#f2bf5e',
  cv: '#68c7b2',
  gate: '#d7a3e8',
  power: '#8daadd',
  passive: '#c3c6c7',
}

function connectionPath(from: Point, to: Point): string {
  const distance = Math.abs(to.x - from.x)
  const direction = to.x >= from.x ? 1 : -1
  const middleX = from.x + direction * Math.max(38, distance / 2)
  return `M${from.x},${from.y} H${middleX} V${to.y} H${to.x}`
}

export function SchematicCanvas({
  document,
  selectedId,
  running,
  tool,
  pendingPort,
  probeMarkers,
  diagnostics,
  onToolChange,
  onSelect,
  onMoveStart,
  onMove,
  onPortClick,
  onCreateConnection,
  onProbeConnection,
}: SchematicCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const dragRef = useRef<DragState | undefined>(undefined)
  const wireDragRef = useRef<WireDragState | undefined>(undefined)
  const panRef = useRef<PanState | undefined>(undefined)
  const pinchRef = useRef<PinchState | undefined>(undefined)
  const touchPointersRef = useRef(new Map<number, Point>())
  const lastRevealedSelectionRef = useRef(selectedId)
  const [wireDrag, setWireDrag] = useState<WireDragState>()
  const [camera, setCamera] = useState<ViewportCamera>({ x: 0, y: 0, zoom: 1 })
  const [viewport, setViewport] = useState<ViewportSize>(DEFAULT_VIEWPORT)
  const [isPanning, setIsPanning] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const components = useMemo(
    () => new Map(document.components.map((component) => [component.id, component])),
    [document.components],
  )

  const circuitBounds = useMemo(() => {
    if (!document.components.length) return undefined
    return document.components.reduce((bounds, component) => {
      const size = catalogByKind[component.kind].size
      return {
        minX: Math.min(bounds.minX, component.position.x - 24),
        minY: Math.min(bounds.minY, component.position.y - 24),
        maxX: Math.max(bounds.maxX, component.position.x + size.width + 24),
        maxY: Math.max(bounds.maxY, component.position.y + size.height + 24),
      }
    }, {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    })
  }, [document.components])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const updateViewport = () => {
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      setViewport((current) => {
        const next = {
          width: BASE_VIEWPORT_WIDTH,
          height: BASE_VIEWPORT_WIDTH * rect.height / rect.width,
        }
        return Math.abs(current.height - next.height) < 0.5 ? current : next
      })
    }
    updateViewport()
    const observer = new ResizeObserver(updateViewport)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (lastRevealedSelectionRef.current === selectedId) return
    lastRevealedSelectionRef.current = selectedId
    if (!selectedId) return
    const component = components.get(selectedId)
    if (!component) return
    const size = catalogByKind[component.kind].size
    const center = {
      x: component.position.x + size.width / 2,
      y: component.position.y + size.height / 2,
    }
    const screen = {
      x: camera.x + center.x * camera.zoom,
      y: camera.y + center.y * camera.zoom,
    }
    const margin = 80
    if (screen.x < margin || screen.x > viewport.width - margin ||
      screen.y < margin || screen.y > viewport.height - margin) {
      setCamera((current) => ({
        ...current,
        x: viewport.width / 2 - center.x * current.zoom,
        y: viewport.height / 2 - center.y * current.zoom,
      }))
    }
  }, [selectedId, components, camera.x, camera.y, camera.zoom, viewport])

  const clientPoint = (clientX: number, clientY: number, target: SVGGraphicsElement): Point | undefined => {
    const matrix = target.getScreenCTM()?.inverse()
    if (!matrix || !svgRef.current) return undefined
    const point = svgRef.current.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const transformed = point.matrixTransform(matrix)
    return { x: transformed.x, y: transformed.y }
  }

  const viewportPoint = (clientX: number, clientY: number): Point | undefined => {
    if (!svgRef.current) return undefined
    return clientPoint(clientX, clientY, svgRef.current)
  }

  const canvasPoint = (clientX: number, clientY: number): Point | undefined => {
    if (!worldRef.current) return undefined
    return clientPoint(clientX, clientY, worldRef.current)
  }

  const startDrag = (componentId: string, event: ReactPointerEvent<SVGGElement>) => {
    const component = components.get(componentId)
    const worldStart = canvasPoint(event.clientX, event.clientY)
    if (!component || !worldStart) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      componentId,
      pointerId: event.pointerId,
      clientStart: { x: event.clientX, y: event.clientY },
      worldStart,
      positionStart: component.position,
      moved: false,
    }
  }

  const nearestPort = (point: Point, source: PortRef): { ref: PortRef; point: Point } | undefined => {
    let nearest: { ref: PortRef; point: Point; distance: number } | undefined
    const rect = svgRef.current?.getBoundingClientRect()
    const snapRadius = rect?.width
      ? 20 * viewport.width / rect.width / camera.zoom
      : 22 / camera.zoom
    for (const component of components.values()) {
      const catalog = catalogByKind[component.kind]
      for (const port of catalog.ports) {
        if (component.id === source.componentId && port.id === source.portId) continue
        const candidate = getPortPosition(component, port.id)
        if (!candidate) continue
        const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)
        if (distance <= snapRadius && (!nearest || distance < nearest.distance)) {
          nearest = { ref: { componentId: component.id, portId: port.id }, point: candidate, distance }
        }
      }
    }
    return nearest ? { ref: nearest.ref, point: nearest.point } : undefined
  }

  const startWireDrag = (
    componentId: string,
    portId: string,
    event: ReactPointerEvent<SVGGElement>,
  ) => {
    const component = components.get(componentId)
    const sourcePoint = component && getPortPosition(component, portId)
    if (!component || !sourcePoint) return
    const nextWireDrag: WireDragState = {
      source: { componentId, portId },
      pointerId: event.pointerId,
      clientStart: { x: event.clientX, y: event.clientY },
      current: sourcePoint,
      moved: false,
    }
    wireDragRef.current = nextWireDrag
    setWireDrag(nextWireDrag)
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  const startWireMouseDrag = (
    componentId: string,
    portId: string,
    event: ReactMouseEvent<SVGGElement>,
  ) => {
    if (wireDragRef.current) return
    const component = components.get(componentId)
    const sourcePoint = component && getPortPosition(component, portId)
    if (!component || !sourcePoint) return
    const nextWireDrag: WireDragState = {
      source: { componentId, portId },
      pointerId: -1,
      clientStart: { x: event.clientX, y: event.clientY },
      current: sourcePoint,
      moved: false,
    }
    wireDragRef.current = nextWireDrag
    setWireDrag(nextWireDrag)
  }

  const updateWireDrag = (activeWireDrag: WireDragState, clientX: number, clientY: number) => {
    const point = canvasPoint(clientX, clientY)
    if (!point) return
    const target = nearestPort(point, activeWireDrag.source)
    const moved = activeWireDrag.moved || Math.hypot(
      clientX - activeWireDrag.clientStart.x,
      clientY - activeWireDrag.clientStart.y,
    ) > 4
    const nextWireDrag = {
      ...activeWireDrag,
      current: target?.point ?? point,
      target: target?.ref,
      targetPoint: target?.point,
      moved,
    }
    wireDragRef.current = nextWireDrag
    setWireDrag(nextWireDrag)
  }

  const finishWireDrag = (activeWireDrag: WireDragState) => {
    if (activeWireDrag.moved && activeWireDrag.target) {
      onCreateConnection(activeWireDrag.source, activeWireDrag.target)
    } else if (!activeWireDrag.moved && tool === 'wire') {
      onPortClick(activeWireDrag.source.componentId, activeWireDrag.source.portId)
    }
    wireDragRef.current = undefined
    setWireDrag(undefined)
  }

  const startPan = (event: ReactPointerEvent<SVGElement>, deselectOnClick: boolean) => {
    if (event.button !== 0 && event.button !== 1) return
    const start = viewportPoint(event.clientX, event.clientY)
    if (!start || !svgRef.current) return
    event.preventDefault()
    svgRef.current.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      clientStart: { x: event.clientX, y: event.clientY },
      viewportStart: start,
      cameraStart: camera,
      moved: false,
      deselectOnClick,
    }
    setIsPanning(true)
  }

  const handlePointerDownCapture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch') {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touchPointersRef.current.size === 2) {
        const pointerIds = [...touchPointersRef.current.keys()] as [number, number]
        const firstClient = touchPointersRef.current.get(pointerIds[0])
        const secondClient = touchPointersRef.current.get(pointerIds[1])
        const first = firstClient && viewportPoint(firstClient.x, firstClient.y)
        const second = secondClient && viewportPoint(secondClient.x, secondClient.y)
        if (!first || !second || !svgRef.current) return
        const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
        pinchRef.current = {
          pointerIds,
          startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
          startCamera: camera,
          anchorWorld: viewportToWorld(camera, midpoint),
        }
        panRef.current = undefined
        dragRef.current = undefined
        wireDragRef.current = undefined
        setWireDrag(undefined)
        setIsPanning(true)
        for (const pointerId of pointerIds) svgRef.current.setPointerCapture(pointerId)
        event.preventDefault()
        event.stopPropagation()
        return
      }
    }

    if (event.button === 1) {
      event.stopPropagation()
      startPan(event, false)
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'touch' && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    const activePinch = pinchRef.current
    if (activePinch?.pointerIds.includes(event.pointerId)) {
      const firstClient = touchPointersRef.current.get(activePinch.pointerIds[0])
      const secondClient = touchPointersRef.current.get(activePinch.pointerIds[1])
      const first = firstClient && viewportPoint(firstClient.x, firstClient.y)
      const second = secondClient && viewportPoint(secondClient.x, secondClient.y)
      if (!first || !second) return
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
      const zoom = zoomCameraAround(
        activePinch.startCamera,
        activePinch.startCamera.zoom * distance / activePinch.startDistance,
        {
          x: activePinch.startCamera.x + activePinch.anchorWorld.x * activePinch.startCamera.zoom,
          y: activePinch.startCamera.y + activePinch.anchorWorld.y * activePinch.startCamera.zoom,
        },
      ).zoom
      setCamera({
        x: midpoint.x - activePinch.anchorWorld.x * zoom,
        y: midpoint.y - activePinch.anchorWorld.y * zoom,
        zoom,
      })
      return
    }

    const activePan = panRef.current
    if (activePan?.pointerId === event.pointerId) {
      const current = viewportPoint(event.clientX, event.clientY)
      if (!current) return
      const moved = activePan.moved || Math.hypot(
        event.clientX - activePan.clientStart.x,
        event.clientY - activePan.clientStart.y,
      ) > 4
      panRef.current = { ...activePan, moved }
      setCamera({
        ...activePan.cameraStart,
        x: activePan.cameraStart.x + current.x - activePan.viewportStart.x,
        y: activePan.cameraStart.y + current.y - activePan.viewportStart.y,
      })
      return
    }

    const activeWireDrag = wireDragRef.current
    if (activeWireDrag?.pointerId === event.pointerId) {
      updateWireDrag(activeWireDrag, event.clientX, event.clientY)
      return
    }

    const activeDrag = dragRef.current
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
    const current = canvasPoint(event.clientX, event.clientY)
    if (!current) return
    const moved = activeDrag.moved || Math.hypot(
      event.clientX - activeDrag.clientStart.x,
      event.clientY - activeDrag.clientStart.y,
    ) > 4
    if (moved && !activeDrag.moved) onMoveStart()
    dragRef.current = { ...activeDrag, moved }
    if (!moved) return
    onMove(activeDrag.componentId, {
      x: Math.round(activeDrag.positionStart.x + current.x - activeDrag.worldStart.x),
      y: Math.round(activeDrag.positionStart.y + current.y - activeDrag.worldStart.y),
    })
  }

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    touchPointersRef.current.delete(event.pointerId)
    const activePinch = pinchRef.current
    if (activePinch?.pointerIds.includes(event.pointerId)) {
      pinchRef.current = undefined
      setIsPanning(false)
      return
    }

    const activePan = panRef.current
    if (activePan?.pointerId === event.pointerId) {
      if (!activePan.moved && activePan.deselectOnClick) onSelect(undefined)
      panRef.current = undefined
      setIsPanning(false)
      return
    }

    const activeWireDrag = wireDragRef.current
    if (activeWireDrag?.pointerId === event.pointerId) {
      finishWireDrag(activeWireDrag)
      return
    }
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined
  }

  const handlePointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    touchPointersRef.current.delete(event.pointerId)
    if (pinchRef.current?.pointerIds.includes(event.pointerId)) pinchRef.current = undefined
    if (panRef.current?.pointerId === event.pointerId) panRef.current = undefined
    if (wireDragRef.current?.pointerId === event.pointerId) {
      wireDragRef.current = undefined
      setWireDrag(undefined)
    }
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined
    setIsPanning(false)
  }

  const handleMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const activeWireDrag = wireDragRef.current
    if (activeWireDrag?.pointerId !== -1) return
    updateWireDrag(activeWireDrag, event.clientX, event.clientY)
  }

  const handleMouseUp = () => {
    const activeWireDrag = wireDragRef.current
    if (activeWireDrag?.pointerId === -1) finishWireDrag(activeWireDrag)
  }

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width) return
    event.preventDefault()
    const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
    if (event.ctrlKey || event.metaKey) {
      const focalPoint = viewportPoint(event.clientX, event.clientY) ?? {
        x: viewport.width / 2,
        y: viewport.height / 2,
      }
      const factor = Math.exp(-event.deltaY * deltaUnit * 0.002)
      setCamera((current) => zoomCameraAround(current, current.zoom * factor, focalPoint))
      return
    }

    const scale = viewport.width / rect.width
    const horizontalDelta = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX
    const verticalDelta = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY
    setCamera((current) => ({
      ...current,
      x: current.x - horizontalDelta * deltaUnit * scale,
      y: current.y - verticalDelta * deltaUnit * scale,
    }))
  }

  const zoomAtCenter = (factor: number) => {
    setCamera((current) => zoomCameraAround(
      current,
      current.zoom * factor,
      { x: viewport.width / 2, y: viewport.height / 2 },
    ))
  }

  const fitView = () => {
    if (!circuitBounds) {
      setCamera({ x: 0, y: 0, zoom: 1 })
      return
    }
    setCamera(fitCameraToBounds(circuitBounds, viewport))
  }

  const zoomLabel = camera.zoom < 0.1
    ? `${(camera.zoom * 100).toFixed(1)}%`
    : `${Math.round(camera.zoom * 100)}%`
  const visibleWorld = {
    x: -camera.x / camera.zoom,
    y: -camera.y / camera.zoom,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
  }
  const gridOverscan = Math.max(visibleWorld.width, visibleWorld.height)

  return (
    <section className="canvas-shell" aria-label="Schematic editor">
      <div className="canvas-meta">
        <div className="canvas-title-group">
          <span className={`live-dot ${running ? 'is-running' : ''}`} />
          <span className="canvas-kicker">VOICE_01</span>
          <span className="canvas-divider" />
          <span>{document.components.length} parts</span>
          <span>{document.connections.length} nets</span>
        </div>
        <div className="canvas-meta-actions">
          <div className="canvas-legend" aria-label="Signal legend">
            <span><i className="legend-line audio" />Audio</span>
            <span><i className="legend-line cv" />CV</span>
            <span><i className="legend-line gate" />Gate</span>
          </div>
          <button
            className={`diagnostics-pill ${diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'has-errors' : diagnostics.length ? 'has-warnings' : 'is-clear'}`}
            onClick={() => setDiagnosticsOpen((open) => !open)}
            aria-expanded={diagnosticsOpen}
          >
            <Icon name={diagnostics.length ? 'warning' : 'info'} size={12} />
            {diagnostics.length ? `${diagnostics.length} CHECKS` : 'CHECKS CLEAR'}
          </button>
        </div>
      </div>

      {diagnosticsOpen && (
        <div className="diagnostics-popover">
          <div className="diagnostics-heading">
            <div><span className="eyebrow">DESIGN CHECK</span><strong>{diagnostics.length ? 'Needs attention' : 'All clear'}</strong></div>
            <button onClick={() => setDiagnosticsOpen(false)} aria-label="Close diagnostics"><Icon name="close" size={13} /></button>
          </div>
          {diagnostics.length ? diagnostics.map((diagnostic) => (
            <button
              key={diagnostic.id}
              className={`diagnostic-row severity-${diagnostic.severity}`}
              onClick={() => {
                const componentId = diagnostic.componentIds[0]
                if (componentId) onSelect(componentId)
                setDiagnosticsOpen(false)
              }}
            >
              <span className="diagnostic-symbol"><Icon name={diagnostic.severity === 'error' ? 'warning' : 'info'} size={14} /></span>
              <span><strong>{diagnostic.title}</strong><small>{diagnostic.detail}</small></span>
              {diagnostic.componentIds.length > 0 && <Icon name="chevron" size={13} />}
            </button>
          )) : (
            <div className="diagnostics-clear"><span>✓</span><p>No blocking electrical or interchange issues detected.</p></div>
          )}
        </div>
      )}

      <div className="canvas-tools" role="toolbar" aria-label="Editor tools">
        <button className={tool === 'select' ? 'is-active' : ''} onClick={() => onToolChange('select')} title="Select and move (V)">
          <Icon name="cursor" size={17} />
          <span>Select</span>
          <kbd>V</kbd>
        </button>
        <button className={tool === 'wire' ? 'is-active' : ''} onClick={() => onToolChange('wire')} title="Connect pins (W)">
          <Icon name="wire" size={17} />
          <span>Wire</span>
          <kbd>W</kbd>
        </button>
        <button className={tool === 'probe' ? 'is-active' : ''} onClick={() => onToolChange('probe')} title="Probe a net (P)">
          <Icon name="probe" size={17} />
          <span>Probe</span>
          <kbd>P</kbd>
        </button>
      </div>

      {tool === 'wire' && (
        <div className="tool-hint">
          <Icon name="wire" size={15} />
          {pendingPort ? 'Choose a destination pin' : 'Choose a source pin'}
          <button onClick={() => onToolChange('select')} aria-label="Exit wire mode"><Icon name="close" size={13} /></button>
        </div>
      )}

      {tool === 'probe' && (
        <div className="tool-hint probe-hint">
          <Icon name="probe" size={15} />
          Click a net to assign the next scope channel
          <button onClick={() => onToolChange('select')} aria-label="Exit probe mode"><Icon name="close" size={13} /></button>
        </div>
      )}

      <svg
        ref={svgRef}
        className={`schematic-canvas tool-${tool} ${isPanning ? 'is-panning' : ''}`}
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="xMinYMin meet"
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          <pattern id="minor-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="#24282a" strokeWidth="0.55" />
          </pattern>
          <pattern id="major-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <rect width="50" height="50" fill="url(#minor-grid)" />
            <path d="M50 0H0V50" fill="none" stroke="#303537" strokeWidth="0.8" />
          </pattern>
          <filter id="wire-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g ref={worldRef} transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          <rect
            className="canvas-background"
            x={visibleWorld.x - gridOverscan}
            y={visibleWorld.y - gridOverscan}
            width={visibleWorld.width + gridOverscan * 2}
            height={visibleWorld.height + gridOverscan * 2}
            fill="url(#major-grid)"
            onPointerDown={(event) => {
              event.stopPropagation()
              startPan(event, true)
            }}
            onDoubleClick={fitView}
          />

          <g className="wires-layer">
          {document.connections.map((connection) => {
            const fromComponent = components.get(connection.from.componentId)
            const toComponent = components.get(connection.to.componentId)
            if (!fromComponent || !toComponent) return null
            const from = getPortPosition(fromComponent, connection.from.portId)
            const to = getPortPosition(toComponent, connection.to.portId)
            if (!from || !to) return null
            const path = connectionPath(from, to)
            const probeMarker = probeMarkers.find((marker) => marker.connectionId === connection.id)
            const markerPosition = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
            return (
              <g
                key={connection.id}
                className={`wire signal-${connection.signal} ${running ? 'is-running' : ''} ${probeMarker ? 'is-probed' : ''}`}
                data-connection-id={connection.id}
              >
                <path className="wire-halo" d={path} stroke={signalColors[connection.signal]} />
                <path className="wire-line" d={path} stroke={signalColors[connection.signal]} />
                {running && connection.signal !== 'power' && (
                  <path className="wire-flow" d={path} stroke={signalColors[connection.signal]} />
                )}
                <path
                  className="wire-hit"
                  d={path}
                  onPointerDown={(event) => {
                    if (tool !== 'probe') return
                    event.stopPropagation()
                    onProbeConnection(connection.id)
                  }}
                />
                {probeMarker && (
                  <g
                    className="probe-marker"
                    transform={`translate(${markerPosition.x} ${markerPosition.y})`}
                    style={{ '--probe-color': probeMarker.color } as React.CSSProperties}
                  >
                    <circle r="10" />
                    <text y="3" textAnchor="middle">{probeMarker.channel}</text>
                  </g>
                )}
              </g>
            )
          })}
          {wireDrag && (() => {
            const sourceComponent = components.get(wireDrag.source.componentId)
            if (!sourceComponent) return null
            const source = getPortPosition(sourceComponent, wireDrag.source.portId)
            if (!source) return null
            const sourcePort = catalogByKind[sourceComponent.kind].ports.find((port) => port.id === wireDrag.source.portId)
            const color = sourcePort ? signalColors[sourcePort.signal] : '#c3c6c7'
            return (
              <g className={`wire-preview ${wireDrag.target ? 'has-target' : ''}`}>
                <path d={connectionPath(source, wireDrag.current)} stroke={color} />
                <circle cx={wireDrag.current.x} cy={wireDrag.current.y} r={wireDrag.target ? 7 : 4} stroke={color} />
              </g>
            )
          })()}
          </g>

          <g className="components-layer">
          {document.components.map((component) => (
            <ComponentSymbol
              key={component.id}
              component={component}
              selected={selectedId === component.id}
              tool={tool}
              pendingPort={pendingPort}
              onSelect={onSelect}
              onDragStart={startDrag}
              onPortPointerDown={startWireDrag}
              onPortMouseDown={startWireMouseDrag}
            />
          ))}
          </g>
        </g>
      </svg>

      <div className="canvas-navigation-hint" aria-hidden="true">
        DRAG EMPTY · SCROLL TO PAN · PINCH OR CTRL/⌘ SCROLL TO ZOOM
      </div>
      <div className="canvas-zoom">
        <button aria-label="Zoom out" onClick={() => zoomAtCenter(1 / 1.3)}>−</button>
        <button className="zoom-readout" aria-label="Fit circuit to viewport" title="Fit circuit to viewport" onClick={fitView}>{zoomLabel}</button>
        <button aria-label="Zoom in" onClick={() => zoomAtCenter(1.3)}>+</button>
      </div>
    </section>
  )
}
