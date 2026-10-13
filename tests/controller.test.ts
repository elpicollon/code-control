import { test, expect } from 'claude-code/testing'
import type { Details, RepoSnapshot, UiState } from '../types'
import { createController, emptyDetails, emptyUi } from '../hooks/controller'
import type { Host } from '../hooks/host'
import { translator } from '../hooks/i18n'
import { dir, fakeHost, file, memoryStore, scriptGit, type Script } from './helpers'

const STATUS = ['# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +0 -0', '1 .M N... 100644 100644 100644 a a src/app.ts', ''].join('\0')

const BASE: Script = args => {
  const line = args.join(' ')
  if (line === 'rev-parse --show-toplevel') return { stdout: '/w/app\n' }
  if (line === 'rev-parse --absolute-git-dir') return { stdout: '/w/app/.git\n' }
  if (line.startsWith('status ')) return { stdout: STATUS }
  if (line.startsWith('for-each-ref')) return { stdout: 'refs/heads/main\x1f*\nrefs/heads/dev\x1f \n' }
  if (line === 'remote') return { stdout: 'origin\n' }
  return undefined
}

const TREE = async (path: string) => (path === '/w' ? [dir('app')] : path === '/w/app' ? [dir('.git')] : [])

const setup = (extra: Script = () => undefined, hostOver: Partial<Host> = {}) => {
  const { git, calls, lines } = scriptGit(async (args, cwd) => (await extra(args, cwd)) ?? BASE(args, cwd))
  const host = fakeHost({ list: TREE, ...hostOver })
  const repos = memoryStore<RepoSnapshot[]>([])
  const ui = memoryStore<UiState>(emptyUi())
  const details = memoryStore<Details>(emptyDetails())
  const controller = createController({ git, host, t: translator('en'), model: 'sonnet', roots: async () => ['/w'], repos, ui, details })
  return { controller, actions: controller.actions, calls, lines, host, repos, ui, details }
}

test('refreshAll discovers and reads every repository', async () => {
  const { controller, repos } = setup()
  await controller.refreshAll(true)
  const [s] = repos.get()
  expect(s?.repo).toEqual({ path: '/w/app', name: 'app', label: 'app' })
  expect(s?.branch.head).toBe('main')
  expect(s?.files).toEqual([{ path: 'src/app.ts', from: null, status: 'M', group: 'changes' }])
  expect(s?.branches.map(b => b.name)).toEqual(['main', 'dev'])
  expect(s?.remotes).toEqual(['origin'])
})

test('discoveries asked for at the same time share one scan', async () => {
  const { controller, lines, repos } = setup()
  await Promise.all([controller.refreshAll(true), controller.startRefresh(true), controller.refreshAll(true)])
  expect(lines().filter(l => l === 'rev-parse --show-toplevel')).toHaveLength(1)
  expect(repos.get().map(s => s.repo.path)).toEqual(['/w/app'])
})

test('select keeps the chosen repository in the UI state and runs no git', async () => {
  const { controller, actions, ui, lines } = setup()
  await controller.refreshAll(true)
  const before = lines().length
  expect(ui.get().selected).toBeNull()
  await actions.select('/w/app')
  expect(ui.get().selected).toBe('/w/app')
  expect(lines()).toHaveLength(before)
})

test('commit without a message reports and runs no git commit', async () => {
  const { controller, actions, ui, lines } = setup()
  await controller.refreshAll(true)
  await actions.commit('/w/app')
  expect(ui.get().errors['/w/app']).toBe('Write the commit message.')
  expect(ui.get().busy['/w/app']).toBeUndefined()
  expect(lines().some(l => l.startsWith('commit'))).toBe(false)
})

test('commit stages everything when nothing is staged and clears the draft', async () => {
  const { controller, actions, ui, lines } = setup()
  await controller.refreshAll(true)
  await actions.setDraft('/w/app', 'feat: x')
  await actions.commit('/w/app')
  expect(lines()).toContain('add -A')
  expect(lines()).toContain('commit -m feat: x')
  expect(ui.get().drafts['/w/app']).toBe('')
})

