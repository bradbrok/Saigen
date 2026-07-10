import { catalogByKind, referencePrefix } from './catalog'
import type {
  CircuitComponent,
  CircuitConnection,
  CircuitDocument,
  ComponentKind,
  Point,
  SignalType,
} from './types'

export type CircuitTemplateId =
  | 'ssi2131-typical'
  | 'ssi2144-typical'
  | 'ssi2164-typical'

export interface CircuitTemplate {
  id: CircuitTemplateId
  name: string
  shortName: string
  description: string
  primaryKind: ComponentKind
  datasheetUrl: string
  size: { width: number; height: number }
}

export interface InstantiatedCircuitTemplate {
  components: CircuitComponent[]
  connections: CircuitConnection[]
  primaryComponentId: string
}

interface TemplatePart {
  key: string
  kind: ComponentKind
  at: Point
  label?: string
  value?: string
  parameters?: Record<string, number>
  footprint?: string
}

interface TemplateWire {
  from: readonly [partKey: string, portId: string]
  to: readonly [partKey: string, portId: string]
  signal: SignalType
}

interface TemplateDefinition extends CircuitTemplate {
  primaryPartKey: string
  parts: readonly TemplatePart[]
  wires: readonly TemplateWire[]
}

// These kinds are part of Saigen's fabrication-aware catalog. Keeping the
// aliases here makes the declarative application circuits easy to scan.
const plus5V = 'plus5V' as ComponentKind
const vref2V5 = 'vref2V5' as ComponentKind
const tl072 = 'tl072' as ComponentKind

function curatedFootprint(kind: ComponentKind, value?: string): string | undefined {
  switch (kind) {
    case 'ssi2131':
    case 'ssi2164':
      return 'Saigen:SSI_PSL16_SOIC-16_3.9x9.9mm_P1.27mm'
    case 'ssi2144':
      return 'Saigen:SSI_PSSL16_SSOP-16_3.9x4.9mm_P0.635mm'
    case 'tl072':
      return 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm'
    case 'resistor':
      return 'Resistor_SMD:R_0603_1608Metric'
    case 'capacitor':
      return /(?:^|\s)(?:\d+(?:\.\d*)?|\.\d+)\s*[uµμ]/i.test(value ?? '')
        ? 'Capacitor_SMD:C_1206_3216Metric'
        : 'Capacitor_SMD:C_0603_1608Metric'
    default:
      return undefined
  }
}

function part(
  key: string,
  kind: ComponentKind,
  x: number,
  y: number,
  label?: string,
  value?: string,
  parameters?: Record<string, number>,
  footprint?: string,
): TemplatePart {
  return { key, kind, at: { x, y }, label, value, parameters, footprint }
}

function wire(
  fromPart: string,
  fromPort: string,
  toPart: string,
  toPort: string,
  signal: SignalType = 'passive',
): TemplateWire {
  return {
    from: [fromPart, fromPort],
    to: [toPart, toPort],
    signal,
  }
}

