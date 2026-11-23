/**
 * Deliberately restricted JavaScript interpreter for fictional incident repairs.
 * No eval, Function, VM, dynamic imports, network, globals, loops or prototype access.
 * This is NOT a general-purpose JavaScript runtime or a security boundary for
 * untrusted arbitrary JavaScript. All accepted syntax is parsed into our own AST.
 */
import { getScenario } from './scenarios.ts'
import type { ScenarioId, ConfigRule } from './scenarios.ts'

export interface TestResult {
  name: string
  passed: boolean
  detail: string
  hidden?: boolean
}
export interface TestRun {
  passed: boolean
  results: TestResult[]
}

type Token = {
  kind: 'id' | 'number' | 'string' | 'symbol' | 'eof'
  value: string
  offset: number
}
type Expr =
  | { tag: 'lit'; value: unknown }
  | { tag: 'id'; name: string }
  | { tag: 'un'; op: string; a: Expr }
  | { tag: 'bin'; op: string; a: Expr; b: Expr }
  | { tag: 'cond'; when: Expr; yes: Expr; no: Expr }
  | { tag: 'member'; object: Expr; key: string }
  | { tag: 'includes'; object: Expr; item: Expr }
type Statement =
  | { tag: 'return'; expression: Expr }
  | { tag: 'const'; name: string; expression: Expr }
  | { tag: 'if'; condition: Expr; then: Statement[]; otherwise: Statement[] }
