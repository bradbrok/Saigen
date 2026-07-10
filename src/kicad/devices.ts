import type { ComponentKind } from '../circuit/types'

export type KiCadElectricalType =
  | 'input'
  | 'output'
  | 'bidirectional'
  | 'passive'
  | 'power_in'
  | 'power_out'
  | 'no_connect'

export type KiCadPinSide = 'left' | 'right' | 'top' | 'bottom'

export interface KiCadDevicePin {
  number: string
  name: string
  electricalType: KiCadElectricalType
  side: KiCadPinSide
  /** Saigen canvas port represented by this physical pin. */
  editorPortId?: string
}

export interface KiCadDeviceUnit {
  number: number
  name: string
  pins: KiCadDevicePin[]
  width?: number
  height?: number
}

export interface KiCadDeviceDefinition {
  kind: ComponentKind
  symbolName: string
  value: string
  description: string
  datasheet: string
  footprint: string
  manufacturer: string
  mpn: string
  packageName: string
  units: KiCadDeviceUnit[]
}

const ssi2131: KiCadDeviceDefinition = {
  kind: 'ssi2131',
  symbolName: 'SSI2131',
  value: 'SSI2131',
  description: 'Precision voltage-controlled oscillator, full three-unit symbol, PSL16 SOP',
  datasheet: 'https://www.soundsemiconductor.com/downloads/ssi2131datasheet.pdf',
  footprint: 'Saigen:SSI_PSL16_SOIC-16_3.9x9.9mm_P1.27mm',
  manufacturer: 'Sound Semiconductor',
  mpn: 'SSI2131SS-TU',
  packageName: 'PSL16 / JEDEC MS-012-AC',
  units: [
    {
      number: 1,
      name: 'Pitch / Core',
      width: 15.24,
      height: 17.78,
      pins: [
        { number: '6', name: 'EXPO FREQ', electricalType: 'input', side: 'left', editorPortId: 'pitch' },
        { number: '12', name: 'LIN FREQ', electricalType: 'input', side: 'left', editorPortId: 'linFreq' },
        { number: '13', name: 'EXPO SCALE', electricalType: 'input', side: 'left', editorPortId: 'expoScale' },
        { number: '8', name: 'TCAP', electricalType: 'passive', side: 'bottom', editorPortId: 'tcap' },
        { number: '5', name: 'HF TRACK', electricalType: 'output', side: 'right', editorPortId: 'hfTrack' },
        { number: '15', name: 'BW COMP', electricalType: 'passive', side: 'right', editorPortId: 'bwComp' },
      ],
    },
    {
      number: 2,
      name: 'Waveforms / Sync',
      width: 15.24,
      height: 17.78,
      pins: [
        { number: '3', name: 'PWM CTRL', electricalType: 'input', side: 'left', editorPortId: 'pwm' },
        { number: '10', name: 'HARD SYNC', electricalType: 'input', side: 'left', editorPortId: 'sync' },
        { number: '11', name: 'SOFT SYNC', electricalType: 'input', side: 'left', editorPortId: 'softSync' },
        { number: '1', name: 'SAW OUT', electricalType: 'output', side: 'right', editorPortId: 'saw' },
        { number: '2', name: 'PULSE OUT', electricalType: 'output', side: 'right', editorPortId: 'pulse' },
        { number: '4', name: 'TRI OUT', electricalType: 'output', side: 'right', editorPortId: 'tri' },
      ],
    },
    {
      number: 3,
      name: 'Power / Reference',
      width: 15.24,
      height: 12.7,
      pins: [
        { number: '14', name: 'VREF', electricalType: 'input', side: 'left', editorPortId: 'vref' },
        { number: '16', name: 'V+', electricalType: 'power_in', side: 'top', editorPortId: 'vPlus' },
        { number: '7', name: 'V−', electricalType: 'power_in', side: 'bottom', editorPortId: 'vMinus' },
        { number: '9', name: 'GND', electricalType: 'power_in', side: 'bottom', editorPortId: 'gnd' },
      ],
    },
  ],
}