const ssi2131Definition: TemplateDefinition = {
  id: 'ssi2131-typical',
  name: 'SSI2131 typical VCO',
  shortName: '2131 VCO',
  description: 'Datasheet-faithful SSI2131 oscillator core with tuning, sync, reference, and local supply networks.',
  primaryKind: 'ssi2131',
  primaryPartKey: 'core',
  datasheetUrl: 'https://www.soundsemiconductor.com/downloads/ssi2131datasheet.pdf',
  size: { width: 1120, height: 820 },
  parts: [
    part('expoCv', 'cvInput', 0, 120, '1 V/OCT CV'),
    part('pwmCv', 'cvInput', 0, 250, 'PWM CV'),
    part('hardSyncIn', 'gateInput', 0, 390, 'HARD SYNC'),
    part('softSyncIn', 'gateInput', 0, 510, 'SOFT SYNC'),

    part('expoInputR', 'resistor', 150, 120, 'EXPO INPUT', '49.9k'),
    part('hardSyncC', 'capacitor', 180, 375, 'HARD SYNC AC COUPLING', '10n'),
    part('softSyncC', 'capacitor', 180, 495, 'SOFT SYNC AC COUPLING', '10n'),
    part('hardSyncPull', 'resistor', 330, 475, 'HARD SYNC PULLDOWN', '10k'),

    part('core', 'ssi2131', 450, 245, 'SSI2131 VCO CORE'),
    part('timingC', 'capacitor', 475, 520, 'C0G TIMING', '3.9n'),
    part('bwR', 'resistor', 610, 515, 'BW COMP', '267'),
    part('bwC', 'capacitor', 750, 500, 'BW COMP', '10n'),

    part('hfGroundR', 'resistor', 340, 60, 'HF TRACK SHUNT', '4.3k'),
    part('hfInjectR', 'resistor', 385, 145, 'HF TRACK INJECTION', '267k'),
    part('linR', 'resistor', 575, 95, 'LINEAR BIAS', '499k'),
    part('scaleR', 'resistor', 720, 115, 'EXPO SCALE', '22.1k'),
    part(
      'scaleTrim',
      'potentiometer',
      860,
      105,
      'EXPO SCALE ADJ',
      '5k',
      undefined,
      'Potentiometer_THT:Potentiometer_Bourns_3296W_Vertical',
    ),

    part('plus5', plus5V, 480, 0, '+5 V'),
    part('minus12', 'minus12V', 610, 0, '−12 V'),
    part('vref', vref2V5, 755, 0, '2.5 V REF'),
    part('gnd', 'ground', 550, 715, 'ANALOG GND'),
    part('vPlusDecouple', 'capacitor', 430, 650, '+5 V DECOUPLING', '100n'),
    part('vMinusDecouple', 'capacitor', 675, 650, '−12 V DECOUPLING', '100n'),
    part('vPlusBulk', 'capacitor', 325, 635, '+5 V LOCAL BULK', '10u'),
    part('vMinusBulk', 'capacitor', 790, 635, '−12 V LOCAL BULK', '10u'),

    part('sawOut', 'audioOutput', 940, 245, 'SAW OUT'),
    part('pulseOut', 'audioOutput', 940, 350, 'PULSE OUT'),
    part('triOut', 'audioOutput', 940, 455, 'TRIANGLE OUT'),
  ],
  wires: [
    wire('expoCv', 'out', 'expoInputR', '1', 'cv'),
    wire('expoInputR', '2', 'core', 'pitch', 'cv'),
    wire('pwmCv', 'out', 'core', 'pwm', 'cv'),

    wire('hardSyncIn', 'out', 'hardSyncC', '1', 'gate'),
    wire('hardSyncC', '2', 'core', 'sync', 'gate'),
    wire('core', 'sync', 'hardSyncPull', '1', 'gate'),
    wire('hardSyncPull', '2', 'gnd', '1', 'power'),
    wire('softSyncIn', 'out', 'softSyncC', '1', 'gate'),
    wire('softSyncC', '2', 'core', 'softSync', 'gate'),

    wire('core', 'tcap', 'timingC', '1'),
    wire('timingC', '2', 'gnd', '1', 'power'),
    wire('core', 'bwComp', 'bwR', '1'),
    wire('bwR', '2', 'bwC', '1'),
    wire('bwC', '2', 'gnd', '1', 'power'),

    wire('core', 'hfTrack', 'hfGroundR', '1'),
    wire('hfGroundR', '2', 'gnd', '1', 'power'),
    wire('core', 'hfTrack', 'hfInjectR', '1'),
    wire('hfInjectR', '2', 'core', 'pitch', 'cv'),
    wire('vref', '1', 'linR', '1', 'power'),
    wire('linR', '2', 'core', 'linFreq', 'cv'),
    wire('vref', '1', 'scaleR', '1', 'power'),
    wire('scaleR', '2', 'scaleTrim', '3'),
    wire('scaleTrim', '2', 'scaleTrim', '3'),
    wire('scaleTrim', '1', 'core', 'expoScale', 'cv'),
    wire('vref', '1', 'core', 'vref', 'power'),

    wire('plus5', '1', 'core', 'vPlus', 'power'),
    wire('minus12', '1', 'core', 'vMinus', 'power'),
    wire('gnd', '1', 'core', 'gnd', 'power'),
    wire('plus5', '1', 'vPlusDecouple', '1', 'power'),
    wire('vPlusDecouple', '2', 'gnd', '1', 'power'),
    wire('minus12', '1', 'vMinusDecouple', '1', 'power'),
    wire('vMinusDecouple', '2', 'gnd', '1', 'power'),
    wire('plus5', '1', 'vPlusBulk', '1', 'power'),
    wire('vPlusBulk', '2', 'gnd', '1', 'power'),
    wire('minus12', '1', 'vMinusBulk', '1', 'power'),
    wire('vMinusBulk', '2', 'gnd', '1', 'power'),

    wire('core', 'saw', 'sawOut', 'in', 'audio'),
    wire('core', 'pulse', 'pulseOut', 'in', 'audio'),
    wire('core', 'tri', 'triOut', 'in', 'audio'),
  ],
}