test('discard needs a second press', async () => {
  const { controller, actions, ui, lines, repos } = setup()
  await controller.refreshAll(true)
  const target = repos.get()[0]!.files[0]!
  await actions.discard('/w/app', target)
  expect(lines()).not.toContain('restore --worktree -- src/app.ts')
  expect(ui.get().confirm?.key).toBe('discard|/w/app|changes|src/app.ts')
  await actions.discard('/w/app', target)
  expect(lines()).toContain('restore --worktree -- src/app.ts')
  expect(ui.get().confirm).toBeNull()
})

test('a pull that cannot fast-forward offers merge or rebase', async () => {
  const { controller, actions, ui, lines } = setup(args =>
    args.join(' ') === 'pull --ff-only' ? { exitCode: 128, stderr: 'fatal: Not possible to fast-forward, aborting.' } : undefined,
  )
  await controller.refreshAll(true)
  await actions.pull('/w/app', 'ff')
  expect(ui.get().diverged['/w/app']).toBe(true)
  expect(ui.get().errors['/w/app']).toBeUndefined()
  await actions.pull('/w/app', 'merge')
  expect(lines()).toContain('pull --no-rebase')
  expect(ui.get().diverged['/w/app']).toBeUndefined()
})

test('undo puts the undone message back in the field', async () => {
  const { controller, actions, ui, lines } = setup(args => (args.join(' ') === 'log -1 --format=%B' ? { stdout: 'fix: typo\n' } : undefined))
  await controller.refreshAll(true)
  await actions.undo('/w/app')
  expect(lines()).toContain('reset --soft HEAD~1')
  expect(ui.get().drafts['/w/app']).toBe('fix: typo')
})

test('amend on a repository with no commits says there is none yet', async () => {
  const { controller, actions, ui, lines } = setup(args => {
    const line = args.join(' ')
    if (line === 'rev-parse --verify -q HEAD') return { exitCode: 1 }
    if (line === 'branch -r --contains HEAD') return { exitCode: 129, stderr: 'error: malformed object name HEAD' }
    return undefined
  })
  await controller.refreshAll(true)
  await actions.setDraft('/w/app', 'feat: first')
  await actions.amend('/w/app')
  expect(ui.get().errors['/w/app']).toBe('There is no commit to change yet.')
  expect(translator('pt-BR')('noCommitYet')).toBe('Ainda não há commit para mudar.')
  expect(lines().some(l => l.startsWith('commit'))).toBe(false)
})

