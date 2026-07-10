import { describe, expect, it } from 'vitest'
import { editorPin, physicalPinCount, ssiDevices } from './devices'

describe('SSI KiCad device library', () => {
  it.each(ssiDevices)('$value has one identity-mapped definition for every package pin', (device) => {
    const pins = device.units.flatMap((unit) => unit.pins)
    const numbers = pins.map((pin) => Number(pin.number)).sort((left, right) => left - right)

    expect(physicalPinCount(device)).toBe(16)
    expect(numbers).toEqual(Array.from({ length: 16 }, (_, index) => index + 1))
    expect(new Set(numbers).size).toBe(16)
  })

  it.each(ssiDevices)('$value maps each compact editor port to exactly one physical pin', (device) => {
    const editorPorts = device.units.flatMap((unit) => unit.pins)
      .flatMap((pin) => pin.editorPortId ? [pin.editorPortId] : [])

    expect(new Set(editorPorts).size).toBe(editorPorts.length)
    for (const portId of editorPorts) expect(editorPin(device, portId)?.pin.editorPortId).toBe(portId)
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
  })
})