const ssi2144Definition: TemplateDefinition = {
  id: 'ssi2144-typical',
  name: 'SSI2144 typical four-pole VCF',
  shortName: '2144 VCF',
  description: 'SSI2144 four-pole low-pass filter with input attenuation, pole capacitors, I/V output, and control networks.',
  primaryKind: 'ssi2144',
  primaryPartKey: 'core',
  datasheetUrl: 'https://www.soundsemiconductor.com/downloads/ssi2144datasheet.pdf',
  size: { width: 1420, height: 940 },
  parts: [
    part('audioIn', 'audioInput', 0, 160, 'FILTER INPUT'),
    part('cutoffCv', 'cvInput', 0, 405, 'CUTOFF CV'),
    part('qCv', 'cvInput', 0, 610, 'RESONANCE CV'),
    part('inputR', 'resistor', 145, 160, 'INPUT ATTENUATION', '68.1k'),
    part('inputShunt', 'resistor', 300, 210, 'INPUT SHUNT', '200'),
    part('minusShunt', 'resistor', 300, 310, 'UNUSED INPUT SHUNT', '200'),
    part('inputBridgeC', 'capacitor', 340, 110, 'OPTIONAL Q STABILITY', '3.3n'),

    part('core', 'ssi2144', 510, 260, 'SSI2144 VCF CORE'),
    part('c4', 'capacitor', 455, 485, 'POLE 4 C0G', '560p'),
    part('c3', 'capacitor', 545, 525, 'POLE 3 C0G', '6.8n'),
    part('c2', 'capacitor', 655, 525, 'POLE 2 C0G', '6.8n'),
    part('c1', 'capacitor', 745, 485, 'POLE 1 C0G', '6.8n'),

    part('qR', 'resistor', 255, 610, 'Q CONTROL', '26.7k'),
    part('qStabilityR', 'resistor', 415, 670, 'Q STABILITY', '499'),
    part('qStabilityC', 'capacitor', 500, 710, 'Q STABILITY', '10n'),

    part('cutoffInputR', 'resistor', 150, 405, 'FREQUENCY SUMMER INPUT', '100k'),
    part('cutoffFeedbackR', 'resistor', 300, 390, 'FREQUENCY SUMMER GAIN', '187k'),
    part('cutoffOutputR', 'resistor', 875, 590, 'FREQ CTRL DRIVE', '100k'),
    part('cutoffTempR', 'resistor', 715, 190, 'FREQUENCY TEMP COMP', '1k'),

    part('dualOpAmp', tl072, 980, 285, 'TL072 I/V + CONTROL'),
    part('ivFeedbackR', 'resistor', 960, 125, 'I/V FEEDBACK', '33.2k'),
    part('ivFeedbackC', 'capacitor', 1100, 125, 'I/V COMPENSATION', '100p'),
    part('audioOut', 'audioOutput', 1280, 300, 'FILTER OUT'),

    part('plus12', 'plus12V', 700, 0, '+12 V'),
    part('minus12', 'minus12V', 805, 0, '−12 V'),
    part('gnd', 'ground', 610, 845, 'ANALOG GND'),
    part('vPlusDecouple', 'capacitor', 700, 740, 'SSI2144 +12 V DECOUPLING', '100n'),
    part('vMinusDecouple', 'capacitor', 820, 740, 'SSI2144 −12 V DECOUPLING', '100n'),
    part('opAmpVPlusDecouple', 'capacitor', 1110, 740, 'TL072 +12 V DECOUPLING', '100n'),
    part('opAmpVMinusDecouple', 'capacitor', 1240, 740, 'TL072 −12 V DECOUPLING', '100n'),
  ],
  wires: [
    wire('audioIn', 'out', 'inputR', '1', 'audio'),
    wire('inputR', '2', 'core', 'audio', 'audio'),
    wire('core', 'audio', 'inputShunt', '1', 'audio'),
    wire('inputShunt', '2', 'gnd', '1', 'power'),
    wire('core', 'audioMinus', 'minusShunt', '1', 'audio'),
    wire('minusShunt', '2', 'gnd', '1', 'power'),
    wire('core', 'audio', 'inputBridgeC', '1'),
    wire('inputBridgeC', '2', 'core', 'audioMinus'),

    wire('core', 'c4a', 'c4', '1'),
    wire('c4', '2', 'core', 'c4b'),
    wire('core', 'c3a', 'c3', '1'),
    wire('c3', '2', 'core', 'c3b'),
    wire('core', 'c2a', 'c2', '1'),
    wire('c2', '2', 'core', 'c2b'),
    wire('core', 'c1a', 'c1', '1'),
    wire('c1', '2', 'core', 'c1b'),

    wire('qCv', 'out', 'qR', '1', 'cv'),
    wire('qR', '2', 'core', 'resonance', 'cv'),
    wire('core', 'resonance', 'qStabilityR', '1', 'cv'),
    wire('qStabilityR', '2', 'qStabilityC', '1'),
    wire('qStabilityC', '2', 'gnd', '1', 'power'),

    wire('cutoffCv', 'out', 'cutoffInputR', '1', 'cv'),
    wire('cutoffInputR', '2', 'dualOpAmp', 'bMinus', 'cv'),
    wire('dualOpAmp', 'bPlus', 'gnd', '1', 'power'),
    wire('dualOpAmp', 'bOut', 'cutoffFeedbackR', '1', 'cv'),
    wire('cutoffFeedbackR', '2', 'dualOpAmp', 'bMinus', 'cv'),
    wire('dualOpAmp', 'bOut', 'cutoffOutputR', '1', 'cv'),
    wire('cutoffOutputR', '2', 'core', 'cutoff', 'cv'),
    wire('core', 'cutoff', 'cutoffTempR', '1', 'cv'),
    wire('cutoffTempR', '2', 'gnd', '1', 'power'),

    wire('core', 'out', 'dualOpAmp', 'aMinus', 'audio'),
    wire('dualOpAmp', 'aPlus', 'gnd', '1', 'power'),
    wire('dualOpAmp', 'aOut', 'ivFeedbackR', '1', 'audio'),
    wire('ivFeedbackR', '2', 'dualOpAmp', 'aMinus', 'audio'),
    wire('dualOpAmp', 'aOut', 'ivFeedbackC', '1', 'audio'),
    wire('ivFeedbackC', '2', 'dualOpAmp', 'aMinus', 'audio'),
    wire('dualOpAmp', 'aOut', 'audioOut', 'in', 'audio'),

    wire('plus12', '1', 'core', 'vPlus', 'power'),
    wire('minus12', '1', 'core', 'vMinus', 'power'),
    wire('gnd', '1', 'core', 'gnd', 'power'),
    wire('plus12', '1', 'dualOpAmp', 'vPlus', 'power'),
    wire('minus12', '1', 'dualOpAmp', 'vMinus', 'power'),
    wire('plus12', '1', 'vPlusDecouple', '1', 'power'),
    wire('vPlusDecouple', '2', 'gnd', '1', 'power'),
    wire('minus12', '1', 'vMinusDecouple', '1', 'power'),
    wire('vMinusDecouple', '2', 'gnd', '1', 'power'),
    wire('plus12', '1', 'opAmpVPlusDecouple', '1', 'power'),
    wire('opAmpVPlusDecouple', '2', 'gnd', '1', 'power'),
    wire('minus12', '1', 'opAmpVMinusDecouple', '1', 'power'),
    wire('opAmpVMinusDecouple', '2', 'gnd', '1', 'power'),
  ],
}

