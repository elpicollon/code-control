import type { Commit, CommitFile, IncomingCommit } from '../../types'
import type { Git } from './run'

export const LOG_FORMAT = '--format=%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ct%x1f%D%x1f%s'
export const PAGE = 50

const parseHeader = (line: string): Commit | null => {
  const [hash = '', short = '', parents = '', author = '', time = '0', refs = '', subject = ''] = line.split('\x1f')
  if (hash === '') return null
  return {
    hash,
    short,
    parents: parents.split(' ').filter(Boolean),
    author,
    time: Number(time),
    refs: refs.split(', ').filter(Boolean),
    subject,
  }
}

export const parseFiles = (lines: readonly string[]): CommitFile[] =>
  lines
    .filter(line => line.trim() !== '')
    .map(line => {
      const parts = line.split('\t')
      return { status: (parts[0] ?? '').charAt(0), path: parts[parts.length - 1] ?? '' }
    })

export const parseLog = (out: string): IncomingCommit[] =>
  out
    .split('\x1e')
    .map(chunk => chunk.replace(/^\n+/, ''))
    .filter(chunk => chunk !== '')
    .flatMap(chunk => {
      const [head = '', ...rest] = chunk.split('\n')
      const commit = parseHeader(head)
      return commit === null ? [] : [{ ...commit, files: parseFiles(rest) }]
    })

export const readIncoming = async (git: Git, repo: string, upstream: string | null): Promise<IncomingCommit[]> => {
  if (upstream === null) return []
  const r = await git(repo, ['log', LOG_FORMAT, '--name-status', `-n${PAGE}`, 'HEAD..@{u}'], { allowFail: true })
  return r.exitCode === 0 ? parseLog(r.stdout) : []
}

export const readHistory = async (git: Git, repo: string, upstream: string | null, skip: number, count = PAGE): Promise<Commit[]> => {
  // --ignore-missing: once the remote branch is deleted and pruned, `@{u}` no longer resolves and
  // would fail the whole log.
  const args = ['log', '--topo-order', LOG_FORMAT, `-n${count}`, `--skip=${skip}`, '--ignore-missing', 'HEAD', ...(upstream === null ? [] : ['@{u}'])]
  const r = await git(repo, args, { allowFail: true })
  return r.exitCode === 0
    ? parseLog(r.stdout).map(c => ({ hash: c.hash, short: c.short, parents: c.parents, author: c.author, time: c.time, refs: c.refs, subject: c.subject }))
    : []
}

export const readCommitFiles = async (git: Git, repo: string, hash: string): Promise<CommitFile[]> =>
  parseFiles((await git(repo, ['show', '--name-status', '--format=', hash])).stdout.split('\n'))

export const readCommitFileDiff = async (git: Git, repo: string, hash: string, path: string): Promise<string> =>
  (await git(repo, ['show', '--format=', hash, '--', path])).stdout
