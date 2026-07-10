import { describe, expect, it } from 'vitest'
import { catalogByKind } from './catalog'
import {
  circuitTemplates,
  instantiateCircuitTemplate,
  type CircuitTemplateId,
  type InstantiatedCircuitTemplate,
} from './templates'
import type { CircuitDocument } from './types'

function emptyDocument(): CircuitDocument {
  return {
    schemaVersion: 1,
    id: 'template-test',
    title: 'Template test',
    description: '',
    revision: 1,
    components: [],
    connections: [],
  }
}

function instantiate(id: CircuitTemplateId): InstantiatedCircuitTemplate {
  return instantiateCircuitTemplate(emptyDocument(), id, { x: 100, y: 200 })
}

function part(instance: InstantiatedCircuitTemplate, label: string) {
  const component = instance.components.find((candidate) => candidate.label === label)
  expect(component, `missing template part ${label}`).toBeDefined()
  return component!
}

function hasWire(
  instance: InstantiatedCircuitTemplate,
  fromLabel: string,
  fromPortId: string,
  toLabel: string,
  toPortId: string,
): boolean {
  const from = part(instance, fromLabel)
  const to = part(instance, toLabel)
  return instance.connections.some((connection) =>
    connection.from.componentId === from.id && connection.from.portId === fromPortId &&
    connection.to.componentId === to.id && connection.to.portId === toPortId,
  )
}

