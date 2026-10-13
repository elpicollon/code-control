import type { BranchRef, DiffContent, FileChange, Operation, Stash } from '../../types'
import { GitError, Refusal } from '../errors'
import type { Host } from '../host'
import { join } from '../paths'
import type { Git, GitOptions, GitResult } from './run'

export const DIFF_LINES = 2_000
export const QUIET_ENV: Readonly<Record<string, string>> = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
const NETWORK_MS = 300_000
const LOCAL_MS = 300_000
const AUTO_FETCH_MS = 90_000

export type PullMode = 'ff' | 'merge' | 'rebase'
export type Side = 'mine' | 'theirs'

// A command that changes the repository gets as long as a network one: killed halfway, it could
// leave index.lock behind or the work tree half written.
const change = (git: Git, repo: string, args: readonly string[]): Promise<GitResult> => git(repo, args, { timeoutMs: LOCAL_MS })

const pathsOf = (files: readonly FileChange[]): string[] => files.flatMap(f => (f.from === null ? [f.path] : [f.path, f.from]))

// Read fresh inside the action, never from the snapshot: `add -A` over an unmerged path marks it
// resolved with its conflict markers.
export const refuseConflicts = async (git: Git, repo: string): Promise<void> => {
  if ((await git(repo, ['diff', '--name-only', '--diff-filter=U'])).stdout.trim() !== '') throw new Refusal('conflictsLeft')
}

export const hasStaged = async (git: Git, repo: string): Promise<boolean> => {
  const r = await git(repo, ['diff', '--cached', '--quiet'], { allowFail: true })
  if (r.exitCode === 0 || r.exitCode === 1) return r.exitCode === 1
  throw new GitError(['git', 'diff', '--cached', '--quiet'], r.exitCode, r.stderr)
}

export const stage = async (git: Git, repo: string, files: readonly FileChange[] | 'all'): Promise<GitResult> => {
  if (files !== 'all') return change(git, repo, ['add', '--', ...pathsOf(files)])
  await refuseConflicts(git, repo)
  return change(git, repo, ['add', '-A'])
}

export const unstage = (git: Git, repo: string, files: readonly FileChange[] | 'all', hasHead: boolean): Promise<GitResult> => {
  const paths = files === 'all' ? ['.'] : pathsOf(files)
  return change(git, repo, hasHead ? ['restore', '--staged', '--', ...paths] : ['rm', '--cached', '-r', '-q', '--', ...paths])
}

export const discard = (git: Git, repo: string, file: FileChange): Promise<GitResult> =>
  change(git, repo, file.status === 'U' ? ['clean', '-f', '--', file.path] : ['restore', '--worktree', '--', file.path])

export const cutDiff = (text: string): { text: string; isCut: boolean } => {
  const lines = text.split('\n')
  if (lines.length <= DIFF_LINES) return { text, isCut: false }
  const starts = lines.flatMap((line, i) => (line.startsWith('@@') && i <= DIFF_LINES ? [i] : []))
  const end = starts.length > 1 ? (starts[starts.length - 1] ?? DIFF_LINES) : DIFF_LINES
  return { text: lines.slice(0, end).join('\n'), isCut: true }
}

export const readDiff = async (git: Git, host: Host, repo: string, file: FileChange): Promise<DiffContent> => {
  if (file.status === 'U') {
    const text = await host.readText(join(repo, file.path))
    return text.includes('\0') ? { kind: 'binary' } : { kind: 'text', ...cutDiff(text) }
  }
  const out = (await git(repo, file.group === 'staged' ? ['diff', '--cached', '--', file.path] : ['diff', '--', file.path])).stdout
  return /^Binary files /m.test(out) ? { kind: 'binary' } : { kind: 'diff', ...cutDiff(out) }
}

// Fails closed: when git cannot answer, the commit counts as pushed and is left alone.
export const isPushed = async (git: Git, repo: string): Promise<boolean> => {
  const r = await git(repo, ['branch', '-r', '--contains', 'HEAD'], { allowFail: true })
  return r.exitCode !== 0 || r.stdout.trim() !== ''
}

const refuseDuring = (operation: Operation | null): void => {
  if (operation !== null) throw new Refusal('operationInProgress', { op: operation })
}

