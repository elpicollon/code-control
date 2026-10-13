import { test, expect } from 'claude-code/testing'
import {
  abort, conclude, conflictExcerpt, createBranch, fetchRemote, hasMarkers, isBlockedByChanges, keepSide, markResolved,
  amend, checkStash, commit, discard, pull, push, readSides, readStashDiff, sideFlag, stage, stashApply, stashDrop, stashPop, stashPush, switchBranch,
  undo, unstage,
} from '../hooks/git/actions'
import { GitError } from '../hooks/errors'
import { fakeHost, scriptGit } from './helpers'

test('pull: fast-forward, divergence, merge with conflict and other failures', async () => {
  const ok = scriptGit(() => undefined)
  await pull(ok.git, '/r', 'ff')
  expect(ok.lines()).toEqual(['pull --ff-only'])
  const diverged = scriptGit(() => ({ exitCode: 128, stderr: 'fatal: Not possible to fast-forward, aborting.' }))
  await expect(pull(diverged.git, '/r', 'ff')).rejects.toThrow('diverged')
  const conflict = scriptGit(() => ({ exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in f.txt\n' }))
  await pull(conflict.git, '/r', 'merge')
  expect(conflict.lines()).toEqual(['pull --no-rebase'])
  const broken = scriptGit(() => ({ exitCode: 1, stderr: 'fatal: unable to access' }))
  await expect(pull(broken.git, '/r', 'rebase')).rejects.toThrow('fatal: unable to access')
})

test('push, publish and no remote', async () => {
  const { git, lines } = scriptGit(() => undefined)
  await push(git, '/r', 'main', 'origin/main', ['origin'])
  await push(git, '/r', 'feat/x', null, ['upstream', 'origin'])
  await push(git, '/r', 'feat/y', null, ['fork'])
  await expect(push(git, '/r', 'feat/z', null, [])).rejects.toThrow('noRemote')
  expect(lines()).toEqual(['push', 'push -u origin feat/x', 'push -u fork feat/y'])
})

test("automatic fetch turns git's own prompts off and gives up after 90 s", async () => {
  const { git, calls } = scriptGit(() => undefined)
  await fetchRemote(git, '/r', false)
  await fetchRemote(git, '/r', true)
  expect(calls.map(c => [c.args.join(' '), c.options.env, c.options.timeoutMs, c.options.network])).toEqual([
    ['fetch --prune --quiet', { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, 90_000, true],
    ['fetch --prune --quiet', undefined, 300_000, true],
  ])
})

test('pull and push run in the network pool', async () => {
  const { git, calls } = scriptGit(() => undefined)
  await pull(git, '/r', 'ff')
  await pull(git, '/r', 'rebase')
  await push(git, '/r', 'main', 'origin/main', ['origin'])
  await push(git, '/r', 'feat/x', null, ['origin'])
  expect(calls.map(c => [c.args[0], c.options.network, c.options.timeoutMs])).toEqual([
    ['pull', true, 300_000],
    ['pull', true, 300_000],
    ['push', true, 300_000],
    ['push', true, 300_000],
  ])
})

test('switch, track a remote branch, blocked switch and new branch', async () => {
  const { git, lines } = scriptGit(args => (args.join(' ') === 'check-ref-format --branch bad..name' ? { exitCode: 1 } : undefined))
  await switchBranch(git, '/r', { value: 'dev', name: 'dev', remote: null, isCurrent: false })
  await switchBranch(git, '/r', { value: 'origin/feat', name: 'feat', remote: 'origin', isCurrent: false })
  await expect(createBranch(git, '/r', 'bad..name')).rejects.toThrow('invalidBranch')
  await expect(createBranch(git, '/r', '')).rejects.toThrow('invalidBranch')
  await createBranch(git, '/r', 'feat/nova')
  expect(lines()).toEqual(['switch -- dev', 'switch --track origin/feat', 'check-ref-format --branch bad..name', 'check-ref-format --branch feat/nova', 'switch -c feat/nova'])
  expect(isBlockedByChanges(new GitError(['git'], 1, 'error: Your local changes to the following files would be overwritten by checkout:'))).toBe(true)
  expect(isBlockedByChanges(new GitError(['git'], 1, 'fatal: invalid reference'))).toBe(false)
})

test('stash push with and without message, apply with conflict, drop', async () => {
  const { git, lines } = scriptGit(args => (args[1] === 'apply' ? { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in a\n' } : undefined))
  await stashPush(git, '/r', '')
  await stashPush(git, '/r', ' antes de trocar ')
  await stashApply(git, '/r', 'stash@{0}')
  await stashDrop(git, '/r', 'stash@{1}')
  expect(lines()).toEqual(['stash push -u', 'stash push -u -m antes de trocar', 'stash apply stash@{0}', 'stash drop stash@{1}'])
})

test('a stash is acted on only while its position still holds the same hash', async () => {
  const { git, lines } = scriptGit(args => (args.join(' ') === 'rev-parse --verify -q stash@{1}' ? { stdout: 'bbb222\n' } : { exitCode: 1 }))
  await checkStash(git, '/r', { ref: 'stash@{1}', hash: 'bbb222', message: 'm', time: 0 })
  await expect(checkStash(git, '/r', { ref: 'stash@{1}', hash: 'aaa111', message: 'm', time: 0 })).rejects.toThrow('stashMoved')
  await expect(checkStash(git, '/r', { ref: 'stash@{4}', hash: 'ddd444', message: 'm', time: 0 })).rejects.toThrow('stashMoved')
  expect(lines()).toEqual(['rev-parse --verify -q stash@{1}', 'rev-parse --verify -q stash@{1}', 'rev-parse --verify -q stash@{4}'])
})

test('the stash diff is read by hash', async () => {
  const { git, lines } = scriptGit(() => ({ stdout: '@@ -1 +1 @@\n-a\n+b\n' }))
  expect(await readStashDiff(git, '/r', 'bbb222')).toEqual({ kind: 'diff', text: '@@ -1 +1 @@\n-a\n+b\n', isCut: false })
  expect(lines()).toEqual(['stash show -p --include-untracked bbb222'])
})

test('mine and theirs are swapped during a rebase', async () => {
  expect(sideFlag('mine', 'merge')).toBe('--ours')
  expect(sideFlag('theirs', 'merge')).toBe('--theirs')
  expect(sideFlag('mine', 'cherry-pick')).toBe('--ours')
  expect(sideFlag('mine', 'rebase')).toBe('--theirs')
  expect(sideFlag('theirs', 'rebase')).toBe('--ours')
  const { git, lines } = scriptGit(() => undefined)
  await keepSide(git, '/r', 'a b.ts', 'mine', 'rebase')
  expect(lines()).toEqual(['checkout --theirs -- a b.ts', 'add -- a b.ts'])
})

test('with no operation (a stash apply conflict) mine is HEAD and theirs the other side', async () => {
  expect(sideFlag('mine', null)).toBe('--ours')
  expect(sideFlag('theirs', null)).toBe('--theirs')
  const { git, lines } = scriptGit(() => undefined)
  await keepSide(git, '/r', 'a.ts', 'theirs', null)
  expect(lines()).toEqual(['checkout --theirs -- a.ts', 'add -- a.ts'])
})

test('mark resolved refuses while markers remain', async () => {
  const text = 'a\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> feat\nb\n'
  expect(hasMarkers(text)).toBe(true)
  expect(hasMarkers('a\n== title ==\nb')).toBe(false)
  expect(conflictExcerpt(text)).toBe('<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> feat')
  const { git, lines } = scriptGit(() => undefined)
  await expect(markResolved(git, fakeHost({ readText: async () => text }), '/r', 'a.ts')).rejects.toThrow('markersLeft')
  await markResolved(git, fakeHost({ readText: async () => 'clean\n' }), '/r', 'a.ts')
  expect(lines()).toEqual(['add -- a.ts'])
})

test('continue and abort per operation, and the two sides for the prompt', async () => {
  const { git, lines } = scriptGit(args => (args[0] === 'name-rev' ? { stdout: `${args[3]}-name\n` } : undefined))
  await conclude(git, '/r', 'merge')
  await conclude(git, '/r', 'rebase')
  await conclude(git, '/r', 'cherry-pick')
  await abort(git, '/r', 'cherry-pick')
  expect(lines()).toEqual([
    'commit --no-edit',
    '-c core.editor=true rebase --continue',
    '-c core.editor=true cherry-pick --continue',
    'cherry-pick --abort',
  ])
  expect(await readSides(git, '/r', 'merge', 'main')).toEqual({ mine: 'main', theirs: 'MERGE_HEAD-name' })
  expect(await readSides(git, '/r', 'rebase', null)).toEqual({ mine: 'REBASE_HEAD-name', theirs: 'HEAD-name' })
})

test('mutating local commands get 300 s; reads keep the default', async () => {
  const { git, calls } = scriptGit(args => {
    const line = args.join(' ')
    if (line === 'rev-parse --verify -q stash@{0}') return { stdout: 'abc\n' }
    if (line === 'log -1 --format=%B') return { stdout: 'msg\n' }
    if (line === 'diff --cached --quiet') return { exitCode: 0 }
    return undefined
  })
  const host = fakeHost({ readText: async () => 'clean\n' })
  const file = { path: 'a.ts', from: null, status: 'M', group: 'changes' } as const
  await stage(git, '/r', [file])
  await stage(git, '/r', 'all')
  await unstage(git, '/r', [{ ...file, group: 'staged' }], true)
  await unstage(git, '/r', 'all', false)
  await discard(git, '/r', file)
  await discard(git, '/r', { ...file, status: 'U' })
  await commit(git, '/r', 'feat: x', null)
  await amend(git, '/r', 'feat: y', 1, null)
  await undo(git, '/r', null)
  await switchBranch(git, '/r', { value: 'dev', name: 'dev', remote: null, isCurrent: false })
  await createBranch(git, '/r', 'feat/z')
  await stashPush(git, '/r', '')
  await checkStash(git, '/r', { ref: 'stash@{0}', hash: 'abc', message: '', time: 0 })
  await stashApply(git, '/r', 'stash@{0}')
  await stashPop(git, '/r', 'stash@{0}')
  await stashDrop(git, '/r', 'stash@{0}')
  await keepSide(git, '/r', 'a.ts', 'mine', 'merge')
  await markResolved(git, host, '/r', 'a.ts')
  for (const op of ['merge', 'rebase', 'cherry-pick'] as const) {
    await conclude(git, '/r', op)
    await abort(git, '/r', op)
  }
  const MUTATING = /^(-c core\.editor=true )?(add|rm|restore|clean|commit|reset|switch|checkout|stash (push|apply|pop|drop)|(merge|rebase|cherry-pick) --(continue|abort))\b/
  const slow = calls.filter(c => MUTATING.test(c.args.join(' ')))
  expect(slow.length).toBeGreaterThan(20)
  expect(slow.filter(c => c.options.timeoutMs !== 300_000).map(c => c.args.join(' '))).toEqual([])
  expect(calls.filter(c => !MUTATING.test(c.args.join(' ')) && c.options.timeoutMs !== undefined).map(c => c.args.join(' '))).toEqual([])
})

test('only a line starting "CONFLICT (" counts as a conflict', async () => {
  const conflict = scriptGit(() => ({ exitCode: 1, stdout: 'Auto-merging f.txt\nCONFLICT (modify/delete): f.txt deleted in HEAD\n' }))
  await pull(conflict.git, '/r', 'merge')
  const mention = scriptGit(() => ({ exitCode: 1, stderr: 'hint: see the NO-CONFLICT notes\nfatal: CONFLICTS file is locked' }))
  await expect(pull(mention.git, '/r', 'merge')).rejects.toThrow('fatal: CONFLICTS file is locked')
})
