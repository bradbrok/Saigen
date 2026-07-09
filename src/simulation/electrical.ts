export interface SamplePoint {
  time: number
  value: number
}

const engineeringSuffixes: Record<string, number> = {
  t: 1e12,
  g: 1e9,
  meg: 1e6,
  k: 1e3,
  m: 1e-3,
  u: 1e-6,
  µ: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
}

export function parseEngineeringValue(value: string): number {
  const normalized = value.trim().replace(/Ω|ohms?|farads?|henrys?/gi, '')
  const match = normalized.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-zµ]+)?$/i)

  if (!match) {
    throw new Error(`Invalid engineering value: ${value}`)
  }

  const base = Number(match[1])
  const rawSuffix = match[2]
  const suffix = rawSuffix?.toLowerCase()
  const multiplier = rawSuffix === 'M' ? 1e6 : suffix ? engineeringSuffixes[suffix] : 1

  if (multiplier === undefined) {
    throw new Error(`Unsupported engineering suffix: ${suffix}`)
  }

  return base * multiplier
}

export function solveVoltageDivider(source: number, topResistance: number, bottomResistance: number): number {
  if (topResistance <= 0 || bottomResistance <= 0) {
    throw new Error('Resistance must be greater than zero')
  }

  return source * (bottomResistance / (topResistance + bottomResistance))
}

export function simulateRcStep(options: {
  resistance: number
  capacitance: number
  source?: number
  duration?: number
  timestep?: number
}): SamplePoint[] {
  const {
    resistance,
    capacitance,
    source = 5,
    duration = resistance * capacitance * 5,
    timestep = resistance * capacitance / 200,
  } = options

  if (resistance <= 0 || capacitance <= 0 || timestep <= 0 || duration < 0) {
    throw new Error('R, C, and timestep must be positive; duration cannot be negative')
  }

  const conductance = 1 / resistance
  const companionConductance = capacitance / timestep
  const points: SamplePoint[] = [{ time: 0, value: 0 }]
  let previous = 0

  for (let time = timestep; time <= duration + timestep * 0.5; time += timestep) {
    // Backward-Euler companion model: C becomes G=C/dt plus a history source.
    const value = (conductance * source + companionConductance * previous) /
      (conductance + companionConductance)
    points.push({ time, value })
    previous = value
  }

  return points
}

export function solveDenseLinearSystem(matrix: number[][], vector: number[]): number[] {
  if (matrix.length === 0 || matrix.length !== vector.length || matrix.some((row) => row.length !== matrix.length)) {
    throw new Error('Matrix must be non-empty and square')
  }

  const size = matrix.length
  const augmented = matrix.map((row, index) => [...row, vector[index]])

  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row
      }
    }

    if (Math.abs(augmented[pivot][column]) < 1e-14) {
      throw new Error('Circuit matrix is singular; check for floating nets')
    }

    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    for (let index = column; index <= size; index += 1) {
      augmented[column][index] /= divisor
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index]
      }
    }
  }

  return augmented.map((row) => row[size])
}