describe('SSI application circuit templates', () => {
  it.each(circuitTemplates)('$name has valid endpoints, unique identities, and a physical primary IC', (template) => {
    const instance = instantiate(template.id)
    const ids = [
      ...instance.components.map((component) => component.id),
      ...instance.connections.map((connection) => connection.id),
    ]
    const references = instance.components.map((component) => component.reference)
    const componentIds = new Set(instance.components.map((component) => component.id))

    expect(template.shortName.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(references).size).toBe(references.length)
    expect(instance.components.find((component) => component.id === instance.primaryComponentId)?.kind)
      .toBe(template.primaryKind)

    for (const connection of instance.connections) {
      expect(componentIds.has(connection.from.componentId)).toBe(true)
      expect(componentIds.has(connection.to.componentId)).toBe(true)
      const from = instance.components.find((component) => component.id === connection.from.componentId)!
      const to = instance.components.find((component) => component.id === connection.to.componentId)!
      expect(catalogByKind[from.kind].ports.some((port) => port.id === connection.from.portId)).toBe(true)
      expect(catalogByKind[to.kind].ports.some((port) => port.id === connection.to.portId)).toBe(true)
    }

    for (const component of instance.components) {
      if (component.kind === 'resistor') {
        expect(component.footprint).toBe('Resistor_SMD:R_0603_1608Metric')
      }
      if (component.kind === 'capacitor') {
        expect(component.footprint).toBe(/[uµμ]/i.test(component.value ?? '')
          ? 'Capacitor_SMD:C_1206_3216Metric'
          : 'Capacitor_SMD:C_0603_1608Metric')
      }
      if (component.kind === 'tl072') {
        expect(component.footprint).toBe('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm')
      }
    }
  })

  it('instantiates repeated templates without colliding with existing ids or references', () => {
    const document = emptyDocument()
    const first = instantiateCircuitTemplate(document, 'ssi2144-typical', { x: 0, y: 0 })
    const populated = {
      ...document,
      components: first.components,
      connections: first.connections,
    }
    const second = instantiateCircuitTemplate(populated, 'ssi2144-typical', { x: 1500, y: 0 })

    expect(new Set(first.components.map((component) => component.id)))
      .not.toContain(second.components[0].id)
    expect(first.components.some((firstComponent) =>
      second.components.some((secondComponent) => secondComponent.id === firstComponent.id ||
        secondComponent.reference === firstComponent.reference),
    )).toBe(false)
  })

  it('builds the SSI2131 timing, compensation, scaling, sync, reference, and bulk-supply networks', () => {
    const instance = instantiate('ssi2131-typical')
    const values = instance.components.map((component) => component.value)

    expect(values).toEqual(expect.arrayContaining(['3.9n', '267', '10n', '499k', '22.1k', '5k', '49.9k', '4.3k', '267k']))
    expect(values.filter((value) => value === '10u')).toHaveLength(2)
    expect(instance.components.map((component) => component.kind)).toEqual(
      expect.arrayContaining(['ssi2131', 'plus5V', 'minus12V', 'vref2V5', 'ground']),
    )
    expect(hasWire(instance, 'EXPO SCALE ADJ', '2', 'EXPO SCALE ADJ', '3')).toBe(true)
    expect(hasWire(instance, 'EXPO SCALE ADJ', '1', 'SSI2131 VCO CORE', 'expoScale')).toBe(true)
    expect(hasWire(instance, 'C0G TIMING', '2', 'ANALOG GND', '1')).toBe(true)
    expect(part(instance, 'EXPO SCALE ADJ').footprint)
      .toBe('Potentiometer_THT:Potentiometer_Bourns_3296W_Vertical')
  })

  it('builds the SSI2144 pole, I/V, Q, frequency-control, and supply networks', () => {
    const instance = instantiate('ssi2144-typical')
    const values = instance.components.map((component) => component.value)

    expect(values.filter((value) => value === '6.8n')).toHaveLength(3)
    expect(values).toEqual(expect.arrayContaining(['560p', '3.3n', '33.2k', '100p', '26.7k', '499', '187k', '1k']))
    expect(values.filter((value) => value === '100n')).toHaveLength(4)
    expect(instance.components.filter((component) => component.kind === 'tl072')).toHaveLength(1)
    expect(hasWire(instance, 'TL072 I/V + CONTROL', 'bOut', 'FREQ CTRL DRIVE', '1')).toBe(true)
    expect(hasWire(instance, 'FREQ CTRL DRIVE', '2', 'SSI2144 VCF CORE', 'cutoff')).toBe(true)
    expect(hasWire(instance, 'TL072 I/V + CONTROL', 'aOut', 'FILTER OUT', 'in')).toBe(true)
    expect(hasWire(instance, '+12 V', '1', 'TL072 +12 V DECOUPLING', '1')).toBe(true)
    expect(hasWire(instance, 'TL072 −12 V DECOUPLING', '2', 'ANALOG GND', '1')).toBe(true)
  })

  it('builds the SSI2164 input, exponential CV, I/V, spare-channel, and supply networks', () => {
    const instance = instantiate('ssi2164-typical')
    const values = instance.components.map((component) => component.value)
    const groundedPorts = new Set(instance.connections.flatMap((connection) => {
      const from = instance.components.find((component) => component.id === connection.from.componentId)
      const to = instance.components.find((component) => component.id === connection.to.componentId)
      if (from?.kind === 'ground' && to?.kind === 'ssi2164') return [connection.to.portId]
      if (to?.kind === 'ground' && from?.kind === 'ssi2164') return [connection.from.portId]
      return []
    }))

    expect(values).toEqual(expect.arrayContaining(['10u', '20k', '220', '1200p', '100k', '66.5k', '242k', '100p']))
    expect(values.filter((value) => value === '100n')).toHaveLength(4)
    expect(instance.components.filter((component) => component.kind === 'tl072')).toHaveLength(1)
    expect(hasWire(instance, '−12 V', '1', 'CV −12 V OFFSET', '1')).toBe(true)
    expect(hasWire(instance, 'TL072 I/V + CV BUFFER', 'bOut', 'CV SUMMER FEEDBACK', '1')).toBe(true)
    expect(hasWire(instance, '+12 V', '1', 'TL072 +12 V DECOUPLING', '1')).toBe(true)
    expect(hasWire(instance, 'TL072 −12 V DECOUPLING', '2', 'ANALOG GND', '1')).toBe(true)

    const resistanceK = (label: string) => Number(part(instance, label).value?.replace(/k$/i, ''))
    const feedbackK = resistanceK('CV SUMMER FEEDBACK')
    const inputK = resistanceK('CV SUMMER INPUT')
    const offsetK = resistanceK('CV −12 V OFFSET')
    const controlVoltage = (inputVoltage: number) => -feedbackK * (inputVoltage / inputK - 12 / offsetK)
    expect(controlVoltage(0)).toBeCloseTo(3.3, 2)
    expect(controlVoltage(5)).toBeCloseTo(0, 1)
    for (const portId of [
      'audio2', 'cv2', 'out2',
      'audio3', 'cv3', 'out3',
      'audio4', 'cv4', 'out4',
    ]) expect(groundedPorts.has(portId)).toBe(true)
  })
})
