import { test, expect } from 'claude-code/testing'
import { parseStatus, readStatus } from '../hooks/git/status'
import { dir, fakeHost, file, scriptGit } from './helpers'

const OUT = [
  '# branch.oid 1111111111111111111111111111111111111111',
  '# branch.head feature/x',
  '# branch.upstream origin/feature/x',
  '# branch.ab +2 -3',
  '1 .M N... 100644 100644 100644 aaa aaa docs/Configuração de Ações.md',
  '1 M. N... 100644 100644 100644 aaa bbb CHANGELOG.md',
  '1 MM N... 100644 100644 100644 aaa bbb src/both.ts',
  '1 D. N... 100644 000000 000000 aaa 000 gone.txt',
  '2 R. N... 100644 100644 100644 aaa aaa R100 new name.ts',
  'old name.ts',
  'u UU N... 100644 100644 100644 100644 h1 h2 h3 conflict file.ts',
  '? novo arquivo.html',
  '',
].join('\0')

test('reads branch, groups, renames, conflicts and paths with spaces and accents', () => {
  const { branch, files } = parseStatus(OUT)
  expect(branch).toEqual({
    head: 'feature/x',
    oid: '1111111111111111111111111111111111111111',
    upstream: 'origin/feature/x',
    ahead: 2,
    behind: 3,
  })
  expect(files).toEqual([
    { path: 'docs/Configuração de Ações.md', from: null, status: 'M', group: 'changes' },
    { path: 'CHANGELOG.md', from: null, status: 'M', group: 'staged' },
    { path: 'src/both.ts', from: null, status: 'M', group: 'staged' },
    { path: 'src/both.ts', from: null, status: 'M', group: 'changes' },
    { path: 'gone.txt', from: null, status: 'D', group: 'staged' },
    { path: 'new name.ts', from: 'old name.ts', status: 'R', group: 'staged' },
    { path: 'conflict file.ts', from: null, status: '!', group: 'conflicts' },
    { path: 'novo arquivo.html', from: null, status: 'U', group: 'changes' },
  ])
})

test('first commit, detached head and no upstream', () => {
  const { branch } = parseStatus(['# branch.oid (initial)', '# branch.head (detached)', ''].join('\0'))
  expect(branch).toEqual({ head: null, oid: null, upstream: null, ahead: 0, behind: 0 })
})

test('reads the operation in progress from the git directory', async () => {
  const { git } = scriptGit(args =>
    args[0] === 'status' ? { stdout: OUT } : args.join(' ') === 'rev-parse --absolute-git-dir' ? { stdout: '/r/.git\n' } : undefined,
  )
  const host = fakeHost({ list: async path => (path === '/r/.git' ? [dir('rebase-merge'), file('HEAD')] : []) })
  expect((await readStatus(git, host, '/r')).operation).toBe('rebase')
  const merging = fakeHost({ list: async () => [file('MERGE_HEAD')] })
  expect((await readStatus(git, merging, '/r')).operation).toBe('merge')
  const picking = fakeHost({ list: async () => [file('CHERRY_PICK_HEAD')] })
  expect((await readStatus(git, picking, '/r')).operation).toBe('cherry-pick')
  expect((await readStatus(git, fakeHost(), '/r')).operation).toBeNull()
})