test('automatic fetch is quiet and a failure becomes a warning', async () => {
  const { controller, ui, calls } = setup(args => (args[0] === 'fetch' ? { exitCode: 128, stderr: 'fatal: Authentication failed' } : undefined))
  await controller.refreshAll(true)
  await controller.fetchAll(false)
  expect(calls.find(c => c.args[0] === 'fetch')?.options.env).toEqual({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' })
  expect(ui.get().fetchErrors['/w/app']).toBe('fetch failed: fatal: Authentication failed')
  expect(ui.get().lastFetchAt).toBe(1_800_000_000_000)
})

test('a blocked switch offers stash and switch', async () => {
  let attempts = 0
  const { controller, actions, ui, lines } = setup(args => {
    if (args.join(' ') !== 'switch -- dev') return undefined
    attempts += 1
    return attempts === 1 ? { exitCode: 1, stderr: 'error: Your local changes to the following files would be overwritten by checkout:' } : undefined
  })
  await controller.refreshAll(true)
  await actions.switchBranch('/w/app', 'dev')
  expect(ui.get().blockedSwitch['/w/app']).toBe('dev')
  await actions.stashAndSwitch('/w/app')
  expect(lines()).toContain('stash push -u -m before switching to dev')
  expect(lines().filter(l => l === 'switch -- dev')).toHaveLength(2)
  expect(ui.get().blockedSwitch['/w/app']).toBeUndefined()
})

test('resolve with Claude submits the prompt with both sides', async () => {
  const conflicted = ['# branch.oid abc', '# branch.head main', 'u UU N... 100644 100644 100644 100644 a b c src/app.ts', ''].join('\0')
  const { controller, actions, host } = setup(
    args => {
      const line = args.join(' ')
      if (line.startsWith('status ')) return { stdout: conflicted }
      if (line === 'name-rev --name-only --always MERGE_HEAD') return { stdout: 'feature/x\n' }
      return undefined
    },
    { list: async path => (path === '/w/app/.git' ? [file('MERGE_HEAD')] : TREE(path)) },
  )
  await controller.refreshAll(true)
  await actions.resolveWithClaude('/w/app', 'src/app.ts')
  expect(host.submitted).toHaveLength(1)
  expect(host.submitted[0]).toContain('`src/app.ts`')
  expect(host.submitted[0]).toContain('"mine" is main and "theirs" is feature/x')
})

test('conflicts with no operation (stash apply): keep and resolve with Claude still work', async () => {
  const conflicted = ['# branch.oid abc', '# branch.head main', 'u UU N... 100644 100644 100644 100644 a b c src/app.ts', ''].join('\0')
  const { controller, actions, host, lines, repos } = setup(args => (args.join(' ').startsWith('status ') ? { stdout: conflicted } : undefined))
  await controller.refreshAll(true)
  expect(repos.get()[0]!.operation).toBeNull()
  await actions.keep('/w/app', 'src/app.ts', 'theirs')
  await actions.keep('/w/app', 'src/app.ts', 'theirs')
  expect(lines()).toContain('checkout --theirs -- src/app.ts')
  expect(lines()).toContain('add -- src/app.ts')
  await actions.resolveWithClaude('/w/app', 'src/app.ts')
  expect(host.submitted).toHaveLength(1)
  expect(host.submitted[0]).toContain('"mine" is main and "theirs" is the other side.')
  expect(host.submitted[0]).not.toContain('in progress')
})

test('keep mine and keep theirs need a second press of the same side', async () => {
  const conflicted = ['# branch.oid abc', '# branch.head main', 'u UU N... 100644 100644 100644 100644 a b c src/app.ts', ''].join('\0')
  const { controller, actions, ui, lines } = setup(args => (args.join(' ').startsWith('status ') ? { stdout: conflicted } : undefined), {
    list: async path => (path === '/w/app/.git' ? [file('MERGE_HEAD')] : TREE(path)),
  })
  await controller.refreshAll(true)
  await actions.keep('/w/app', 'src/app.ts', 'mine')
  expect(ui.get().confirm?.key).toBe('keep|/w/app|src/app.ts|mine')
  await actions.keep('/w/app', 'src/app.ts', 'theirs')
  expect(ui.get().confirm?.key).toBe('keep|/w/app|src/app.ts|theirs')
  expect(lines().filter(l => l.startsWith('checkout'))).toEqual([])
  await actions.keep('/w/app', 'src/app.ts', 'theirs')
  expect(lines().filter(l => l.startsWith('checkout'))).toEqual(['checkout --theirs -- src/app.ts'])
  expect(ui.get().confirm).toBeNull()
})

test('toggleDiff loads the diff and a second toggle closes it', async () => {
  const { controller, actions, ui, details, repos } = setup(args => (args.join(' ') === 'diff -- src/app.ts' ? { stdout: '@@ -1 +1 @@\n-a\n+b\n' } : undefined))
  await controller.refreshAll(true)
  const target = repos.get()[0]!.files[0]!
  await actions.toggleDiff('/w/app', target)
  expect(details.get().diffs['diff|/w/app|changes|src/app.ts']).toEqual({ kind: 'diff', text: '@@ -1 +1 @@\n-a\n+b\n', isCut: false })
  await actions.toggleDiff('/w/app', target)
  expect(details.get().diffs['diff|/w/app|changes|src/app.ts']).toBeUndefined()
  expect(ui.get().open['diff|/w/app|changes|src/app.ts']).toBe(false)
})

test('a busy repository ignores a second action', async () => {
  let release: () => void = () => undefined
  const held = new Promise<undefined>(resolve => {
    release = () => resolve(undefined)
  })
  const { controller, actions, lines } = setup(args => (args.join(' ') === 'push' ? held : undefined))
  await controller.refreshAll(true)
  await actions.setDraft('/w/app', 'feat: x')
  const first = actions.push('/w/app')
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
  await actions.commit('/w/app')
  release()
  await first
  expect(lines().filter(l => l.startsWith('commit'))).toHaveLength(0)
})

test('new branch from the selector opens the field without touching git', async () => {
  const { controller, actions, ui, lines } = setup()
  await controller.refreshAll(true)
  const before = lines().length
  await actions.switchBranch('/w/app', '__code_control_new_branch__')
  expect(ui.get().open['newbranch|/w/app']).toBe(true)
  expect(lines()).toHaveLength(before)
})

test('two pushes in the same tick run git push once', async () => {
  let release: () => void = () => undefined
  const held = new Promise<undefined>(resolve => {
    release = () => resolve(undefined)
  })
  const { controller, actions, lines } = setup(args => (args.join(' ') === 'push' ? held : undefined))
  await controller.refreshAll(true)
  const a = actions.push('/w/app')
  const b = actions.push('/w/app')
  release()
  await Promise.all([a, b])
  expect(lines().filter(l => l === 'push')).toHaveLength(1)
})

test('busy stays set until the status refresh after the action finishes', async () => {
  let statusRuns = 0
  let release: () => void = () => undefined
  const held = new Promise<undefined>(resolve => {
    release = () => resolve(undefined)
  })
  const { controller, actions, ui } = setup(args => {
    if (!args.join(' ').startsWith('status ')) return undefined
    statusRuns += 1
    return statusRuns === 2 ? held.then(() => ({ stdout: STATUS })) : undefined
  })
  await controller.refreshAll(true)
  const run = actions.push('/w/app')
  for (let i = 0; i < 50; i += 1) await Promise.resolve()
  expect(statusRuns).toBe(2)
  expect(ui.get().busy['/w/app']).toBe('push')
  release()
  await run
  expect(ui.get().busy['/w/app']).toBeUndefined()
})

test('open diffs of files that changed group are pruned on refresh', async () => {
  const STAGED = STATUS.replace('1 .M', '1 M.')
  let moved = false
  const { controller, actions, ui, details, repos } = setup(args => {
    if (args.join(' ') === 'diff -- src/app.ts') return { stdout: '@@ -1 +1 @@\n-a\n+b\n' }
    if (args.join(' ').startsWith('status ') && moved) return { stdout: STAGED }
    return undefined
  })
  await controller.refreshAll(true)
  await actions.toggleDiff('/w/app', repos.get()[0]!.files[0]!)
  const key = 'diff|/w/app|changes|src/app.ts'
  expect(ui.get().open[key]).toBe(true)
  moved = true
  await controller.refreshRepo('/w/app')
  expect(repos.get()[0]!.files[0]!.group).toBe('staged')
  expect(ui.get().open[key]).toBeUndefined()
  expect(details.get().diffs[key]).toBeUndefined()
})

test('a commit whose files fail to load stays closed and reports the error', async () => {
  const { controller, actions, ui } = setup(args =>
    args.join(' ') === 'show --name-status --format= abc123' ? { exitCode: 128, stderr: 'fatal: bad object abc123' } : undefined,
  )
  await controller.refreshAll(true)
  await actions.toggleCommit('/w/app', 'abc123')
  expect(ui.get().open['commit|/w/app|abc123']).not.toBe(true)
  expect(ui.get().errors['/w/app']).toContain('bad object')
})

test('commit checks conflicts and staged changes fresh, not from the snapshot', async () => {
  let unmerged = ''
  let stagedExit = 0
  const { controller, actions, ui, lines } = setup(args => {
    const line = args.join(' ')
    if (line === 'diff --name-only --diff-filter=U') return { stdout: unmerged }
    if (line === 'diff --cached --quiet') return { exitCode: stagedExit }
    return undefined
  })
  await controller.refreshAll(true)
  unmerged = 'src/app.ts\n'
  await actions.setDraft('/w/app', 'feat: x')
  await actions.commit('/w/app')
  expect(ui.get().errors['/w/app']).toBe('Resolve the conflicts first.')
  expect(lines().filter(l => l === 'add -A' || l.startsWith('commit'))).toEqual([])
  await actions.stage('/w/app', 'all')
  expect(ui.get().errors['/w/app']).toBe('Resolve the conflicts first.')
  expect(lines()).not.toContain('add -A')
  unmerged = ''
  stagedExit = 1
  await actions.commit('/w/app')
  expect(lines()).not.toContain('add -A')
  expect(lines()).toContain('commit -m feat: x')
})

test('commit during a merge never stages everything', async () => {
  const { controller, actions, lines } = setup(undefined, { list: async path => (path === '/w/app/.git' ? [file('MERGE_HEAD')] : TREE(path)) })
  await controller.refreshAll(true)
  await actions.setDraft('/w/app', 'Merge dev')
  await actions.commit('/w/app')
  expect(lines()).not.toContain('add -A')
  expect(lines()).toContain('commit -m Merge dev')
})

test('stash actions refuse when the list moved since it was read', async () => {
  const list = 'stash@{0}\x1fOn main: one\x1f1799000000\x1faaa111\nstash@{1}\x1fOn main: two\x1f1798000000\x1fbbb222\n'
  let at1 = 'bbb222'
  const { controller, actions, ui, lines, repos } = setup(args => {
    const line = args.join(' ')
    if (line.startsWith('stash list')) return { stdout: list }
    if (line === 'rev-parse --verify -q stash@{1}') return { stdout: `${at1}\n` }
    return undefined
  })
  await controller.refreshAll(true)
  const two = repos.get()[0]!.stashes[1]!
  expect(two).toEqual({ ref: 'stash@{1}', hash: 'bbb222', message: 'two', time: 1798000000 })
  at1 = 'ccc333'
  await actions.stashApply('/w/app', two)
  await actions.stashPop('/w/app', two)
  await actions.stashDrop('/w/app', two)
  expect(ui.get().confirm?.key).toBe('drop|/w/app|bbb222')
  await actions.stashDrop('/w/app', two)
  expect(ui.get().errors['/w/app']).toBe('The stash list changed. Refresh and try again.')
  expect(lines().filter(l => /^stash (apply|pop|drop)/.test(l))).toEqual([])
  at1 = 'bbb222'
  await actions.stashApply('/w/app', two)
  expect(lines()).toContain('stash apply stash@{1}')
})

test('an open stash diff is keyed by hash and pruned when that stash is gone', async () => {
  let list = 'stash@{0}\x1fOn main: one\x1f1799000000\x1faaa111\n'
  const { controller, actions, ui, details, repos } = setup(args => {
    const line = args.join(' ')
    if (line.startsWith('stash list')) return { stdout: list }
    if (line === 'stash show -p --include-untracked aaa111') return { stdout: '@@ -1 +1 @@\n-a\n+b\n' }
    return undefined
  })
  await controller.refreshAll(true)
  await actions.toggleStashDiff('/w/app', repos.get()[0]!.stashes[0]!)
  const key = 'stash|/w/app|aaa111'
  expect(ui.get().open[key]).toBe(true)
  expect(details.get().diffs[key]).toEqual({ kind: 'diff', text: '@@ -1 +1 @@\n-a\n+b\n', isCut: false })
  list = 'stash@{0}\x1fOn main: newer\x1f1799500000\x1fddd444\n'
  await controller.refreshRepo('/w/app')
  expect(ui.get().open[key]).toBeUndefined()
  expect(details.get().diffs[key]).toBeUndefined()
})

test('a refresh whose discovery fails settles instead of rejecting', async () => {
  const { git } = scriptGit(() => undefined)
  const controller = createController({
    git,
    host: fakeHost(),
    t: translator('en'),
    model: 'sonnet',
    roots: async () => Promise.reject(new Error('no session folder')),
    repos: memoryStore<RepoSnapshot[]>([]),
    ui: memoryStore<UiState>(emptyUi()),
    details: memoryStore<Details>(emptyDetails()),
  })
  await expect(controller.actions.refresh()).resolves.toBeUndefined()
})

test('a refresh re-reads open diffs and leaves closed ones alone', async () => {
  let diff = '@@ -1 +1 @@\n-a\n+b\n'
  const { controller, actions, details, lines, repos } = setup(args => (args.join(' ') === 'diff -- src/app.ts' ? { stdout: diff } : undefined))
  await controller.refreshAll(true)
  await actions.toggleDiff('/w/app', repos.get()[0]!.files[0]!)
  diff = '@@ -1 +1 @@\n-a\n+c\n'
  await controller.refreshRepo('/w/app')
  expect(details.get().diffs['diff|/w/app|changes|src/app.ts']).toEqual({ kind: 'diff', text: diff, isCut: false })
  await actions.toggleDiff('/w/app', repos.get()[0]!.files[0]!)
  const reads = lines().filter(l => l === 'diff -- src/app.ts').length
  await controller.refreshRepo('/w/app')
  expect(lines().filter(l => l === 'diff -- src/app.ts').length).toBe(reads)
  expect(details.get().diffs['diff|/w/app|changes|src/app.ts']).toBeUndefined()
})

test('a refresh re-reads an open conflict excerpt', async () => {
  const conflicted = ['# branch.oid abc', '# branch.head main', 'u UU N... 100644 100644 100644 100644 a b c src/app.ts', ''].join('\0')
  let text = 'x\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> dev\n'
  const { controller, actions, details } = setup(args => (args.join(' ').startsWith('status ') ? { stdout: conflicted } : undefined), {
    readText: async () => text,
  })
  await controller.refreshAll(true)
  await actions.toggleConflict('/w/app', 'src/app.ts')
  text = 'x\n<<<<<<< HEAD\nmine 2\n=======\ntheirs\n>>>>>>> dev\n'
  await controller.refreshRepo('/w/app')
  expect(details.get().diffs['conflict|/w/app|src/app.ts']).toEqual({ kind: 'text', text: '<<<<<<< HEAD\nmine 2\n=======\ntheirs\n>>>>>>> dev', isCut: false })
})

test('a refresh re-reads every loaded page of the open history', async () => {
  const commits = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => `\x1e${tag}${i}\x1f${tag}${i}\x1f\x1fAna\x1f1799990000\x1f\x1fcommit ${i}\n`).join('')
  let tag = 'a'
  const { controller, actions, details, lines } = setup(args => {
    if (args[0] !== 'log' || args[1] !== '--topo-order') return undefined
    const n = Number((args.find(a => a.startsWith('-n')) ?? '-n0').slice(2))
    const skip = Number((args.find(a => a.startsWith('--skip=')) ?? '--skip=0').slice('--skip='.length))
    return { stdout: commits(Math.min(n, 120 - skip), tag).replace(new RegExp(`${tag}(\\d+)`, 'g'), (_, i: string) => `${tag}${Number(i) + skip}`) }
  })
  await controller.refreshAll(true)
  await actions.toggleHistory('/w/app')
  await actions.loadMore('/w/app')
  expect(details.get().history['/w/app']).toHaveLength(100)
  tag = 'b'
  await controller.refreshRepo('/w/app')
  expect(lines().filter(l => l.startsWith('log --topo-order')).pop()).toContain('-n100 --skip=0')
  expect(details.get().history['/w/app']).toHaveLength(100)
  expect(details.get().history['/w/app']![99]!.hash).toBe('b99')
})
