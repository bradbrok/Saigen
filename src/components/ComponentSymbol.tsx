import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { catalogByKind } from '../circuit/catalog'
import type { CircuitComponent, ComponentPort, Point } from '../circuit/types'

export type EditorTool = 'select' | 'wire' | 'probe'

interface ComponentSymbolProps {
  component: CircuitComponent
  selected: boolean
  tool: EditorTool
  pendingPort?: { componentId: string; portId: string }
  onSelect: (componentId: string) => void
  onDragStart: (componentId: string, event: ReactPointerEvent<SVGGElement>) => void
  onPortPointerDown?: (componentId: string, portId: string, event: ReactPointerEvent<SVGGElement>) => void
  onPortMouseDown?: (componentId: string, portId: string, event: ReactMouseEvent<SVGGElement>) => void
  onPortClick?: (componentId: string, portId: string) => void
}

export function getPortPosition(
  component: CircuitComponent,
  portId: string,
  outside = true,
): Point | undefined {
  const catalog = catalogByKind[component.kind]
  const port = catalog.ports.find((candidate) => candidate.id === portId)
  if (!port) return undefined
  const extension = outside ? 10 : 0
  const { x, y } = component.position
  const { width, height } = catalog.size

  switch (port.side) {
    case 'left':
      return { x: x - extension, y: y + port.offset }
    case 'right':
      return { x: x + width + extension, y: y + port.offset }
    case 'top':
      return { x: x + port.offset, y: y - extension }
    case 'bottom':
      return { x: x + port.offset, y: y + height + extension }
  }
}