const ssi2164Definition: TemplateDefinition = {
  id: 'ssi2164-typical',
  name: 'SSI2164 typical VCA channel',
  shortName: '2164 VCA',
  description: 'One complete SSI2164 audio VCA with conditioned 0–5 V control, transimpedance output, and safely terminated spare channels.',
  primaryKind: 'ssi2164',
  primaryPartKey: 'core',
  datasheetUrl: 'https://www.soundsemiconductor.com/downloads/ssi2164datasheet.pdf',
  size: { width: 1400, height: 900 },
  parts: [
    part('audioIn', 'audioInput', 0, 180, 'VCA INPUT'),
    part('cvIn', 'cvInput', 0, 455, 'LEVEL CV 0–5 V', undefined, { voltage: 0 }),
    part('inputCouplingC', 'capacitor', 145, 165, 'OPTIONAL DC BLOCK', '10u'),
    part('inputR', 'resistor', 245, 180, 'V/I INPUT', '20k'),
    part('stabilityR', 'resistor', 300, 305, 'INPUT STABILITY', '220'),
    part('stabilityC', 'capacitor', 320, 405, 'INPUT STABILITY', '1200p'),

    part('cvInputR', 'resistor', 150, 455, 'CV SUMMER INPUT', '100k'),
    part('cvFeedbackR', 'resistor', 820, 545, 'CV SUMMER FEEDBACK', '66.5k'),
    part('cvOffsetR', 'resistor', 325, 560, 'CV −12 V OFFSET', '242k'),
    part('dualOpAmp', tl072, 900, 275, 'TL072 I/V + CV BUFFER'),
    part('core', 'ssi2164', 445, 165, 'SSI2164 QUAD VCA'),

    part('ivFeedbackR', 'resistor', 930, 115, 'I/V FEEDBACK', '20k'),
    part('ivFeedbackC', 'capacitor', 1060, 115, 'I/V COMPENSATION', '100p'),
    part('audioOut', 'audioOutput', 1240, 250, 'VCA OUT'),

    part('plus12', 'plus12V', 510, 0, '+12 V'),
    part('minus12', 'minus12V', 615, 0, '−12 V'),
    part('gnd', 'ground', 560, 805, 'ANALOG GND'),
    part('vPlusDecouple', 'capacitor', 660, 700, 'SSI2164 +12 V DECOUPLING', '100n'),
    part('vMinusDecouple', 'capacitor', 780, 700, 'SSI2164 −12 V DECOUPLING', '100n'),
    part('opAmpVPlusDecouple', 'capacitor', 1110, 700, 'TL072 +12 V DECOUPLING', '100n'),
    part('opAmpVMinusDecouple', 'capacitor', 1230, 700, 'TL072 −12 V DECOUPLING', '100n'),
  ],
  wires: [
    wire('audioIn', 'out', 'inputCouplingC', '1', 'audio'),
    wire('inputCouplingC', '2', 'inputR', '1', 'audio'),
    wire('inputR', '2', 'core', 'audio', 'audio'),
    wire('core', 'audio', 'stabilityR', '1', 'audio'),
    wire('stabilityR', '2', 'stabilityC', '1'),
    wire('stabilityC', '2', 'gnd', '1', 'power'),

    wire('cvIn', 'out', 'cvInputR', '1', 'cv'),
    wire('cvInputR', '2', 'dualOpAmp', 'bMinus', 'cv'),
    wire('dualOpAmp', 'bPlus', 'gnd', '1', 'power'),
    wire('dualOpAmp', 'bOut', 'cvFeedbackR', '1', 'cv'),
    wire('cvFeedbackR', '2', 'dualOpAmp', 'bMinus', 'cv'),
    wire('minus12', '1', 'cvOffsetR', '1', 'power'),
    wire('cvOffsetR', '2', 'dualOpAmp', 'bMinus', 'cv'),
    wire('dualOpAmp', 'bOut', 'core', 'cv', 'cv'),

    wire('core', 'out', 'dualOpAmp', 'aMinus', 'audio'),
    wire('dualOpAmp', 'aPlus', 'gnd', '1', 'power'),
    wire('dualOpAmp', 'aOut', 'ivFeedbackR', '1', 'audio'),
    wire('ivFeedbackR', '2', 'dualOpAmp', 'aMinus', 'audio'),
    wire('dualOpAmp', 'aOut', 'ivFeedbackC', '1', 'audio'),
    wire('ivFeedbackC', '2', 'dualOpAmp', 'aMinus', 'audio'),
    wire('dualOpAmp', 'aOut', 'audioOut', 'in', 'audio'),

    wire('gnd', '1', 'core', 'audio2', 'power'),
    wire('gnd', '1', 'core', 'cv2', 'power'),
    wire('gnd', '1', 'core', 'out2', 'power'),
    wire('gnd', '1', 'core', 'audio3', 'power'),
    wire('gnd', '1', 'core', 'cv3', 'power'),
    wire('gnd', '1', 'core', 'out3', 'power'),
    wire('gnd', '1', 'core', 'audio4', 'power'),
    wire('gnd', '1', 'core', 'cv4', 'power'),
    wire('gnd', '1', 'core', 'out4', 'power'),

    wire('plus12', '1', 'core', 'vPlus', 'power'),
    wire('minus12', '1', 'core', 'vMinus', 'power'),
    wire('gnd', '1', 'core', 'gnd', 'power'),
    wire('plus12', '1', 'dualOpAmp', 'vPlus', 'power'),
    wire('minus12', '1', 'dualOpAmp', 'vMinus', 'power'),
    wire('plus12', '1', 'vPlusDecouple', '1', 'power'),
    wire('vPlusDecouple', '2', 'gnd', '1', 'power'),
    wire('minus12', '1', 'vMinusDecouple', '1', 'power'),
    wire('vMinusDecouple', '2', 'gnd', '1', 'power'),
    wire('plus12', '1', 'opAmpVPlusDecouple', '1', 'power'),
    wire('opAmpVPlusDecouple', '2', 'gnd', '1', 'power'),
    wire('minus12', '1', 'opAmpVMinusDecouple', '1', 'power'),
    wire('opAmpVMinusDecouple', '2', 'gnd', '1', 'power'),
  ],
}

