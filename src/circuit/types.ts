export type ComponentKind =
  | 'audioInput'
  | 'cvInput'
  | 'gateInput'
  | 'triggerSource'
  | 'functionGenerator'
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'zenerDiode'
  | 'potentiometer'
  | 'switch'
  | 'npnBjt'
  | 'pnpBjt'
  | 'nMosfet'
  | 'pMosfet'
  | 'opAmp'
  | 'comparator'
  | 'ssi2131'
  | 'ssi2144'
  | 'ssi2164'
  | 'envelope'
  | 'lfo'
  | 'noiseSource'
  | 'clock'
  | 'mixer'
  | 'attenuverter'
  | 'audioOutput'
  | 'plus12V'
  | 'minus12V'
  | 'ground'
  | 'probe'
  | 'unknown'

export type ComponentCategory = 'sources' | 'passives' | 'ssi' | 'utility'
export type PortSide = 'left' | 'right' | 'top' | 'bottom'
export type SignalType = 'audio' | 'cv' | 'gate' | 'power' | 'passive'
export type PortDirection = 'input' | 'output' | 'passive' | 'powerInput' | 'powerOutput'
export type DefaultNet = 'GND' | '+12V' | '-12V'

export interface Point {
  x: number
  y: number
}

export interface ComponentPort {
  id: string
  label: string
  side: PortSide
  offset: number
  signal: SignalType
  direction: PortDirection
  pinNumber?: string
  /** Implicit connection used only when this pin has no explicit wire. */
  defaultNet?: DefaultNet
}

export interface CatalogComponent {
  kind: ComponentKind
  category: ComponentCategory
  name: string
  shortName: string
  description: string
  modelStage: 'electrical' | 'behavioral' | 'visual'
  color: string
  size: { width: number; height: number }
  ports: ComponentPort[]
  defaultValue?: string
  defaultParameters?: Record<string, number>
  kicadLibraryId?: string
}

export interface CircuitComponent {
  id: string
  kind: ComponentKind
  reference: string
  label: string
  position: Point
  value?: string
  parameters: Record<string, number>
}

export interface PortRef {
  componentId: string
  portId: string
}

export interface CircuitConnection {
  id: string
  from: PortRef
  to: PortRef
  signal: SignalType
}

export interface CircuitDocument {
  schemaVersion: 1
  id: string
  title: string
  description: string
  revision: number
  components: CircuitComponent[]
  connections: CircuitConnection[]
}

export interface SimulationControls {
  running: boolean
  monitor: boolean
  note: number
  cutoff: number
  resonance: number
  drive: number
  envelope: number
}

export interface ImportResult {
  document: CircuitDocument
  warnings: string[]
}