function ComponentBody({ component }: { component: CircuitComponent }): ReactNode {
  const catalog = catalogByKind[component.kind]
  const { width, height } = catalog.size
  const color = catalog.color

  if (component.kind.startsWith('ssi')) {
    const waveform = component.kind === 'ssi2131'
      ? `M22 ${height - 31} l10 -11 10 22 10 -22 10 22 10 -11`
      : component.kind === 'ssi2144'
        ? `M22 ${height - 21} C34 ${height - 45}, 55 ${height - 5}, 77 ${height - 28} S112 ${height - 26}, 126 ${height - 36}`
        : `M25 ${height - 30} h18 l7 -10 7 20 7 -20 7 20 h25`

    return (
      <>
        <rect className="symbol-shadow" x="1" y="3" width={width} height={height} rx="10" />
        <rect className="ic-body" width={width} height={height} rx="10" />
        <path className="ic-notch" d={`M${width / 2 - 12} 0a12 12 0 0 0 24 0`} />
        <rect width={width} height="4" rx="2" fill={color} />
        <text className="symbol-reference" x="16" y="25">{component.reference}</text>
        <text className="ic-model" x="16" y="54" fill={color}>{catalog.shortName}</text>
        <text className="ic-function" x="16" y="75">{component.label}</text>
        <path className="ic-waveform" d={waveform} stroke={color} />
        <text className="model-chip" x={width - 15} y={height - 13} textAnchor="end">BEHAVIORAL</text>
      </>
    )
  }

  if (component.kind === 'resistor') {
    return (
      <>
        <path className="passive-line" d={`M0 27h20l7-12 12 24 12-24 12 24 12-24 10 12h27`} />
        <text className="passive-ref" x={width / 2} y="8" textAnchor="middle">{component.reference}</text>
        <text className="passive-value" x={width / 2} y="50" textAnchor="middle">{component.value}</text>
      </>
    )
  }

  if (component.kind === 'capacitor') {
    return (
      <>
        <path className="passive-line" d={`M39 0v29M18 29h42M18 39h42M39 39v43`} />
        <text className="passive-ref" x="4" y="25">{component.reference}</text>
        <text className="passive-value" x="4" y="58">{component.value}</text>
      </>
    )
  }

  if (component.kind === 'inductor') {
    return (
      <>
        <path className="passive-line" d="M0 27h18c0-14 18-14 18 0s18-14 18 0 18-14 18 0 18-14 18 0h22" />
        <text className="passive-ref" x={width / 2} y="8" textAnchor="middle">{component.reference}</text>
        <text className="passive-value" x={width / 2} y="50" textAnchor="middle">{component.value}</text>
      </>
    )
  }

  if (component.kind === 'diode' || component.kind === 'led' || component.kind === 'zenerDiode') {
    const centerY = component.kind === 'led' ? 38 : 27
    const cathode = component.kind === 'zenerDiode'
      ? `M60 ${centerY - 16}l-6 5M60 ${centerY - 16}v32m0 0 6-5`
      : `M60 ${centerY - 16}v32`
    return (
      <>
        <path className="passive-line" d={`M0 ${centerY}h27M27 ${centerY - 16}v32l33-16ZM60 ${centerY}h${width - 60}`} />
        <path className="passive-line" d={cathode} />
        {component.kind === 'led' && (
          <path className="passive-line accent" d="M52 12l12-8m-5 13 12-8m-8-6 2 7-7-2m13 0 2 7-7-2" />
        )}
        <text className="passive-ref" x="8" y="11">{component.reference}</text>
        <text className="passive-value" x={width - 5} y={height - 5} textAnchor="end">{component.value}</text>
      </>
    )
  }

  if (component.kind === 'potentiometer') {
    return (
      <>
        <path className="passive-line" d="M0 35h18l7-11 11 22 11-22 11 22 11-22 11 11h32" />
        <path className="passive-line accent" d="M56 72V48l10-10" />
        <text className="passive-ref" x={width / 2} y="12" textAnchor="middle">{component.reference}</text>
        <text className="passive-value" x={width - 4} y="66" textAnchor="end">{component.value}</text>
      </>
    )
  }

  if (component.kind === 'switch') {
    return (
      <>
        <path className="passive-line" d="M0 38h27m58 0h27M34 35l44-23" />
        <circle className="utility-body" cx="30" cy="38" r="4" />
        <circle className="utility-body" cx="82" cy="38" r="4" />
        <text className="passive-ref" x={width / 2} y="9" textAnchor="middle">{component.reference}</text>
        <text className="passive-value" x={width / 2} y="59" textAnchor="middle">{component.value}</text>
      </>
    )
  }

  if (component.kind === 'npnBjt' || component.kind === 'pnpBjt') {
    const isNpn = component.kind === 'npnBjt'
    return (
      <>
        <circle className="utility-body" cx="66" cy="50" r="34" />
        <path className="passive-line" d={`M0 50h44m0-22v44m0-34 32-38m-32 62 32 38`} />
        <path
          className="passive-line accent"
          d={isNpn ? 'M62 75l14 25-25-12m25 12-3-27' : 'M58 18l18-18-6 24M76 0 49 13'}
        />
        <text className="passive-ref" x="8" y="15">{component.reference}</text>
        <text className="passive-value" x="101" y="53" textAnchor="end">{isNpn ? 'NPN' : 'PNP'}</text>
        <text className="passive-value" x="101" y="67" textAnchor="end">{component.value}</text>
      </>
    )
  }

  if (component.kind === 'nMosfet' || component.kind === 'pMosfet') {
    const isNmos = component.kind === 'nMosfet'
    return (
      <>
        <circle className="utility-body" cx="67" cy="50" r="34" />
        <path className="passive-line" d="M0 50h39m5-22v44m10-35v26m0-13h22m0-50v37m0 26v37" />
        <path className="passive-line" d="M54 37h22M54 63h22" />
        {isNmos ? (
          <path className="passive-line accent" d="m73 50-14-7v14Zm3 13 8 8m-8-8 10-1" />
        ) : (
          <>
            <circle className="utility-body" cx="45" cy="50" r="5" />
            <path className="passive-line accent" d="m59 50 14-7v14Zm17-13 8-8m-8 8 10 1" />
          </>
        )}
        <text className="passive-ref" x="8" y="15">{component.reference}</text>
        <text className="passive-value" x="106" y="53" textAnchor="end">{isNmos ? 'NMOS' : 'PMOS'}</text>
        <text className="passive-value" x="106" y="67" textAnchor="end">{component.value}</text>
      </>
    )
  }

  if (component.kind === 'opAmp') {
    return (
      <>
        <path className="utility-body" d={`M10 4v84l100-42Z`} />
        <text className="op-sign" x="19" y="33">+</text>
        <text className="op-sign" x="19" y="69">−</text>
        <text className="symbol-reference" x="54" y="43">{component.reference}</text>
        <text className="utility-label" x="54" y="59">IDEAL OP</text>
      </>
    )
  }

  if (component.kind === 'comparator') {
    return (
      <>
        <path className="utility-body" d="M10 4v84l100-42Z" />
        <text className="op-sign" x="19" y="33">−</text>
        <text className="op-sign" x="19" y="69">+</text>
        <path className="ic-waveform" d="M48 56h12V36h12v20h12" stroke={color} />
        <text className="symbol-reference" x="48" y="25">{component.reference}</text>
        <text className="utility-label" x="53" y="73">COMP</text>
      </>
    )
  }

  if (component.kind === 'plus12V' || component.kind === 'minus12V') {
    const isPositive = component.kind === 'plus12V'
    return (
      <>
        <path
          className="passive-line"
          d={isPositive ? 'M36 54V22m0 0L23 36m13-14 13 14' : 'M36 54V24m-18 0h36m-27-9h18'}
          style={{ stroke: color }}
        />
        <text className="passive-value" x="36" y="9" textAnchor="middle">{isPositive ? '+12V' : '−12V'}</text>
        <text className="symbol-reference" x="36" y="49" textAnchor="middle">{component.reference}</text>
      </>
    )
  }

  if (component.kind === 'ground') {
    return (
      <>
        <path className="ground-symbol" d="M36 0v23M10 23h52M18 33h36M26 43h20M33 53h6" />
        <text className="utility-label" x="36" y="61" textAnchor="middle">0V</text>
      </>
    )
  }

  if (component.kind === 'envelope') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="8" />
        <text className="symbol-reference" x="13" y="22">{component.reference}</text>
        <path className="envelope-line" d={`M15 ${height - 17} L35 33 L55 49 L91 49 L111 ${height - 17}`} />
        <text className="utility-label" x={width - 12} y="21" textAnchor="end">ADSR</text>
      </>
    )
  }

  if (component.kind === 'functionGenerator') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="9" />
        <rect x="0" y="0" width="4" height={height} rx="2" fill={color} />
        <text className="symbol-reference" x="14" y="19">{component.reference}</text>
        <text className="utility-label" x={width - 12} y="19" textAnchor="end">FUNCTION</text>
        <path className="ic-waveform" d="M15 42c7-12 14-12 21 0s14 12 21 0" stroke={color} />
        <path className="ic-waveform" d="m15 65 10-10 10 20 10-20 10 10" stroke={color} />
        <path className="ic-waveform" d="m15 92 38-18v18" stroke={color} />
        <path className="ic-waveform" d="M75 42v-10h16v20h16V32h16v10" stroke={color} />
        <text className="ic-model" x="75" y="89" fill={color}>Hz</text>
        <text className="model-chip" x={width - 12} y={height - 9} textAnchor="end">SINE · TRI · SAW · PULSE</text>
      </>
    )
  }

  if (component.kind === 'triggerSource') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="9" />
        <text className="symbol-reference" x="12" y="19">{component.reference}</text>
        <text className="utility-label" x={width - 11} y="19" textAnchor="end">TRIGGER</text>
        <circle className="utility-body" cx="36" cy="49" r="19" />
        <circle cx="36" cy="49" r="8" fill={color} opacity="0.7" />
        <path className="ic-waveform" d="M64 59V38h14v21h14V38h14" stroke={color} />
        <text className="model-chip" x={width - 11} y={height - 8} textAnchor="end">PULSE OUT</text>
      </>
    )
  }

  if (component.kind === 'lfo') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="9" />
        <rect x="0" y="0" width="4" height={height} rx="2" fill={color} />
        <text className="symbol-reference" x="14" y="20">{component.reference}</text>
        <text className="ic-model" x="14" y="48" fill={color}>LFO</text>
        <path className="ic-waveform" d="M17 73c8-18 16-18 24 0s16 18 24 0 16-18 24 0 16 18 24 0" stroke={color} />
        <path className="ic-waveform" d="m18 93 12-10 12 20 12-20 12 20 12-10" stroke={color} />
        <text className="model-chip" x={width - 10} y={height - 9} textAnchor="end">MODULATION</text>
      </>
    )
  }

  if (component.kind === 'noiseSource') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="9" />
        <text className="symbol-reference" x="13" y="19">{component.reference}</text>
        <text className="utility-label" x={width - 12} y="19" textAnchor="end">NOISE</text>
        <path
          className="ic-waveform"
          d="M14 51l7-17 8 31 8-24 8 16 8-30 8 41 8-26 8 14 8-23 8 30 11-16"
          stroke={color}
        />
        <text className="model-chip" x="13" y={height - 8}>WHITE / PINK</text>
      </>
    )
  }

  if (component.kind === 'clock') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="9" />
        <text className="symbol-reference" x="13" y="19">{component.reference}</text>
        <text className="utility-label" x={width - 12} y="19" textAnchor="end">CLOCK</text>
        <circle className="utility-body" cx="48" cy="51" r="24" />
        <path className="ic-waveform" d="M48 51V34m0 17 14 8" stroke={color} />
        <path className="ic-waveform" d="M79 70v-16h10v16h10V54h9" stroke={color} />
        <text className="model-chip" x="13" y={height - 8}>120 BPM</text>
      </>
    )
  }

  if (component.kind === 'mixer') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="9" />
        <rect x="0" y="0" width="4" height={height} rx="2" fill={color} />
        <text className="symbol-reference" x="14" y="18">{component.reference}</text>
        <text className="utility-label" x={width - 12} y="18" textAnchor="end">4 CH MIX</text>
        {[25, 52, 79, 106].map((y, index) => (
          <g key={y}>
            <path className="ic-waveform" d={`M20 ${y}h52l18 ${66 - y}`} stroke={color} />
            <circle className="utility-body" cx="48" cy={y} r="7" />
            <text className="model-chip" x="48" y={y + 2} textAnchor="middle">{index + 1}</text>
          </g>
        ))}
        <circle className="utility-body" cx="101" cy="66" r="17" />
        <text className="op-sign" x="101" y="72" textAnchor="middle">+</text>
        <path className="ic-waveform" d={`M118 66h${width - 118}`} stroke={color} />
        <text className="model-chip" x={width - 11} y={height - 9} textAnchor="end">SUM</text>
      </>
    )
  }

  if (component.kind === 'attenuverter') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="9" />
        <text className="symbol-reference" x="12" y="18">{component.reference}</text>
        <text className="utility-label" x={width - 12} y="18" textAnchor="end">ATT±</text>
        <path className="ic-waveform" d={`M0 42h32m68 0h${width - 100}`} stroke={color} />
        <circle className="utility-body" cx="66" cy="44" r="27" />
        <path className="ic-waveform" d="M66 44 49 28" stroke={color} />
        <circle cx="66" cy="44" r="3" fill={color} />
        <text className="op-sign" x="36" y="48">−</text>
        <text className="op-sign" x="89" y="48">+</text>
        <text className="model-chip" x="66" y="78" textAnchor="middle">BIPOLAR</text>
      </>
    )
  }

  if (component.kind === 'audioInput' || component.kind === 'cvInput' || component.kind === 'gateInput' || component.kind === 'audioOutput') {
    const isOutput = component.kind === 'audioOutput'
    return (
      <>
        <rect className="io-panel" width={width} height={height} rx="8" />
        <circle className="jack-outer" cx={isOutput ? width - 31 : 31} cy="31" r="16" />
        <circle className="jack-inner" cx={isOutput ? width - 31 : 31} cy="31" r="5" fill={color} />
        <text className="symbol-reference" x={isOutput ? 10 : width - 10} y="18" textAnchor={isOutput ? 'start' : 'end'}>{component.reference}</text>
        <text className="io-label" x={isOutput ? 10 : width - 10} y="48" textAnchor={isOutput ? 'start' : 'end'}>{component.label}</text>
      </>
    )
  }

  if (component.kind === 'probe') {
    return (
      <>
        <rect className="utility-panel" width={width} height={height} rx="29" />
        <path className="probe-glyph" d="m19 39 20-20 9 9-20 20Z" />
        <text className="utility-label" x="58" y="34">{component.reference}</text>
      </>
    )
  }

  return (
    <>
      <rect className="unknown-body" width={width} height={height} rx="8" />
      <text className="unknown-mark" x={width / 2} y={height / 2 - 2} textAnchor="middle">?</text>
      <text className="utility-label" x={width / 2} y={height - 15} textAnchor="middle">{component.reference}</text>
    </>
  )
}

