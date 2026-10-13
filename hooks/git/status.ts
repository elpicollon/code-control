import type { BranchState, FileChange, FileStatus, Operation } from '../../types'
import type { Host } from '../host'
import type { Git } from './run'

const LETTERS: Readonly<Record<string, FileStatus>> = { M: 'M', T: 'M', A: 'A', D: 'D', R: 'R', C: 'C' }

const splitFields = (record: string, count: number): [string[], string] => {
  const fields: string[] = []
  let rest = record
  for (let i = 0; i < count; i += 1) {
    const at = rest.indexOf(' ')
    fields.push(rest.slice(0, at))
    rest = rest.slice(at + 1)
  }
  return [fields, rest]
}

export const parseStatus = (out: string): { branch: BranchState; files: FileChange[] } => {
  const branch: BranchState = { head: null, oid: null, upstream: null, ahead: 0, behind: 0 }
  const files: FileChange[] = []
  const tokens = out.split('\0')
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? ''
    if (token === '') continue
    if (token.startsWith('# ')) {
      const [, key = '', ...rest] = token.split(' ')
      const value = rest.join(' ')
      if (key === 'branch.oid') branch.oid = value === '(initial)' ? null : value
      if (key === 'branch.head') branch.head = value === '(detached)' ? null : value
      if (key === 'branch.upstream') branch.upstream = value
      if (key === 'branch.ab') {
        const m = /^\+(\d+) -(\d+)$/.exec(value)
        if (m !== null) {
          branch.ahead = Number(m[1])
          branch.behind = Number(m[2])
        }
      }
      continue
    }
    const kind = token[0]
    if (kind === '?') {
      files.push({ path: token.slice(2), from: null, status: 'U', group: 'changes' })
    } else if (kind === 'u') {
      const [, path] = splitFields(token, 10)
      files.push({ path, from: null, status: '!', group: 'conflicts' })
    } else if (kind === '1' || kind === '2') {
      const [fields, path] = splitFields(token, kind === '1' ? 8 : 9)
      const xy = fields[1] ?? '..'
      const x = xy[0] ?? '.'
      const y = xy[1] ?? '.'
      let from: string | null = null
      if (kind === '2') {
        from = tokens[i + 1] ?? null
        i += 1
      }
      if (x !== '.') files.push({ path, from: x === 'R' || x === 'C' ? from : null, status: LETTERS[x] ?? 'M', group: 'staged' })
      if (y !== '.') files.push({ path, from: y === 'R' || y === 'C' ? from : null, status: LETTERS[y] ?? 'M', group: 'changes' })
    }
  }
  return { branch, files }
}

export const readOperation = async (git: Git, host: Host, repo: string): Promise<Operation | null> => {
  const gitDir = (await git(repo, ['rev-parse', '--absolute-git-dir'])).stdout.trim()
  const names = new Set((await host.list(gitDir)).map(entry => entry.name))
  if (names.has('rebase-merge') || names.has('rebase-apply')) return 'rebase'
  if (names.has('MERGE_HEAD')) return 'merge'
  if (names.has('CHERRY_PICK_HEAD')) return 'cherry-pick'
  return null
}

export const readStatus = async (git: Git, host: Host, repo: string) => {
  const out = await git(repo, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'])
  return { ...parseStatus(out.stdout), operation: await readOperation(git, host, repo) }
}
