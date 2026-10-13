import { test, expect } from 'claude-code/testing'
import type { FileChange } from '../types'
import { amend, commit, cutDiff, discard, readDiff, stage, undo, unstage } from '../hooks/git/actions'
import { fakeHost, scriptGit } from './helpers'

const change = (path: string, status: FileChange['status'], group: FileChange['group'], from: string | null = null): FileChange => ({ path, from, status, group })

test('stage, unstage (with the rename source) and before the first commit', async () => {
  const { git, lines } = scriptGit(() => undefined)
  await stage(git, '/r', [change('a b.ts', 'M', 'changes')])
  await stage(git, '/r', 'all')
  await unstage(git, '/r', [change('new.ts', 'R', 'staged', 'old.ts')], true)
  await unstage(git, '/r', 'all', false)
  expect(lines()).toEqual(['add -- a b.ts', 'diff --name-only --diff-filter=U', 'add -A', 'restore --staged -- new.ts old.ts', 'rm --cached -r -q -- .'])
})

test('discard restores tracked files and removes new ones', async () => {
  const { git, lines } = scriptGit(() => undefined)
  await discard(git, '/r', change('a.ts', 'M', 'changes'))
  await discard(git, '/r', change('novo.html', 'U', 'changes'))
  expect(lines()).toEqual(['restore --worktree -- a.ts', 'clean -f -- novo.html'])
})

test('diffs: staged, changes, binary, new file read from disk', async () => {
  const { git, lines } = scriptGit(args => (args.includes('img.png') ? { stdout: 'Binary files a/img.png and b/img.png differ\n' } : { stdout: '@@ -1 +1 @@\n-a\n+b\n' }))
  const host = fakeHost({ readText: async path => (path === '/r/new.txt' ? 'hello\n' : 'x\0y') })
  expect(await readDiff(git, host, '/r', change('a.ts', 'M', 'staged'))).toEqual({ kind: 'diff', text: '@@ -1 +1 @@\n-a\n+b\n', isCut: false })
  expect(await readDiff(git, host, '/r', change('img.png', 'M', 'changes'))).toEqual({ kind: 'binary' })
  expect(await readDiff(git, host, '/r', change('new.txt', 'U', 'changes'))).toEqual({ kind: 'text', text: 'hello\n', isCut: false })
  expect(await readDiff(git, host, '/r', change('bin.dat', 'U', 'changes'))).toEqual({ kind: 'binary' })
  expect(lines()).toEqual(['diff --cached -- a.ts', 'diff -- img.png'])
})

test('a big diff is cut at a hunk boundary at or before line 2000', () => {
  const hunk = (n: number) => ['@@ -1,1000 +1,1000 @@', ...Array.from({ length: 999 }, (_, i) => `+line ${n}-${i}`)]
  const text = [...hunk(1), ...hunk(2), ...hunk(3)].join('\n')
  const cut = cutDiff(text)
  expect(cut.isCut).toBe(true)
  expect(cut.text.split('\n')).toHaveLength(2000)
  expect(cutDiff('@@ -1 +1 @@\n+a').isCut).toBe(false)
})

test('commit refuses an empty message and stages everything when nothing is staged', async () => {
  let staged = false
  const { git, lines } = scriptGit(args => (args.join(' ') === 'diff --cached --quiet' && staged ? { exitCode: 1 } : undefined))
  await expect(commit(git, '/r', '  ', null)).rejects.toThrow('emptyMessage')
  await commit(git, '/r', 'feat: x', null)
  staged = true
  await commit(git, '/r', 'fix: y', null)
  expect(lines()).toEqual([
    'diff --name-only --diff-filter=U',
    'diff --cached --quiet',
    'add -A',
    'commit -m feat: x',
    'diff --name-only --diff-filter=U',
    'diff --cached --quiet',
    'commit -m fix: y',
  ])
})

test('commit refuses while unmerged paths exist and never stages everything during an operation', async () => {
  const conflicted = scriptGit(args => (args.join(' ') === 'diff --name-only --diff-filter=U' ? { stdout: 'f.txt\n' } : undefined))
  await expect(commit(conflicted.git, '/r', 'feat: x', null)).rejects.toThrow('conflictsLeft')
  await expect(commit(conflicted.git, '/r', 'feat: x', 'merge')).rejects.toThrow('conflictsLeft')
  expect(conflicted.lines().filter(l => l === 'add -A' || l.startsWith('commit'))).toEqual([])
  const { git, lines } = scriptGit(() => undefined)
  await commit(git, '/r', 'Merge feature', 'merge')
  expect(lines()).toEqual(['diff --name-only --diff-filter=U', 'commit -m Merge feature'])
})