function PortGraphic({
  port,
  width,
  height,
  active,
  onClick,
  onMouseDown,
}: {
  port: ComponentPort
  width: number
  height: number
  active: boolean
  onClick: (event: ReactPointerEvent<SVGGElement>) => void
  onMouseDown?: (event: ReactMouseEvent<SVGGElement>) => void
}) {
  const signalClass = `signal-${port.signal}`
  const pinNumber = port.pinNumber ?? port.id
  let x1 = 0
  let y1 = 0
  let x2 = 0
  let y2 = 0
  let labelX = 0
  let labelY = 0
  let anchor: 'start' | 'middle' | 'end' = 'start'

  if (port.side === 'left') {
    x1 = -10; x2 = 0; y1 = y2 = port.offset
    labelX = 6; labelY = port.offset + 3; anchor = 'start'
  } else if (port.side === 'right') {
    x1 = width; x2 = width + 10; y1 = y2 = port.offset
    labelX = width - 6; labelY = port.offset + 3; anchor = 'end'
  } else if (port.side === 'top') {
    x1 = x2 = port.offset; y1 = -10; y2 = 0
    labelX = port.offset; labelY = 14; anchor = 'middle'
  } else {
    x1 = x2 = port.offset; y1 = height; y2 = height + 10
    labelX = port.offset; labelY = height - 7; anchor = 'middle'
  }

  return (
    <g
      className={`component-port ${signalClass} ${active ? 'is-pending' : ''} ${port.defaultNet ? 'has-default-net' : ''}`}
      data-port-id={port.id}
      onPointerDown={onClick}
      onMouseDown={onMouseDown}
    >
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <circle cx={x1} cy={y1} r="0.01" className="port-hit-target" />
      {port.defaultNet && <circle cx={x1} cy={y1} r="5.5" className="default-net-ring" />}
      <circle cx={x1} cy={y1} r={active ? 4 : 2.6} className="port-node" />
      <text className="port-label" x={labelX} y={labelY} textAnchor={anchor}>{port.label}</text>
      <title>{`Pin ${pinNumber} · ${port.label}${port.defaultNet ? ` · defaults to ${port.defaultNet}` : ''}`}</title>
    </g>
  )
}

