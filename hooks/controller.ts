import type { Details, DiffContent, FileChange, Repo, RepoSnapshot, Stash, UiState } from '../types'
import { generateCommitMessage } from './ai/commit-message'
import { buildResolvePrompt } from './ai/conflict-prompt'
import { Refusal } from './errors'
import * as ops from './git/actions'
import { discoverRepos } from './git/discover'
import { PAGE, readCommitFileDiff, readCommitFiles, readHistory, readIncoming } from './git/log'
import { parseSshConfig, readBranches, readRemotes, readStashes, readWebUrl, type ResolveSsh } from './git/refs'
import type { Git } from './git/run'
import { readOperation, readStatus } from './git/status'
import type { Host, Store } from './host'
import { opLabel, type T } from './i18n'
import { join } from './paths'
import { NEW_BRANCH, OTHER_BRANCHES, type Actions } from './ui/kit'

export type Deps = {
  git: Git
  host: Host
  t: T
  model: string
  roots: () => Promise<string[]>
  repos: Store<RepoSnapshot[]>
  ui: Store<UiState>
  details: Store<Details>
}

export const CONFIRM_MS = 4_000

export const emptyUi = (): UiState => ({
  open: {},
  drafts: {},
  branchDrafts: {},
  branchFilters: {},
  busy: {},
  errors: {},
  fetchErrors: {},
  diverged: {},
  blockedSwitch: {},
  confirm: null,
  lastFetchAt: null,
  selected: null,
})

export const emptyDetails = (): Details => ({ diffs: {}, history: {}, commitFiles: {} })

const without = <V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> => {
  const copy = { ...record }
  delete copy[key]
  return copy
}

const blank = (repo: Repo): RepoSnapshot => ({
  repo,
  branch: { head: null, oid: null, upstream: null, ahead: 0, behind: 0 },
  files: [],
  operation: null,
  incoming: [],
  stashes: [],
  branches: [],
  remotes: [],
  webUrl: null,
})

const stagedCount = (s: RepoSnapshot): number => s.files.filter(f => f.group === 'staged').length

