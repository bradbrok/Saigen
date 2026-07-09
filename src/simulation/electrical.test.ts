import { describe, expect, it } from 'vitest'
import {
  parseEngineeringValue,
  simulateRcStep,
  solveDenseLinearSystem,
  solveVoltageDivider,
} from './electrical'

describe('electrical core', () => {
  it('parses common engineering values', () => {
    expect(parseEngineeringValue('10k')).toBe(10_000)
    expect(parseEngineeringValue('4.7u')).toBeCloseTo(4.7e-6)
    expect(parseEngineeringValue('1M')).toBe(1_000_000)
    expect(parseEngineeringValue('22 n')).toBeCloseTo(22e-9)
  })

  it('solves a voltage divider', () => {
    expect(solveVoltageDivider(5, 1000, 1000)).toBeCloseTo(2.5)
    expect(solveVoltageDivider(12, 20_000, 10_000)).toBeCloseTo(4)
  })

  it('reaches approximately 63.2% after one RC time constant', () => {
    const resistance = 10_000
    const capacitance = 100e-9
    const tau = resistance * capacitance
    const points = simulateRcStep({ resistance, capacitance, duration: tau, timestep: tau / 400 })
    const last = points.at(-1)
    expect(last?.time).toBeCloseTo(tau, 8)
    expect(last?.value).toBeCloseTo(5 * (1 - Math.exp(-1)), 2)
  })

  it('solves a dense linear system with pivoting', () => {
    expect(solveDenseLinearSystem([[2, 1], [1, -1]], [5, 1])).toEqual([2, 1])
  })

  it('diagnoses singular matrices', () => {
    expect(() => solveDenseLinearSystem([[1, 1], [2, 2]], [1, 2])).toThrow(/singular/i)
  })
})
