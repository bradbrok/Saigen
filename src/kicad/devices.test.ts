import { describe, expect, it } from 'vitest'
import { catalogByKind } from '../circuit/catalog'
import { editorPin, physicalPinCount, ssiDeviceByKind, ssiDevices, tl072Device } from './devices'

describe('SSI KiCad device library', () => {
  it.each(ssiDevices)('$value has one identity-mapped definition for every package pin', (device) => {
    const pins = device.units.flatMap((unit) => unit.pins)
    const numbers = pins.map((pin) => Number(pin.number)).sort((left, right) => left - right)

    expect(physicalPinCount(device)).toBe(16)
    expect(numbers).toEqual(Array.from({ length: 16 }, (_, index) => index + 1))
    expect(new Set(numbers).size).toBe(16)
  })

  it.each(ssiDevices)('$value exposes every physical pin exactly once on the canvas', (device) => {
    const editorPorts = device.units.flatMap((unit) => unit.pins)
      .flatMap((pin) => pin.editorPortId ? [pin.editorPortId] : [])
    const catalogPorts = catalogByKind[device.kind].ports.map((port) => port.id)

    expect(new Set(editorPorts).size).toBe(editorPorts.length)
    expect(editorPorts).toHaveLength(16)
    expect(new Set(editorPorts)).toEqual(new Set(catalogPorts))
    for (const port of catalogByKind[device.kind].ports) {
      expect(editorPin(device, port.id)?.pin.editorPortId).toBe(port.id)
      expect(editorPin(device, port.id)?.pin.number).toBe(port.pinNumber)
    }
  })

  it('uses the four VCA cells plus an explicit power/mode unit for SSI2164', () => {
    const device = ssiDevices.find((candidate) => candidate.kind === 'ssi2164')
    expect(device?.units.map((unit) => unit.name)).toEqual([
      'VCA 1',
      'VCA 2',
      'VCA 3',
      'VCA 4',
      'Power / Mode',
    ])
    expect(device?.units.slice(0, 4).map((unit) => unit.pins.find((pin) => pin.name.startsWith('IOUT'))?.electricalType))
      .toEqual(['passive', 'passive', 'passive', 'passive'])
    expect(device?.units.slice(0, 4).map((unit) => unit.pins.find((pin) => pin.name.startsWith('VC '))?.electricalType))
      .toEqual(['input', 'input', 'input', 'input'])
  })

  it('defines TL072 as two amplifiers and a shared power unit in one SOIC-8 package', () => {
    expect(ssiDeviceByKind.tl072).toBe(tl072Device)
    expect(tl072Device.footprint).toBe('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm')
    expect(tl072Device.units.map((unit) => unit.name)).toEqual(['Amplifier A', 'Amplifier B', 'Power'])
    expect(physicalPinCount(tl072Device)).toBe(8)
    expect(new Set(tl072Device.units.flatMap((unit) => unit.pins.map((pin) => pin.editorPortId))))
      .toEqual(new Set(catalogByKind.tl072.ports.map((port) => port.id)))
    for (const port of catalogByKind.tl072.ports) {
      expect(editorPin(tl072Device, port.id)?.pin.number).toBe(port.pinNumber)
    }
  })
})