export const createController = (deps: Deps) => {
  const { git, host, t } = deps

  const describe = (error: unknown): string => {
    if (error instanceof Refusal) {
      const op = error.vars.op
      const vars = op === 'merge' || op === 'rebase' || op === 'cherry-pick' ? { ...error.vars, op: opLabel(t, op).toLowerCase() } : error.vars
      return t(error.key, vars)
    }
    return error instanceof Error ? error.message : String(error)
  }

  const setUi = (fn: (ui: UiState) => UiState): Promise<void> => deps.ui.update(fn)
  const setOpen = (key: string, value: boolean): Promise<void> => setUi(ui => ({ ...ui, open: { ...ui.open, [key]: value } }))
  const setError = (path: string, error: unknown): Promise<void> => setUi(ui => ({ ...ui, errors: { ...ui.errors, [path]: describe(error) } }))
  const setDraft = (path: string, text: string): Promise<void> => setUi(ui => ({ ...ui, drafts: { ...ui.drafts, [path]: text } }))
  const draftOf = async (path: string): Promise<string> => (await deps.ui.read()).drafts[path] ?? ''
  const snapshot = async (path: string): Promise<RepoSnapshot | undefined> => (await deps.repos.read()).find(s => s.repo.path === path)
  const fileId = (path: string, f: FileChange): string => `${path}|${f.group}|${f.path}`

  // An SSH host as ~/.ssh/config resolves it (`ssh -G` only reads the config; it connects nowhere),
  // asked once per host for the module's life; null where ssh is missing or says nothing.
  const sshHosts = new Map<string, ReturnType<ResolveSsh>>()
  const resolveSsh = (alias: string, cwd: string): ReturnType<ResolveSsh> => {
    const known = sshHosts.get(alias)
    if (known !== undefined) return known
    const asked = host
      .run(['ssh', '-G', alias], { cwd, timeoutMs: 5_000 })
      .then(r => (r.exitCode === 0 ? parseSshConfig(r.stdout) : null))
      .catch(() => null)
    sshHosts.set(alias, asked)
    return asked
  }

  const readSnapshot = async (repo: Repo): Promise<RepoSnapshot> => {
    const { branch, files, operation } = await readStatus(git, host, repo.path)
    const remotes = await readRemotes(git, repo.path)
    return {
      repo,
      branch,
      files,
      operation,
      incoming: await readIncoming(git, repo.path, branch.upstream),
      stashes: await readStashes(git, repo.path),
      branches: await readBranches(git, repo.path),
      remotes,
      webUrl: await readWebUrl(git, repo.path, remotes, branch.upstream, alias => resolveSsh(alias, repo.path)),
    }
  }

  const prune = async (path: string, next: RepoSnapshot): Promise<void> => {
    const stale = (key: string): boolean => {
      const [kind, repo, a, b] = key.split('|')
      if (repo !== path) return false
      if (kind === 'diff') return a !== undefined && b !== undefined && !next.files.some(f => f.group === a && f.path === key.slice(`diff|${path}|${a}|`.length))
      if (kind === 'conflict') return a !== undefined && !next.files.some(f => f.group === 'conflicts' && f.path === key.slice(`conflict|${path}|`.length))
      if (kind === 'stash') return a !== undefined && !next.stashes.some(s => s.hash === a)
      return false
    }
    await setUi(ui => ({ ...ui, open: Object.fromEntries(Object.entries(ui.open).filter(([k]) => !stale(k))) }))
    await deps.details.update(d => ({ ...d, diffs: Object.fromEntries(Object.entries(d.diffs).filter(([k]) => !stale(k))) }))
  }

  const readConflict = async (path: string, target: string): Promise<DiffContent> => ({
    kind: 'text',
    text: ops.conflictExcerpt(await host.readText(join(path, target))),
    isCut: false,
  })

  // What is open on screen follows the files: open diffs and conflict excerpts that survived the
  // prune, and every loaded page of the open history, are read again.
  const reload = async (path: string, next: RepoSnapshot): Promise<void> => {
    const { open } = await deps.ui.read()
    for (const f of next.files) {
      const key = f.group === 'conflicts' ? `conflict|${path}|${f.path}` : `diff|${fileId(path, f)}`
      if (open[key] !== true) continue
      try {
        const content = f.group === 'conflicts' ? await readConflict(path, f.path) : await ops.readDiff(git, host, path, f)
        await deps.details.update(d => (key in d.diffs ? { ...d, diffs: { ...d.diffs, [key]: content } } : d))
      } catch {
        // keep what is on screen; the next refresh tries again
      }
    }
    if (open[`history|${path}`] !== true) return
    const loaded = (await deps.details.read()).history[path] ?? []
    const commits = await readHistory(git, path, next.branch.upstream, 0, Math.max(1, Math.ceil(loaded.length / PAGE)) * PAGE)
    if (commits.length > 0) await deps.details.update(d => ({ ...d, history: { ...d.history, [path]: commits } }))
  }

  const refreshRepo = async (path: string): Promise<void> => {
    const current = await snapshot(path)
    if (current === undefined) return
    try {
      const next = await readSnapshot(current.repo)
      await deps.repos.update(list => list.map(s => (s.repo.path === path ? next : s)))
      await prune(path, next)
      await reload(path, next)
    } catch (error) {
      await setError(path, error)
    }
  }

  // Background work, keyed by what it touches: a call that finds its key still running joins that
  // run instead of starting another. A repository whose git calls wait behind a slow fetch, pull or
  // push gets no pile of reads behind it, and the other repositories never wait with it.
  const running = new Map<string, Promise<void>>()
  const once = (key: string, work: () => Promise<void>): Promise<void> => {
    const current = running.get(key)
    if (current !== undefined) return current
    const run = work().finally(() => {
      running.delete(key)
    })
    running.set(key, run)
    return run
  }

  const discover = (): Promise<void> =>
    once('discover', async () => {
      const found = await discoverRepos(git, host, await deps.roots())
      await deps.repos.update(list => found.map(repo => ({ ...(list.find(s => s.repo.path === repo.path) ?? blank(repo)), repo })))
    })

  const refreshAll = async (rediscover: boolean): Promise<void> => {
    if (rediscover || (await deps.repos.read()).length === 0) await discover()
    await Promise.all((await deps.repos.read()).map(s => refreshRepo(s.repo.path)))
  }

  // Opening, the 30 s tick and the read after Claude edits a file: waits for discovery only, then
  // reads each repository without waiting for it, skipping one whose last such read still waits.
  const startRefresh = async (rediscover: boolean): Promise<void> => {
    if (rediscover || (await deps.repos.read()).length === 0) await discover()
    for (const s of await deps.repos.read()) void once(`refresh|${s.repo.path}`, () => refreshRepo(s.repo.path)).catch(() => undefined)
  }

  // The automatic fetch (interactive false) skips a repository whose last automatic fetch still runs.
  const fetchAll = async (interactive: boolean): Promise<void> => {
    const fetchOne = async (path: string): Promise<void> => {
      try {
        await ops.fetchRemote(git, path, interactive)
        await setUi(ui => ({ ...ui, fetchErrors: without(ui.fetchErrors, path) }))
      } catch (error) {
        await setUi(ui => ({ ...ui, fetchErrors: { ...ui.fetchErrors, [path]: t('fetchFailed', { reason: describe(error) }) } }))
      }
      await refreshRepo(path)
    }
    await Promise.all(
      (await deps.repos.read()).map(s => (interactive ? fetchOne(s.repo.path) : once(`fetch|${s.repo.path}`, () => fetchOne(s.repo.path)))),
    )
    const now = await host.now()
    await setUi(ui => ({ ...ui, lastFetchAt: now }))
  }

  const guarded = async (path: string, work: () => Promise<unknown>): Promise<boolean> => {
    try {
      await work()
      return true
    } catch (error) {
      await setError(path, error)
      return false
    }
  }

  const quiet = async (path: string, work: () => Promise<unknown>): Promise<void> => {
    await guarded(path, work)
  }

  const inFlight = new Set<string>()

  const act = async (path: string, name: string, work: (s: RepoSnapshot) => Promise<unknown>): Promise<void> => {
    if (inFlight.has(path)) return
    inFlight.add(path)
    try {
      const s = await snapshot(path)
      if (s === undefined) return
      await setUi(ui => ({ ...ui, busy: { ...ui.busy, [path]: name }, errors: without(ui.errors, path) }))
      try {
        await work(s)
      } catch (error) {
        await setError(path, error)
      } finally {
        await refreshRepo(path)
        await setUi(ui => ({ ...ui, busy: without(ui.busy, path) }))
      }
    } finally {
      inFlight.delete(path)
    }
  }

  const confirmed = async (key: string): Promise<boolean> => {
    const now = await host.now()
    const current = (await deps.ui.read()).confirm
    if (current !== null && current.key === key && now < current.until) {
      await setUi(ui => ({ ...ui, confirm: null }))
      return true
    }
    await setUi(ui => ({ ...ui, confirm: { key, until: now + CONFIRM_MS } }))
    host.after(CONFIRM_MS, () => void setUi(ui => (ui.confirm?.key === key ? { ...ui, confirm: null } : ui)))
    return false
  }

  const toggleLoaded = async (key: string, load: () => Promise<DiffContent>): Promise<void> => {
    if ((await deps.ui.read()).open[key] === true) {
      await setOpen(key, false)
      await deps.details.update(d => ({ ...d, diffs: without(d.diffs, key) }))
      return
    }
    const content = await load()
    await deps.details.update(d => ({ ...d, diffs: { ...d.diffs, [key]: content } }))
    await setOpen(key, true)
  }

  const onStash = (path: string, stash: Stash, work: () => Promise<unknown>): Promise<void> =>
    act(path, 'stash', async () => {
      await ops.checkStash(git, path, stash)
      await work()
    })

  const upstreamOf = async (path: string): Promise<string | null> => (await snapshot(path))?.branch.upstream ?? null

  const actions: Actions = {
    refresh: async () => {
      try {
        await refreshAll(true)
        await fetchAll(true)
      } catch {
        // a failed discovery (git missing, the session folder gone) leaves the pane as it was
      }
    },
    toggle: (key, current) => setOpen(key, !current),
    select: path => setUi(ui => ({ ...ui, selected: path })),
    setDraft,
    setBranchFilter: (path, text) => setUi(ui => ({ ...ui, branchFilters: { ...ui.branchFilters, [path]: text } })),
    setBranchDraft: (path, text) => setUi(ui => ({ ...ui, branchDrafts: { ...ui.branchDrafts, [path]: text } })),
    commit: path =>
      act(path, 'commit', async () => {
        await ops.commit(git, path, await draftOf(path), await readOperation(git, host, path))
        await setDraft(path, '')
      }),
    amend: path =>
      act(path, 'amend', async s => {
        await ops.amend(git, path, await draftOf(path), stagedCount(s), s.operation)
        await setDraft(path, '')
      }),
    undo: path => act(path, 'undo', async s => setDraft(path, await ops.undo(git, path, s.operation))),
    generate: path => act(path, 'generate', async s => setDraft(path, await generateCommitMessage(git, host, path, stagedCount(s), deps.model))),
    stage: (path, target) => act(path, 'stage', () => ops.stage(git, path, target === 'all' ? 'all' : [target])),
    unstage: (path, target) => act(path, 'unstage', s => ops.unstage(git, path, target === 'all' ? 'all' : [target], s.branch.oid !== null)),
    discard: async (path, target) => {
      if (await confirmed(`discard|${fileId(path, target)}`)) await act(path, 'discard', () => ops.discard(git, path, target))
    },
    toggleDiff: (path, target) => quiet(path, () => toggleLoaded(`diff|${fileId(path, target)}`, () => ops.readDiff(git, host, path, target))),
    openFile: (path, target) => quiet(path, () => host.open(join(path, target))),
    pull: (path, mode) =>
      act(path, 'pull', async () => {
        await setUi(ui => ({ ...ui, diverged: without(ui.diverged, path) }))
        try {
          await ops.pull(git, path, mode)
        } catch (error) {
          if (!(error instanceof Refusal && error.key === 'diverged')) throw error
          await setUi(ui => ({ ...ui, diverged: { ...ui.diverged, [path]: true } }))
        }
      }),
    push: path => act(path, 'push', s => ops.push(git, path, s.branch.head, s.branch.upstream, s.remotes)),
    switchBranch: async (path, value) => {
      if (value === NEW_BRANCH) {
        await setOpen(`newbranch|${path}`, true)
        return
      }
      if (value === OTHER_BRANCHES) {
        await setOpen(`branchfilter|${path}`, true)
        return
      }
      await setUi(ui => ({ ...ui, branchFilters: without(ui.branchFilters, path), open: { ...ui.open, [`branchfilter|${path}`]: false } }))
      await act(path, 'switch', async s => {
        const ref = s.branches.find(b => b.value === value)
        if (ref === undefined || ref.isCurrent) return
        await setUi(ui => ({ ...ui, blockedSwitch: without(ui.blockedSwitch, path) }))
        try {
          await ops.switchBranch(git, path, ref)
        } catch (error) {
          if (ops.isBlockedByChanges(error)) await setUi(ui => ({ ...ui, blockedSwitch: { ...ui.blockedSwitch, [path]: value } }))
          throw error
        }
      })
    },
    stashAndSwitch: path =>
      act(path, 'switch', async s => {
        const value = (await deps.ui.read()).blockedSwitch[path]
        const ref = s.branches.find(b => b.value === value)
        if (ref === undefined) return
        await ops.stashPush(git, path, t('switchMessage', { branch: ref.name }))
        await ops.switchBranch(git, path, ref)
        await setUi(ui => ({ ...ui, blockedSwitch: without(ui.blockedSwitch, path) }))
      }),
    createBranch: path =>
      act(path, 'branch', async () => {
        await ops.createBranch(git, path, ((await deps.ui.read()).branchDrafts[path] ?? '').trim())
        await setUi(ui => ({ ...ui, branchDrafts: without(ui.branchDrafts, path), open: { ...ui.open, [`newbranch|${path}`]: false } }))
      }),
    stashSave: path =>
      act(path, 'stash', async () => {
        await ops.stashPush(git, path, await draftOf(path))
        await setDraft(path, '')
      }),
    stashApply: (path, stash) => onStash(path, stash, () => ops.stashApply(git, path, stash.ref)),
    stashPop: (path, stash) => onStash(path, stash, () => ops.stashPop(git, path, stash.ref)),
    stashDrop: async (path, stash) => {
      if (await confirmed(`drop|${path}|${stash.hash}`)) await onStash(path, stash, () => ops.stashDrop(git, path, stash.ref))
    },
    toggleStashDiff: (path, stash) => quiet(path, () => toggleLoaded(`stash|${path}|${stash.hash}`, () => ops.readStashDiff(git, path, stash.hash))),
    toggleHistory: async path => {
      const key = `history|${path}`
      const isOpen = (await deps.ui.read()).open[key] === true
      let ok = true
      if (!isOpen) {
        ok = await guarded(path, async () => {
          const commits = await readHistory(git, path, await upstreamOf(path), 0)
          await deps.details.update(d => ({ ...d, history: { ...d.history, [path]: commits } }))
        })
      }
      if (ok) await setOpen(key, !isOpen)
    },
    loadMore: path =>
      quiet(path, async () => {
        const loaded = (await deps.details.read()).history[path] ?? []
        const more = await readHistory(git, path, await upstreamOf(path), loaded.length)
        await deps.details.update(d => ({ ...d, history: { ...d.history, [path]: [...loaded, ...more] } }))
      }),
    toggleCommit: async (path, hash) => {
      const key = `commit|${path}|${hash}`
      const isOpen = (await deps.ui.read()).open[key] === true
      let ok = true
      if (!isOpen) {
        ok = await guarded(path, async () => {
          const files = await readCommitFiles(git, path, hash)
          await deps.details.update(d => ({ ...d, commitFiles: { ...d.commitFiles, [key]: files } }))
        })
      }
      if (ok) await setOpen(key, !isOpen)
    },
    toggleCommitFile: (path, hash, target) =>
      quiet(path, () =>
        toggleLoaded(`cfile|${path}|${hash}|${target}`, async () => ({ kind: 'diff', ...ops.cutDiff(await readCommitFileDiff(git, path, hash, target)) })),
      ),
    keep: async (path, target, side) => {
      if (!(await confirmed(`keep|${path}|${target}|${side}`))) return
      await act(path, 'conflict', async () => ops.keepSide(git, path, target, side, await readOperation(git, host, path)))
    },
    markResolved: (path, target) => act(path, 'conflict', () => ops.markResolved(git, host, path, target)),
    toggleConflict: (path, target) => quiet(path, () => toggleLoaded(`conflict|${path}|${target}`, () => readConflict(path, target))),
    resolveWithClaude: (path, target) =>
      quiet(path, async () => {
        const s = await snapshot(path)
        if (s === undefined) return
        const sides =
          s.operation === null
            ? { mine: s.branch.head ?? (await ops.refName(git, path, 'HEAD')), theirs: t('otherSide') }
            : await ops.readSides(git, path, s.operation, s.branch.head)
        await host.submit(buildResolvePrompt(t, { file: target, repo: s.repo.label, path, operation: s.operation, ...sides }))
      }),
    conclude: path =>
      act(path, 'conclude', async s => {
        if (s.operation !== null) await ops.conclude(git, path, s.operation)
      }),
    abort: async path => {
      if (!(await confirmed(`abort|${path}`))) return
      await act(path, 'abort', async s => {
        if (s.operation !== null) await ops.abort(git, path, s.operation)
      })
    },
    dismissError: path => setUi(ui => ({ ...ui, errors: without(ui.errors, path) })),
  }

  return { actions, refreshAll, startRefresh, fetchAll, refreshRepo }
}

export type Controller = ReturnType<typeof createController>