test('a failed staged check stops the commit', async () => {
  const { git, lines } = scriptGit(args => (args.join(' ') === 'diff --cached --quiet' ? { exitCode: 128, stderr: 'fatal: broken index' } : undefined))
  await expect(commit(git, '/r', 'feat: x', null)).rejects.toThrow('fatal: broken index')
  expect(lines().filter(l => l === 'add -A' || l.startsWith('commit'))).toEqual([])
})

test('stage all refuses while unmerged paths exist', async () => {
  const conflicted = scriptGit(args => (args.join(' ') === 'diff --name-only --diff-filter=U' ? { stdout: 'f.txt\n' } : undefined))
  await expect(stage(conflicted.git, '/r', 'all')).rejects.toThrow('conflictsLeft')
  expect(conflicted.lines()).toEqual(['diff --name-only --diff-filter=U'])
})

test('amend: refusals, new message and keeping the message', async () => {
  const pushed = scriptGit(args => (args.join(' ') === 'branch -r --contains HEAD' ? { stdout: '  origin/main\n' } : undefined))
  await expect(amend(pushed.git, '/r', 'x', 1, null)).rejects.toThrow('pushed')
  const { git, lines } = scriptGit(() => undefined)
  await expect(amend(git, '/r', 'x', 1, 'merge')).rejects.toThrow('operationInProgress')
  await expect(amend(git, '/r', '', 0, null)).rejects.toThrow('nothingToAmend')
  await amend(git, '/r', 'feat: better', 0, null)
  await amend(git, '/r', '', 1, null)
  expect(lines().filter(l => l.startsWith('commit'))).toEqual(['commit --amend -m feat: better', 'commit --amend --no-edit'])
})

test('undo: refusals and the message coming back', async () => {
  const first = scriptGit(args => (args.join(' ') === 'rev-parse --verify -q HEAD~1' ? { exitCode: 1 } : undefined))
  await expect(undo(first.git, '/r', null)).rejects.toThrow('firstCommit')
  const pushed = scriptGit(args => (args[0] === 'branch' ? { stdout: '  origin/main\n' } : undefined))
  await expect(undo(pushed.git, '/r', null)).rejects.toThrow('pushed')
  const { git, lines } = scriptGit(args => (args[0] === 'log' ? { stdout: 'fix: typo\n\nbody\n' } : undefined))
  await expect(undo(git, '/r', 'rebase')).rejects.toThrow('operationInProgress')
  expect(await undo(git, '/r', null)).toBe('fix: typo\n\nbody')
  expect(lines()).toContain('reset --soft HEAD~1')
})

test('when git cannot tell whether HEAD was pushed, amend and undo assume it was', async () => {
  const broken = scriptGit(args => (args[0] === 'branch' ? { exitCode: 129, stderr: 'error: malformed object name HEAD' } : undefined))
  await expect(amend(broken.git, '/r', 'x', 1, null)).rejects.toThrow('pushed')
  await expect(undo(broken.git, '/r', null)).rejects.toThrow('pushed')
  expect(broken.lines().filter(l => l.startsWith('commit') || l.startsWith('reset'))).toEqual([])
})

test('with no commit yet, amend and undo say so instead of calling it pushed', async () => {
  const empty = scriptGit(args => {
    const line = args.join(' ')
    if (line.startsWith('rev-parse --verify -q HEAD')) return { exitCode: 1 }
    if (line === 'branch -r --contains HEAD') return { exitCode: 129, stderr: 'error: malformed object name HEAD' }
    return undefined
  })
  await expect(amend(empty.git, '/r', 'feat: x', 1, null)).rejects.toThrow('noCommitYet')
  await expect(amend(empty.git, '/r', '', 0, null)).rejects.toThrow('noCommitYet')
  await expect(undo(empty.git, '/r', null)).rejects.toThrow('noCommitYet')
  expect(empty.lines().filter(l => !l.startsWith('rev-parse --verify -q HEAD'))).toEqual([])
})