interface FunctionAst {
  name: string
  params: string[]
  body: Statement[]
}
const BLOCKED = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'eval',
  'Function',
  'globalThis',
  'window',
  'process',
  'require',
  'fetch',
  'this',
])
const SYMBOLS = [
  '===',
  '!==',
  '>=',
  '<=',
  '&&',
  '||',
  '==',
  '!=',
  '=>',
  '>',
  '<',
  '=',
  '+',
  '-',
  '*',
  '/',
  '!',
  '?',
  '.',
  ',',
  ':',
  '(',
  ')',
  '{',
  '}',
  ';',
  '[',
  ']',
]
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '===': 3,
  '!==': 3,
  '==': 3,
  '!=': 3,
  '>': 4,
  '>=': 4,
  '<': 4,
  '<=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
}
function tokenize(source: string): Token[] {
  if (typeof source !== 'string' || source.length > 3500)
    throw new Error('Code must contain at most 3,500 characters')
  let i = 0
  const result: Token[] = []
  while (i < source.length) {
    if (result.length >= 550) throw new Error('Code exceeds token budget')
    if (/\s/.test(source[i])) {
      i++
      continue
    }
    if (source.slice(i, i + 2) === '//') {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    if (source.slice(i, i + 2) === '/*') {
      const j = source.indexOf('*/', i + 2)
      if (j < 0) throw new Error('Unterminated comment')
      i = j + 2
      continue
    }
    const start = i
    if (/[a-zA-Z_$]/.test(source[i])) {
      i++
      while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i])) i++
      result.push({ kind: 'id', value: source.slice(start, i), offset: start })
      continue
    }
    if (/[0-9]/.test(source[i])) {
      i++
      while (i < source.length && /[0-9.]/.test(source[i])) i++
      const value = source.slice(start, i)
      if (!/^\d+(?:\.\d+)?$/.test(value))
        throw new Error('Invalid numeric literal')
      result.push({ kind: 'number', value, offset: start })
      continue
    }
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i++]
      let value = ''
      let done = false
      while (i < source.length) {
        const x = source[i++]
        if (x === quote) {
          done = true
          break
        }
        if (x === '\\') {
          const escaped = source[i++]
          if (escaped === undefined) throw new Error('Unterminated string')
          const escapeMap: Record<string, string> = {
            n: '\n',
            r: '\r',
            t: '\t',
            '\\': '\\',
            '"': '"',
            "'": "'",
          }
          if (!(escaped in escapeMap))
            throw new Error('Unsupported string escape')
          value += escapeMap[escaped]
        } else value += x
      }
      if (!done) throw new Error('Unterminated string')
      result.push({ kind: 'string', value, offset: start })
      continue
    }
    const symbol = SYMBOLS.find((op) => source.startsWith(op, i))
    if (!symbol) throw new Error(`Unsupported character at ${i}`)
    i += symbol.length
    result.push({ kind: 'symbol', value: symbol, offset: start })
  }
  result.push({ kind: 'eof', value: '<EOF>', offset: i })
  return result
}
class Parser {
  private index = 0
  private readonly tokens: Token[]
  constructor(tokens: Token[]) {
    this.tokens = tokens
  }
  peek() {
    return this.tokens[this.index]
  }
  take() {
    return this.tokens[this.index++]
  }
  at(x: string) {
    return this.peek().value === x
  }
  eat(x: string) {
    if (this.at(x)) {
      this.take()
      return true
    }
    return false
  }
  need(x: string) {
    if (!this.eat(x))
      throw new Error(`Expected ${x} at position ${this.peek().offset}`)
  }
  identifier() {
    const tok = this.take()
    if (tok.kind !== 'id' || BLOCKED.has(tok.value))
      throw new Error('Invalid or unsafe identifier')
    return tok.value
  }
  functionDef(): FunctionAst {
    this.need('function')
    const name = this.identifier()
    this.need('(')
    const params: string[] = []
    if (!this.at(')')) {
      do {
        params.push(this.identifier())
        if (params.length > 5) throw new Error('Too many function arguments')
      } while (this.eat(','))
    }
    this.need(')')
    const body = this.block()
    if (this.peek().kind !== 'eof')
      throw new Error('Exactly one function declaration is permitted')
    if (new Set(params).size !== params.length)
      throw new Error('Argument names must be unique')
    return { name, params, body }
  }
  block(): Statement[] {
    this.need('{')
    const body: Statement[] = []
    while (!this.eat('}')) {
      if (this.peek().kind === 'eof') throw new Error('Unclosed block')
      if (body.length >= 40) throw new Error('Statement limit exceeded')
      body.push(this.statement())
    }
    return body
  }
  statement(): Statement {
    if (this.eat('return')) {
      const expression = this.expression()
      this.eat(';')
      return { tag: 'return', expression }
    }
    if (this.eat('const')) {
      const name = this.identifier()
      this.need('=')
      const expression = this.expression()
      this.eat(';')
      return { tag: 'const', name, expression }
    }
    if (this.eat('if')) {
      this.need('(')
      const condition = this.expression()
      this.need(')')
      const then = this.blockOrStatement()
      const otherwise = this.eat('else') ? this.blockOrStatement() : []
      return { tag: 'if', condition, then, otherwise }
    }
    throw new Error(
      `Unsupported statement: ${this.peek().value}. Use const, if and return.`,
    )
  }
  blockOrStatement() {
    return this.at('{') ? this.block() : [this.statement()]
  }
  expression(min = 0): Expr {
    let left: Expr
    const t = this.take()
    if (t.kind === 'number') left = { tag: 'lit', value: Number(t.value) }
    else if (t.kind === 'string') left = { tag: 'lit', value: t.value }
    else if (t.kind === 'id' && ['true', 'false', 'null'].includes(t.value))
      left = {
        tag: 'lit',
        value: t.value === 'null' ? null : t.value === 'true',
      }
    else if (t.kind === 'id' && !BLOCKED.has(t.value))
      left = { tag: 'id', name: t.value }
    else if (t.value === '!' || t.value === '-') {
      left = { tag: 'un', op: t.value, a: this.expression(7) }
    } else if (t.value === '(') {
      left = this.expression()
      this.need(')')
    } else throw new Error(`Expected an expression at position ${t.offset}`)
    for (;;) {
      if (this.eat('.')) {
        const key = this.identifier()
        if (key === 'includes' && this.eat('(')) {
          const item = this.expression()
          this.need(')')
          left = { tag: 'includes', object: left, item }
        } else left = { tag: 'member', object: left, key }
        continue
      }
      const op = this.peek().value
      if (op === '?' && min <= 0) {
        this.take()
        const yes = this.expression()
        this.need(':')
        const no = this.expression()
        left = { tag: 'cond', when: left, yes, no }
        continue
      }
      const prec = PRECEDENCE[op]
      if (prec === undefined || prec < min) break
      this.take()
      const right = this.expression(prec + 1)
      left = { tag: 'bin', op, a: left, b: right }
    }
    return left
  }
}
function evaluate(
  expr: Expr,
  vars: Record<string, unknown>,
  fuel: { count: number },
): unknown {
  if (--fuel.count < 0) throw new Error('Evaluation budget exceeded')
  switch (expr.tag) {
    case 'lit':
      return expr.value
    case 'id':
      if (!Object.prototype.hasOwnProperty.call(vars, expr.name))
        throw new Error(`Unknown identifier: ${expr.name}`)
      return vars[expr.name]
    case 'un': {
      const a = evaluate(expr.a, vars, fuel)
      return expr.op === '!' ? !a : -(a as number)
    }
    case 'member': {
      const obj = evaluate(expr.object, vars, fuel)
      if (!obj || typeof obj !== 'object' || BLOCKED.has(expr.key))
        throw new Error('Unsafe property access')
      if (!Object.prototype.hasOwnProperty.call(obj, expr.key)) return undefined
      return (obj as Record<string, unknown>)[expr.key]
    }
    case 'includes': {
      const arr = evaluate(expr.object, vars, fuel)
      if (!Array.isArray(arr) || arr.length > 250)
        throw new Error('Only short arrays support includes()')
      return arr.includes(evaluate(expr.item, vars, fuel))
    }
    case 'cond':
      return evaluate(expr.when, vars, fuel)
        ? evaluate(expr.yes, vars, fuel)
        : evaluate(expr.no, vars, fuel)
    case 'bin': {
      const a = evaluate(expr.a, vars, fuel)
      if (expr.op === '&&') return a && evaluate(expr.b, vars, fuel)
      if (expr.op === '||') return a || evaluate(expr.b, vars, fuel)
      const b = evaluate(expr.b, vars, fuel)
      switch (expr.op) {
        case '===':
          return a === b
        case '!==':
          return a !== b
        case '==':
          return a == b
        case '!=':
          return a != b // intentionally familiar JS equality in this limited domain
        case '>':
          return (a as number) > (b as number)
        case '>=':
          return (a as number) >= (b as number)
        case '<':
          return (a as number) < (b as number)
        case '<=':
          return (a as number) <= (b as number)
        case '+':
          return (a as number) + (b as number)
        case '-':
          return (a as number) - (b as number)
        case '*':
          return (a as number) * (b as number)
        case '/':
          return (a as number) / (b as number)
        default:
          throw new Error('Unsupported operator')
      }
    }
  }
}
function statements(
  body: Statement[],
  vars: Record<string, unknown>,
  fuel: { count: number },
): { returned: boolean; value?: unknown } {
  for (const stmt of body) {
    if (--fuel.count < 0) throw new Error('Statement limit exceeded')
    if (stmt.tag === 'return')
      return { returned: true, value: evaluate(stmt.expression, vars, fuel) }
    if (stmt.tag === 'const') {
      if (Object.prototype.hasOwnProperty.call(vars, stmt.name))
        throw new Error('Duplicate variable')
      vars[stmt.name] = evaluate(stmt.expression, vars, fuel)
      continue
    }
    const part = evaluate(stmt.condition, vars, fuel)
      ? stmt.then
      : stmt.otherwise
    const result = statements(part, vars, fuel)
    if (result.returned) return result
  }
  return { returned: false }
}
export function checkJavaScript(id: ScenarioId, source: string): TestRun {
  const scenario = getScenario(id).logic
  let fn: FunctionAst
  try {
    fn = new Parser(tokenize(source)).functionDef()
    if (
      fn.name !== scenario.fn ||
      fn.params.length !== scenario.params.length ||
      fn.params.some((p, i) => p !== scenario.params[i])
    )
      throw new Error(
        `Expected function ${scenario.fn}(${scenario.params.join(', ')})`,
      )
  } catch (e) {
    return {
      passed: false,
      results: [
        {
          name: 'Syntax and permitted JavaScript',
          passed: false,
          detail: e instanceof Error ? e.message : 'Invalid code',
        },
      ],
    }
  }
  const results = scenario.cases.map((test, i) => {
    let passed = false,
      detail: string
    try {
      const vars = Object.create(null) as Record<string, unknown>
      scenario.params.forEach((name, j) => {
        vars[name] = structuredClone(test.args[j])
      })
      const ran = statements(fn.body, vars, { count: 250 })
      if (!ran.returned) throw new Error('Function must return a result')
      passed = ran.value === test.expected
      detail = test.hidden
        ? passed
          ? 'Hidden edge case passed'
          : 'Hidden edge case failed; reconsider your assumptions'
        : `Expected ${JSON.stringify(test.expected)}, received ${JSON.stringify(ran.value)}`
    } catch (e) {
      detail = test.hidden
        ? 'Hidden edge case failed'
        : e instanceof Error
          ? `Code error: ${e.message}`
          : 'Unexpected code error'
    }
    return {
      name: test.hidden ? `Hidden test ${i - 4}` : test.label,
      passed,
      detail,
      hidden: !!test.hidden,
    }
  })
  return { passed: results.every((x) => x.passed), results }
}
function passes(rule: ConfigRule, data: Record<string, unknown>) {
  const v = data[rule.field],
    t = rule.value
  switch (rule.op) {
    case 'eq':
      return v === t
    case 'gte':
      return typeof v === 'number' && Number.isFinite(v) && v >= Number(t)
    case 'lte':
      return (
        typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number(t)
      )
    case 'between':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v >= Number(t) &&
        v <= (rule.extra ?? 0)
      )
    case 'leFieldMinus':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        v > 0 &&
        typeof data[String(t)] === 'number' &&
        v <= (data[String(t)] as number) - (rule.extra ?? 0)
      )
  }
}
export function checkConfiguration(id: ScenarioId, source: string): TestRun {
  const spec = getScenario(id).config
  if (typeof source !== 'string' || source.length > 4500)
    return {
      passed: false,
      results: [
        {
          name: 'Input size',
          passed: false,
          detail: 'Configuration must contain at most 4,500 characters',
        },
      ],
    }
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch (e) {
    return {
      passed: false,
      results: [
        {
          name: 'JSON syntax',
          passed: false,
          detail: e instanceof Error ? e.message : 'Invalid JSON',
        },
      ],
    }
  }
  if (!data || Array.isArray(data) || typeof data !== 'object')
    return {
      passed: false,
      results: [
        {
          name: 'Configuration object',
          passed: false,
          detail: 'Expected a JSON object',
        },
      ],
    }
  const values = data as Record<string, unknown>,
    keys = Object.keys(spec.starter)
  const schemaOk =
    Object.keys(values).length === keys.length &&
    keys.every(
      (key) =>
        Object.hasOwn(values, key) &&
        typeof values[key] === typeof spec.starter[key] &&
        (typeof values[key] !== 'number' || Number.isFinite(values[key])),
    )
  const results: TestResult[] = [
    {
      name: 'Configuration schema',
      passed: schemaOk,
      detail: schemaOk
        ? 'Required fields and types are valid'
        : 'Keep exactly the original fields and types',
    },
  ]
  if (!schemaOk) return { passed: false, results }
  for (const r of spec.rules) {
    const okay = passes(r, values)
    results.push({
      name: r.label,
      passed: okay,
      detail: okay
        ? 'Requirement satisfied'
        : `Review ${r.field}: ${r.op} ${String(r.value)}${r.extra === undefined ? '' : ` (${r.extra})`}`,
    })
  }
  return { passed: results.every((r) => r.passed), results }
}