// Before isPushed: with no HEAD, `branch -r --contains HEAD` fails and would read as pushed.
const refuseWithoutHead = async (git: Git, repo: string): Promise<void> => {
  if ((await git(repo, ['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true })).exitCode !== 0) throw new Refusal('noCommitYet')
}

export const commit = async (git: Git, repo: string, message: string, operation: Operation | null): Promise<void> => {
  if (message.trim() === '') throw new Refusal('emptyMessage')
  await refuseConflicts(git, repo)
  if (operation === null && !(await hasStaged(git, repo))) await change(git, repo, ['add', '-A'])
  await change(git, repo, ['commit', '-m', message])
}

export const amend = async (git: Git, repo: string, message: string, stagedCount: number, operation: Operation | null): Promise<void> => {
  refuseDuring(operation)
  await refuseWithoutHead(git, repo)
  if (message.trim() === '' && stagedCount === 0) throw new Refusal('nothingToAmend')
  if (await isPushed(git, repo)) throw new Refusal('pushed')
  await change(git, repo, message.trim() === '' ? ['commit', '--amend', '--no-edit'] : ['commit', '--amend', '-m', message])
}

export const undo = async (git: Git, repo: string, operation: Operation | null): Promise<string> => {
  refuseDuring(operation)
  await refuseWithoutHead(git, repo)
  if ((await git(repo, ['rev-parse', '--verify', '-q', 'HEAD~1'], { allowFail: true })).exitCode !== 0) throw new Refusal('firstCommit')
  if (await isPushed(git, repo)) throw new Refusal('pushed')
  const message = (await git(repo, ['log', '-1', '--format=%B'])).stdout.trim()
  await change(git, repo, ['reset', '--soft', 'HEAD~1'])
  return message
}

const allowConflict = async (git: Git, repo: string, args: readonly string[], options: GitOptions = {}): Promise<void> => {
  const r = await git(repo, args, { ...options, allowFail: true })
  if (r.exitCode !== 0 && !/^CONFLICT \(/m.test(`${r.stdout}\n${r.stderr}`)) throw new GitError(['git', ...args], r.exitCode, r.stderr || r.stdout)
}

export const pull = async (git: Git, repo: string, mode: PullMode): Promise<void> => {
  if (mode !== 'ff') return allowConflict(git, repo, ['pull', mode === 'merge' ? '--no-rebase' : '--rebase'], { timeoutMs: NETWORK_MS, network: true })
  const r = await git(repo, ['pull', '--ff-only'], { allowFail: true, timeoutMs: NETWORK_MS, network: true })
  if (r.exitCode === 0) return
  if (/fast-forward|diverg/i.test(r.stderr)) throw new Refusal('diverged')
  throw new GitError(['git', 'pull', '--ff-only'], r.exitCode, r.stderr)
}

export const push = async (git: Git, repo: string, branch: string | null, upstream: string | null, remotes: readonly string[]): Promise<void> => {
  if (upstream !== null) {
    await git(repo, ['push'], { timeoutMs: NETWORK_MS, network: true })
    return
  }
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  if (remote === undefined || branch === null) throw new Refusal('noRemote')
  await git(repo, ['push', '-u', remote, branch], { timeoutMs: NETWORK_MS, network: true })
}

export const fetchRemote = (git: Git, repo: string, interactive: boolean): Promise<GitResult> =>
  git(repo, ['fetch', '--prune', '--quiet'], { network: true, ...(interactive ? { timeoutMs: NETWORK_MS } : { timeoutMs: AUTO_FETCH_MS, env: { ...QUIET_ENV } }) })

export const switchBranch = (git: Git, repo: string, ref: BranchRef): Promise<GitResult> =>
  change(git, repo, ref.remote === null ? ['switch', '--', ref.name] : ['switch', '--track', ref.value])

export const isBlockedByChanges = (error: unknown): boolean =>
  error instanceof GitError && /would be overwritten|commit your changes or stash/i.test(error.stderr)

export const createBranch = async (git: Git, repo: string, name: string): Promise<void> => {
  if (name === '' || (await git(repo, ['check-ref-format', '--branch', name], { allowFail: true })).exitCode !== 0) throw new Refusal('invalidBranch')
  await change(git, repo, ['switch', '-c', name])
}

export const stashPush = (git: Git, repo: string, message: string): Promise<GitResult> =>
  change(git, repo, ['stash', 'push', '-u', ...(message.trim() === '' ? [] : ['-m', message.trim()])])

export const stashApply = (git: Git, repo: string, ref: string): Promise<void> => allowConflict(git, repo, ['stash', 'apply', ref], { timeoutMs: LOCAL_MS })
export const stashPop = (git: Git, repo: string, ref: string): Promise<void> => allowConflict(git, repo, ['stash', 'pop', ref], { timeoutMs: LOCAL_MS })
export const stashDrop = (git: Git, repo: string, ref: string): Promise<GitResult> => change(git, repo, ['stash', 'drop', ref])

// stash@{n} is a position: the list may have moved since it was read, so act only while the
// position still names the same commit.
export const checkStash = async (git: Git, repo: string, stash: Stash): Promise<void> => {
  const r = await git(repo, ['rev-parse', '--verify', '-q', stash.ref], { allowFail: true })
  if (r.exitCode !== 0 || r.stdout.trim() !== stash.hash) throw new Refusal('stashMoved')
}

export const readStashDiff = async (git: Git, repo: string, hash: string): Promise<DiffContent> => ({
  kind: 'diff',
  ...cutDiff((await git(repo, ['stash', 'show', '-p', '--include-untracked', hash])).stdout),
})

// With no operation (a `stash apply` or autostash conflict) the merge meaning holds: ours is HEAD.
export const sideFlag = (side: Side, operation: Operation | null): '--ours' | '--theirs' =>
  (operation === 'rebase') === (side === 'mine') ? '--theirs' : '--ours'

export const keepSide = async (git: Git, repo: string, path: string, side: Side, operation: Operation | null): Promise<void> => {
  await change(git, repo, ['checkout', sideFlag(side, operation), '--', path])
  await change(git, repo, ['add', '--', path])
}

const MARKER = /^(<{7}|={7}|>{7})(\s|$)/m

export const hasMarkers = (text: string): boolean => MARKER.test(text)

export const markResolved = async (git: Git, host: Host, repo: string, path: string): Promise<void> => {
  if (hasMarkers(await host.readText(join(repo, path)))) throw new Refusal('markersLeft')
  await change(git, repo, ['add', '--', path])
}

export const conflictExcerpt = (text: string): string => {
  const blocks: string[][] = []
  let current: string[] | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('<<<<<<<')) current = []
    if (current !== null) current.push(line)
    if (line.startsWith('>>>>>>>') && current !== null) {
      blocks.push(current)
      current = null
    }
  }
  return blocks.map(block => block.join('\n')).join('\n…\n')
}

const CONTINUE: Readonly<Record<Operation, readonly string[]>> = {
  merge: ['commit', '--no-edit'],
  rebase: ['-c', 'core.editor=true', 'rebase', '--continue'],
  'cherry-pick': ['-c', 'core.editor=true', 'cherry-pick', '--continue'],
}

export const conclude = (git: Git, repo: string, operation: Operation): Promise<void> => allowConflict(git, repo, CONTINUE[operation], { timeoutMs: LOCAL_MS })

export const abort = (git: Git, repo: string, operation: Operation): Promise<GitResult> => change(git, repo, [operation, '--abort'])

export const refName = async (git: Git, repo: string, ref: string): Promise<string> =>
  (await git(repo, ['name-rev', '--name-only', '--always', ref], { allowFail: true })).stdout.trim() || ref

export const readSides = async (git: Git, repo: string, operation: Operation, branch: string | null): Promise<{ mine: string; theirs: string }> => {
  const name = (ref: string): Promise<string> => refName(git, repo, ref)
  if (operation === 'rebase') return { mine: await name('REBASE_HEAD'), theirs: await name('HEAD') }
  return { mine: branch ?? (await name('HEAD')), theirs: await name(operation === 'merge' ? 'MERGE_HEAD' : 'CHERRY_PICK_HEAD') }
}