const definitions: Record<CircuitTemplateId, TemplateDefinition> = {
  'ssi2131-typical': ssi2131Definition,
  'ssi2144-typical': ssi2144Definition,
  'ssi2164-typical': ssi2164Definition,
}

export const circuitTemplates: readonly CircuitTemplate[] = Object.values(definitions).map((definition) => ({
  id: definition.id,
  name: definition.name,
  shortName: definition.shortName,
  description: definition.description,
  primaryKind: definition.primaryKind,
  datasheetUrl: definition.datasheetUrl,
  size: { ...definition.size },
}))

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function allocateNamespace(document: CircuitDocument, definition: TemplateDefinition): string {
  const occupiedIds = new Set([
    ...document.components.map((component) => component.id),
    ...document.connections.map((connection) => connection.id),
  ])
  const templateToken = sanitizeId(definition.id)

  for (let serial = 1; ; serial += 1) {
    const namespace = `tpl-${templateToken}-${serial}`
    const plannedIds = [
      ...definition.parts.map((candidate) => `${namespace}-${sanitizeId(candidate.key)}`),
      ...definition.wires.map((_, index) => `${namespace}-wire-${index + 1}`),
    ]
    if (plannedIds.every((id) => !occupiedIds.has(id))) return namespace
  }
}

function numericReferenceSuffix(reference: string, prefix: string): number | undefined {
  if (!reference.startsWith(prefix)) return undefined
  const match = reference.slice(prefix.length).match(/^(\d+)/)
  return match ? Number(match[1]) : undefined
}