export function ComponentSymbol({
  component,
  selected,
  tool,
  pendingPort,
  onSelect,
  onDragStart,
  onPortPointerDown,
  onPortMouseDown,
  onPortClick,
}: ComponentSymbolProps) {
  const catalog = catalogByKind[component.kind]
  const { width, height } = catalog.size

  const handlePointerDown = (event: ReactPointerEvent<SVGGElement>) => {
    event.stopPropagation()
    onSelect(component.id)
    if (tool === 'select') onDragStart(component.id, event)
  }

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(component.id)
    }
  }

  return (
    <g
      className={`schematic-component ${selected ? 'is-selected' : ''}`}
      transform={`translate(${component.position.x} ${component.position.y})`}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${component.reference} ${catalog.name}`}
      data-component-id={component.id}
    >
      <rect className="component-hitbox" x="-14" y="-14" width={width + 28} height={height + 28} rx="12" />
      {selected && <rect className="selection-frame" x="-7" y="-7" width={width + 14} height={height + 14} rx="11" />}
      <ComponentBody component={component} />
      {catalog.ports.map((port) => (
        <PortGraphic
          key={port.id}
          port={port}
          width={width}
          height={height}
          active={pendingPort?.componentId === component.id && pendingPort.portId === port.id}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(component.id)
            if (onPortPointerDown) onPortPointerDown(component.id, port.id, event)
            else if (tool === 'wire') onPortClick?.(component.id, port.id)
          }}
          onMouseDown={(event) => {
            event.stopPropagation()
            onSelect(component.id)
            onPortMouseDown?.(component.id, port.id, event)
          }}
        />
      ))}
    </g>
  )
}
