export type SExpression = string | SExpression[]

export function tokenizeSExpression(source: string): string[] {
  const tokens: string[] = []
  let index = 0

  while (index < source.length) {
    const character = source[index]

    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if (character === ';') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }

    if (character === '(' || character === ')') {
      tokens.push(character)
      index += 1
      continue
    }

    if (character === '"') {
      index += 1
      let value = ''
      while (index < source.length) {
        const next = source[index]
        if (next === '"') {
          index += 1
          break
        }
        if (next === '\\') {
          const escaped = source[index + 1]
          const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t' }
          value += escapes[escaped] ?? escaped
          index += 2
          continue
        }
        value += next
        index += 1
      }
      tokens.push(value)
      continue
    }

    const start = index
    while (index < source.length && !/[\s()]/.test(source[index])) index += 1
    tokens.push(source.slice(start, index))
  }

  return tokens
}

export function parseSExpressions(source: string): SExpression[] {
  const tokens = tokenizeSExpression(source)
  const result: SExpression[] = []
  const stack: SExpression[][] = [result]

  for (const token of tokens) {
    if (token === '(') {
      const expression: SExpression[] = []
      stack[stack.length - 1].push(expression)
      stack.push(expression)
      continue
    }

    if (token === ')') {
      if (stack.length === 1) throw new Error('Unexpected closing parenthesis in KiCad file')
      stack.pop()
      continue
    }

    stack[stack.length - 1].push(token)
  }

  if (stack.length !== 1) throw new Error('Unclosed parenthesis in KiCad file')
  return result
}

export function expressionHead(expression: SExpression): string | undefined {
  return Array.isArray(expression) && typeof expression[0] === 'string' ? expression[0] : undefined
}

export function directChildren(expression: SExpression | undefined, head: string): SExpression[][] {
  if (!Array.isArray(expression)) return []
  return expression.filter(
    (child): child is SExpression[] => Array.isArray(child) && expressionHead(child) === head,
  )
}

export function directChild(expression: SExpression | undefined, head: string): SExpression[] | undefined {
  return directChildren(expression, head)[0]
}

export function atomAt(expression: SExpression | undefined, index: number): string | undefined {
  if (!Array.isArray(expression)) return undefined
  const value = expression[index]
  return typeof value === 'string' ? value : undefined
}