function referenceAllocator(document: CircuitDocument): (kind: ComponentKind) => string {
  const used = new Set(document.components.map((component) => component.reference))
  const nextByPrefix = new Map<string, number>()

  return (kind) => {
    const prefix = referencePrefix[kind]
    if (!prefix) throw new Error(`No reference prefix is registered for ${kind}`)

    let next = nextByPrefix.get(prefix)
    if (next === undefined) {
      const existingNumbers = [...used]
        .map((reference) => numericReferenceSuffix(reference, prefix))
        .filter((value): value is number => value !== undefined)
      next = Math.max(0, ...existingNumbers) + 1
    }

    let reference = `${prefix}${prefix === '#PWR' ? String(next).padStart(2, '0') : next}`
    while (used.has(reference)) {
      next += 1
      reference = `${prefix}${prefix === '#PWR' ? String(next).padStart(2, '0') : next}`
    }

    used.add(reference)
    nextByPrefix.set(prefix, next + 1)
    return reference
  }
}

export function instantiateCircuitTemplate(
  document: CircuitDocument,
  id: CircuitTemplateId,
  origin: Point,
): InstantiatedCircuitTemplate {
  const definition = definitions[id]
  if (!definition) throw new Error(`Unknown circuit template: ${id}`)

  const namespace = allocateNamespace(document, definition)
  const allocateReference = referenceAllocator(document)
  const idsByPartKey = new Map<string, string>()

  const components = definition.parts.map((templatePart) => {
    const catalog = catalogByKind[templatePart.kind]
    if (!catalog) throw new Error(`Template ${id} uses unknown component kind ${templatePart.kind}`)

    const componentId = `${namespace}-${sanitizeId(templatePart.key)}`
    idsByPartKey.set(templatePart.key, componentId)
    const value = templatePart.value ?? catalog.defaultValue
    const footprint = templatePart.footprint ?? curatedFootprint(templatePart.kind, value)

    return {
      id: componentId,
      kind: templatePart.kind,
      reference: allocateReference(templatePart.kind),
      label: templatePart.label ?? catalog.name,
      position: {
        x: origin.x + templatePart.at.x,
        y: origin.y + templatePart.at.y,
      },
      ...(value === undefined ? {} : { value }),
      ...(footprint === undefined ? {} : { footprint }),
      parameters: {
        ...(catalog.defaultParameters ?? {}),
        ...(templatePart.parameters ?? {}),
      },
    } satisfies CircuitComponent
  })

  const connections = definition.wires.map((templateWire, index) => {
    const fromComponentId = idsByPartKey.get(templateWire.from[0])
    const toComponentId = idsByPartKey.get(templateWire.to[0])
    if (!fromComponentId || !toComponentId) {
      throw new Error(`Template ${id} contains a wire to an unknown part`)
    }

    return {
      id: `${namespace}-wire-${index + 1}`,
      from: { componentId: fromComponentId, portId: templateWire.from[1] },
      to: { componentId: toComponentId, portId: templateWire.to[1] },
      signal: templateWire.signal,
    } satisfies CircuitConnection
  })

  const primaryComponentId = idsByPartKey.get(definition.primaryPartKey)
  if (!primaryComponentId) throw new Error(`Template ${id} has no primary component`)

  return { components, connections, primaryComponentId }
}
