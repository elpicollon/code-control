import type { FsEntry, ProcessRunResult } from 'claude-code'
import { GitError } from '../hooks/errors'
import type { Git, GitOptions, GitResult } from '../hooks/git/run'
import type { Host } from '../hooks/host'

export const result = (over: Partial<ProcessRunResult> = {}): ProcessRunResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
  ...over,
})

export const memoryStore = <V>(initial: V) => {
  let value = initial
  return {
    read: async () => value,
    update: async (fn: (current: V) => V) => {
      value = fn(value)
    },
    get: () => value,
  }
}

export type Script = (
  args: readonly string[],
  cwd: string,
) => Partial<GitResult> | undefined | Promise<Partial<GitResult> | undefined>

export const scriptGit = (script: Script) => {
  const calls: { cwd: string; args: string[]; options: GitOptions }[] = []
  const git: Git = async (cwd, args, options = {}) => {
    calls.push({ cwd, args: [...args], options })
    const r: GitResult = { exitCode: 0, stdout: '', stderr: '', ...(await script(args, cwd)) }
    if (r.exitCode !== 0 && options.allowFail !== true) throw new GitError(['git', ...args], r.exitCode, r.stderr)
    return r
  }
  return { git, calls, lines: () => calls.map(call => call.args.join(' ')) }
}

export const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
export const file = (name: string): FsEntry => ({ name, kind: 'file', size: 0, mtimeMs: 0, isLink: false })

export const fakeHost = (over: Partial<Host> = {}) => {
  const submitted: string[] = []
  const opened: string[] = []
  const host: Host = {
    run: async () => result(),
    list: async () => [],
    readText: async () => '',
    complete: async () => ({ isAnswered: true, text: 'feat: change', usage: {} }) as never,
    submit: async text => {
      submitted.push(text)
    },
    open: async path => {
      opened.push(path)
    },
    now: async () => 1_800_000_000_000,
    after: () => ({ cancel: () => undefined }),
    ...over,
  }
  return Object.assign(host, { submitted, opened })
}

// The Text and Button leaves under an element `find` returned, in document order, with what each
// shows: a Text's string children, a Button's label.
export type Leaf = { type: 'Text' | 'Button'; text: string; props: Record<string, unknown> }
export const leaves = (node: unknown): Leaf[] => {
  if (typeof node !== 'object' || node === null) return []
  const { type, props = {}, children = [] } = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const own: Leaf[] =
    type === 'Text'
      ? [{ type, text: children.filter(c => typeof c === 'string').join(''), props }]
      : type === 'Button'
        ? [{ type, text: String(props.label ?? ''), props }]
        : []
  return [...own, ...children.flatMap(leaves)]
}

// Every element under (and including) a node, in document order. A drawn element carries its hover
// beside its props; `find` leaves it off the element it returns, so read hovers from `drawn()`.
export type Node = { type?: string; props: Record<string, unknown>; hover?: Record<string, unknown>; children: unknown[] }
export const nodes = (node: unknown): Node[] => {
  if (typeof node !== 'object' || node === null) return []
  const { type, props = {}, hover, children = [] } = node as Partial<Node>
  return [{ type, props, ...(hover === undefined ? {} : { hover }), children }, ...children.flatMap(nodes)]
}

// Text that draws nothing: whitespace, or the blank a clear button's label is made of.
export const isBlank = (text: string): boolean => text.replace(/\u2800/g, '').trim() === ''

// What a node shows in order, blanks left out: a Text's string children, a Button's label, an icon as
// its alt in brackets.
export const shown = (node: unknown): string[] =>
  nodes(node)
    .flatMap(n => (n.type === 'Svg' ? [`[${String(n.props.alt)}]`] : n.type === 'Text' ? [n.children.filter(c => typeof c === 'string').join('')] : n.type === 'Button' ? [String(n.props.label ?? '')] : []))
    .filter(text => !isBlank(text))