const ssi2144: KiCadDeviceDefinition = {
  kind: 'ssi2144',
  symbolName: 'SSI2144',
  value: 'SSI2144',
  description: 'Four-pole voltage-controlled low-pass filter, full three-unit symbol, PSSL16 SSOP',
  datasheet: 'https://www.soundsemiconductor.com/downloads/ssi2144datasheet.pdf',
  footprint: 'Saigen:SSI_PSSL16_SSOP-16_3.9x4.9mm_P0.635mm',
  manufacturer: 'Sound Semiconductor',
  mpn: 'SSI2144SS-TU',
  packageName: 'PSSL16 / JEDEC MO-137-AB',
  units: [
    {
      number: 1,
      name: 'Filter Core',
      width: 17.78,
      height: 22.86,
      pins: [
        { number: '1', name: 'SIG IN+', electricalType: 'input', side: 'left', editorPortId: 'audio' },
        { number: '2', name: 'SIG IN−', electricalType: 'input', side: 'left', editorPortId: 'audioMinus' },
        { number: '3', name: 'OUT', electricalType: 'output', side: 'right', editorPortId: 'out' },
        { number: '13', name: 'C1A', electricalType: 'passive', side: 'left', editorPortId: 'c1a' },
        { number: '12', name: 'C1B', electricalType: 'passive', side: 'left', editorPortId: 'c1b' },
        { number: '11', name: 'C2A', electricalType: 'passive', side: 'left', editorPortId: 'c2a' },
        { number: '10', name: 'C2B', electricalType: 'passive', side: 'left', editorPortId: 'c2b' },
        { number: '6', name: 'C3A', electricalType: 'passive', side: 'right', editorPortId: 'c3a' },
        { number: '7', name: 'C3B', electricalType: 'passive', side: 'right', editorPortId: 'c3b' },
        { number: '4', name: 'C4A', electricalType: 'passive', side: 'right', editorPortId: 'c4a' },
        { number: '5', name: 'C4B', electricalType: 'passive', side: 'right', editorPortId: 'c4b' },
      ],
    },
    {
      number: 2,
      name: 'Control',
      width: 15.24,
      height: 10.16,
      pins: [
        { number: '15', name: 'FREQ CTRL', electricalType: 'input', side: 'left', editorPortId: 'cutoff' },
        { number: '14', name: 'Q CTRL', electricalType: 'input', side: 'left', editorPortId: 'resonance' },
      ],
    },
    {
      number: 3,
      name: 'Power',
      width: 12.7,
      height: 10.16,
      pins: [
        { number: '16', name: 'V+', electricalType: 'power_in', side: 'top', editorPortId: 'vPlus' },
        { number: '8', name: 'V−', electricalType: 'power_in', side: 'bottom', editorPortId: 'vMinus' },
        { number: '9', name: 'GND', electricalType: 'power_in', side: 'bottom', editorPortId: 'gnd' },
      ],
    },
  ],
}

const vcaUnit = (
  number: number,
  name: string,
  inputPin: string,
  controlPin: string,
  outputPin: string,
): KiCadDeviceUnit => ({
  number,
  name,
  width: 12.7,
  height: 10.16,
  pins: [
    {
      number: inputPin,
      name: `IIN ${number}`,
      electricalType: 'input',
      side: 'left',
      editorPortId: number === 1 ? 'audio' : `audio${number}`,
    },
    {
      number: controlPin,
      name: `VC ${number}`,
      electricalType: 'input',
      side: 'left',
      editorPortId: number === 1 ? 'cv' : `cv${number}`,
    },
    {
      number: outputPin,
      name: `IOUT ${number}`,
      // IOUT is a ground-referenced current node. Passive avoids false ERC
      // conflicts when datasheet-required unused outputs share analog ground.
      electricalType: 'passive',
      side: 'right',
      editorPortId: number === 1 ? 'out' : `out${number}`,
    },
  ],
})

const ssi2164: KiCadDeviceDefinition = {
  kind: 'ssi2164',
  symbolName: 'SSI2164',
  value: 'SSI2164',
  description: 'Quad current-in/current-out voltage-controlled amplifier, full five-unit symbol, PSL16 SOP',
  datasheet: 'https://www.soundsemiconductor.com/downloads/ssi2164datasheet.pdf',
  footprint: 'Saigen:SSI_PSL16_SOIC-16_3.9x9.9mm_P1.27mm',
  manufacturer: 'Sound Semiconductor',
  mpn: 'SSI2164S-TU',
  packageName: 'PSL16 / JEDEC MS-012-AC',
  units: [
    vcaUnit(1, 'VCA 1', '2', '3', '4'),
    vcaUnit(2, 'VCA 2', '7', '6', '5'),
    vcaUnit(3, 'VCA 3', '10', '11', '12'),
    vcaUnit(4, 'VCA 4', '15', '14', '13'),
    {
      number: 5,
      name: 'Power / Mode',
      width: 12.7,
      height: 12.7,
      pins: [
        { number: '1', name: 'MODE', electricalType: 'passive', side: 'left', editorPortId: 'mode' },
        { number: '16', name: 'V+', electricalType: 'power_in', side: 'top', editorPortId: 'vPlus' },
        { number: '9', name: 'V−', electricalType: 'power_in', side: 'bottom', editorPortId: 'vMinus' },
        { number: '8', name: 'GND', electricalType: 'power_in', side: 'bottom', editorPortId: 'gnd' },
      ],
    },
  ],
}

export const tl072Device: KiCadDeviceDefinition = {
  kind: 'tl072',
  symbolName: 'TL072',
  value: 'TL072',
  description: 'Low-noise dual JFET-input operational amplifier, full three-unit symbol, SOIC-8',
  datasheet: 'https://www.ti.com/lit/ds/symlink/tl072.pdf',
  footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm',
  manufacturer: 'Texas Instruments',
  mpn: 'TL072DR',
  packageName: 'SOIC-8 / JEDEC MS-012',
  units: [
    {
      number: 1,
      name: 'Amplifier A',
      width: 12.7,
      height: 10.16,
      pins: [
        { number: '3', name: 'A+', electricalType: 'input', side: 'left', editorPortId: 'aPlus' },
        { number: '2', name: 'A−', electricalType: 'input', side: 'left', editorPortId: 'aMinus' },
        { number: '1', name: 'A OUT', electricalType: 'output', side: 'right', editorPortId: 'aOut' },
      ],
    },
    {
      number: 2,
      name: 'Amplifier B',
      width: 12.7,
      height: 10.16,
      pins: [
        { number: '5', name: 'B+', electricalType: 'input', side: 'left', editorPortId: 'bPlus' },
        { number: '6', name: 'B−', electricalType: 'input', side: 'left', editorPortId: 'bMinus' },
        { number: '7', name: 'B OUT', electricalType: 'output', side: 'right', editorPortId: 'bOut' },
      ],
    },
    {
      number: 3,
      name: 'Power',
      width: 10.16,
      height: 10.16,
      pins: [
        { number: '8', name: 'V+', electricalType: 'power_in', side: 'top', editorPortId: 'vPlus' },
        { number: '4', name: 'V−', electricalType: 'power_in', side: 'bottom', editorPortId: 'vMinus' },
      ],
    },
  ],
}

export const ssiDevices = [ssi2131, ssi2144, ssi2164] as const

export const ssiDeviceByKind: Partial<Record<ComponentKind, KiCadDeviceDefinition>> = Object.fromEntries(
  [...ssiDevices, tl072Device].map((device) => [device.kind, device]),
)

export function physicalPinCount(device: KiCadDeviceDefinition): number {
  return device.units.reduce((count, unit) => count + unit.pins.length, 0)
}

export function editorPin(device: KiCadDeviceDefinition, portId: string): {
  unit: KiCadDeviceUnit
  pin: KiCadDevicePin
} | undefined {
  for (const unit of device.units) {
    const pin = unit.pins.find((candidate) => candidate.editorPortId === portId)
    if (pin) return { unit, pin }
  }
  return undefined
}
