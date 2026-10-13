import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { BASE_ARGS } from '../hooks/git/run'
import { closeHeavy, focusedRepo, toggleOnTake } from '../hooks/ui/pane'
import { isBlank, leaves, nodes, result, shown, type Node } from './helpers'

const PANE = { component: 'Pane', requestId: 'code-control', props: { title: 'Source control', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const
const entry = (name: string, kind: 'dir' | 'file' = 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })
const STATUS = ['# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +1 -0', '1 .M N... 100644 100644 100644 a a src/app.ts', '? notes.md', ''].join('\0')
const CONFLICT = ['# branch.oid abc', '# branch.head main', 'u UU N... 100644 100644 100644 100644 a b c src/app.ts', ''].join('\0')

const changed = (path: string) => `1 .M N... 100644 100644 100644 a a ${path}`
const staged = (path: string) => `1 M. N... 100644 100644 100644 a a ${path}`
const unmerged = (path: string) => `u UU N... 100644 100644 100644 100644 a b c ${path}`
// a repository's status: on main with origin/main as its upstream unless `upstream` is false
const status = (o: { ahead?: number; behind?: number; upstream?: boolean; files?: string[] } = {}) =>
  [
    '# branch.oid abc',
    '# branch.head main',
    ...(o.upstream === false ? [] : ['# branch.upstream origin/main', `# branch.ab +${o.ahead ?? 0} -${o.behind ?? 0}`]),
    ...(o.files ?? []),
    '',
  ].join('\0')

type World = {
  env?: Record<string, string>
  // one status for every repository, or each repository's by its folder
  status?: string | ((cwd: string) => string)
  gitDir?: string[]
  extra?: (line: string) => string | undefined
  // a call that fails with this stderr
  fail?: (line: string, cwd: string) => string | undefined
  delay?: (line: string) => number
  // a call answers only once the promise it returns settles, whatever the clock does
  hold?: (line: string, cwd: string) => Promise<void> | undefined
  branches?: string
  // the folders under /w that are repositories
  repos?: string[]
}

const world = (on: On, options: World = {}) => {
  const calls: string[] = []
  // every process call with the folder it ran in, for tests that tell repositories apart
  const runs: { cwd: string; line: string }[] = []
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  mock.env(on, options.env ?? { LANG: 'en_US.UTF-8' })
  on('session.cwd', () => ({ value: '/w' }))
  on('session.root', () => ({ value: '/w' }))
  on('settings.read', () => ({ value: {} }))
  on('command.register', () => ({ value: { command: 'code-control' } }))
  on('ui.open', ($, e) => {
    calls.push(`open ${e.id}`)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))
  const repos = (options.repos ?? ['app']).map(name => `/w/${name}`)
  on('fs.list', ($, e) => ({
    value:
      e.path === '/w'
        ? (options.repos ?? ['app']).map(name => entry(name))
        : repos.includes(e.path)
          ? [entry('.git')]
          : repos.some(repo => e.path === `${repo}/.git`)
            ? (options.gitDir ?? []).map(n => entry(n, 'file'))
            : [],
  }))
  on('prompt.submit', ($, e) => {
    calls.push(`prompt ${e.text}`)
    return { text: e.text }
  })
  on('process.run', async ($, e) => {
    const args = e.argv[0] === 'git' ? e.argv.slice(BASE_ARGS.length) : [...e.argv]
    const line = args.join(' ')
    const cwd = String(e.init?.cwd ?? '')
    calls.push(line)
    runs.push({ cwd, line })
    const delay = options.delay?.(line) ?? 0
    if (delay > 0) await clock.sleep(delay)
    await options.hold?.(line, cwd)
    const failure = options.fail?.(line, cwd)
    if (failure !== undefined) return { value: result({ exitCode: 1, stderr: failure }) }
    const extra = options.extra?.(line)
    if (extra !== undefined) return { value: result({ stdout: extra }) }
    if (line === 'uname -s') return { value: result({ stdout: 'Darwin\n' }) }
    if (line === 'rev-parse --show-toplevel') return { value: result({ stdout: `${cwd}\n` }) }
    if (line === 'rev-parse --absolute-git-dir') return { value: result({ stdout: `${cwd}/.git\n` }) }
    if (line.startsWith('status ')) return { value: result({ stdout: typeof options.status === 'function' ? options.status(cwd) : (options.status ?? STATUS) }) }
    if (line.startsWith('for-each-ref')) return { value: result({ stdout: options.branches ?? 'refs/heads/main\x1f*\n' }) }
    if (line === 'remote') return { value: result({ stdout: 'origin\n' }) }
    return { value: result() }
  })
  return { calls, runs, clock }
}

const open = ($: { command: { run: (input: never) => Promise<{ text?: string }> } }) => $.command.run({ command: 'code-control', args: '' } as never)

type Mounted = { find: (q: { key: string }) => Promise<unknown>; findAll: (q: { type: string }) => Promise<{ key: string | undefined }[]> }
// what a repository's list row shows, blanks left out
const rowOf = async (ui: Mounted, repo: string) => leaves(await ui.find({ key: `reporow|${repo}` })).filter(l => !isBlank(l.text))
const rowTexts = async (ui: Mounted, repo: string) => (await rowOf(ui, repo)).map(l => l.text)
// the same with each icon as its alt in brackets
const rowShown = async (ui: Mounted, repo: string) => shown(await ui.find({ key: `reporow|${repo}` }))
// the list rows in the order drawn
const listed = async (ui: Mounted) => (await ui.findAll({ type: 'Box' })).flatMap(b => (b.key?.startsWith('reporow|') === true ? [b.key.slice('reporow|/w/'.length)] : []))

test('opens the pane and lists the repository and its files', async ($, on) => {
  world(on)
  const r = await open($)
  expect(r.text).toBe('Source control pane opened.')
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await rowShown(ui, '/w/app')).toEqual(['[Repository]', 'app', '[Branch]', 'main', '[2 changes]', '[1 to push]', '2 changes · 1 to push'])
  expect((await ui.find({ key: 'diff|/w/app|changes|src/app.ts' }))?.props.label).toBe('app.ts')
  expect((await ui.find({ key: 'diff|/w/app|changes|notes.md' }))?.props.label).toBe('notes.md')
  expect(shown(await ui.find({ key: 'head|group|/w/app|changes' }))).toEqual(['[Expanded]', 'Changes', '+', 'Stage all', '[2]'])
  await ui.unmount()
})

test('stage runs git add and discard asks twice', async ($, on) => {
  const { calls } = world(on)
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'stage|/w/app|changes|src/app.ts' })
  expect(calls).toContain('add -- src/app.ts')
  await ui.press({ key: 'discard|/w/app|changes|src/app.ts' })
  expect(calls).not.toContain('restore --worktree -- src/app.ts')
  expect(await ui.find({ type: 'Text', text: 'Confirm?' })).toBeDefined()
  await ui.press({ key: 'discard|/w/app|changes|src/app.ts' })
  expect(calls).toContain('restore --worktree -- src/app.ts')
  await ui.unmount()
})

test('commit: empty message warns, typed message commits', async ($, on) => {
  const { calls } = world(on)
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  await ui.press({ key: 'commit|/w/app' })
  expect(await ui.find({ type: 'Text', text: 'Write the commit message.' })).toBeDefined()
  await ui.input({ key: 'msg|/w/app', text: 'feat: x', kind: 'change' })
  await ui.press({ key: 'commit|/w/app' })
  expect(calls).toContain('add -A')
  expect(calls).toContain('commit -m feat: x')
  await ui.unmount()
})

test('Portuguese from LANG', async ($, on) => {
  world(on, { env: { LANG: 'pt_BR.UTF-8' } })
  expect((await open($)).text).toBe('Painel de controle de código aberto.')
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Repositórios' })).toBeDefined()
  expect(shown(await ui.find({ key: 'head|group|/w/app|changes' }))).toEqual(['[Aberto]', 'Alterações', '+', 'Preparar tudo', '[2]'])
  expect(shown(await ui.find({ key: 'tip|commit|/w/app' })).at(-1)).toBe('Commit das 2 alterações')
  await ui.unmount()
})

test('the phone only shows', async ($, on) => {
  world(on)
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'mobile', ...PANE })
  expect(await ui.find({ key: 'msg|/w/app' })).toBeUndefined()
  expect(await ui.find({ key: 'stage|/w/app|changes|src/app.ts' })).toBeUndefined()
  expect((await ui.find({ key: 'diff|/w/app|changes|src/app.ts' }))?.props.label).toBe('app.ts')
  await ui.unmount()
})

test('status is read again every 30 seconds', async ($, on) => {
  const { calls, clock } = world(on)
  await open($)
  const before = calls.filter(c => c.startsWith('status ')).length
  await clock.advance(30_000)
  expect(calls.filter(c => c.startsWith('status ')).length).toBeGreaterThan(before)
})

test('conflict banner and resolve with Claude', async ($, on) => {
  const { calls } = world(on, { status: CONFLICT, gitDir: ['MERGE_HEAD'], extra: line => (line.startsWith('name-rev') ? 'feature/x\n' : undefined) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Merge in progress · 1 conflict' })).toBeDefined()
  expect(await rowShown(ui, '/w/app')).toEqual(['[Repository]', 'app', '[Branch]', 'main', '[needs attention]', '[1 change]', 'needs attention · 1 change'])
  expect(await ui.find({ key: 'conclude|/w/app' })).toBeUndefined()
  await ui.press({ key: 'claude|/w/app|conflicts|src/app.ts' })
  expect(calls.some(c => c.startsWith('prompt Resolve the merge conflicts in `src/app.ts`'))).toBe(true)
  await ui.unmount()
})

test('keep mine asks twice and shows Confirm? by the buttons', async ($, on) => {
  const { calls } = world(on, { status: CONFLICT, gitDir: ['MERGE_HEAD'] })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'mine|/w/app|conflicts|src/app.ts' })
  expect(calls).not.toContain('checkout --ours -- src/app.ts')
  expect(await ui.find({ type: 'Text', text: 'Confirm?' })).toBeDefined()
  await ui.press({ key: 'mine|/w/app|conflicts|src/app.ts' })
  expect(calls).toContain('checkout --ours -- src/app.ts')
  expect(await ui.find({ type: 'Text', text: 'Confirm?' })).toBeUndefined()
  await ui.unmount()
})

test('a conflict with no operation (stash apply) has no banner and still resolves with Claude', async ($, on) => {
  const { calls } = world(on, { status: CONFLICT })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(shown(await ui.find({ key: 'head|group|/w/app|conflicts' }))).toEqual(['[Expanded]', 'Conflicts', '[1]'])
  expect(await ui.find({ key: 'abort|/w/app' })).toBeUndefined()
  await ui.press({ key: 'claude|/w/app|conflicts|src/app.ts' })
  const prompt = calls.find(c => c.startsWith('prompt '))
  expect(prompt).toContain('"mine" is main and "theirs" is the other side.')
  expect(prompt).not.toContain('in progress')
  await ui.unmount()
})

test('a failure while opening still answers the command', async ($, on) => {
  world(on, {
    extra: line => {
      if (line === 'rev-parse --show-toplevel') throw new Error('boom toplevel')
      return undefined
    },
  })
  const r = await open($)
  // the kit skips a throwing test hook, so the plugin sees the engine's own error text
  expect(r.text).toContain('process.run')
  expect(r.text).not.toBe('Source control pane opened.')
})

test('status is read again one second after Claude edits a file', async ($, on) => {
  const { calls, clock } = world(on)
  on('tool.call', () => ({ result: 'ok' }) as never)
  await open($)
  const before = calls.filter(c => c.startsWith('status ')).length
  await ($ as never as { tool: { call: (i: unknown) => Promise<unknown> } }).tool.call({ tool: 'Edit', input: {} })
  await clock.advance(1_000)
  expect(calls.filter(c => c.startsWith('status ')).length).toBeGreaterThan(before)
})

test('↗ opens a document and only reveals a script', async ($, on) => {
  const status = ['# branch.oid abc', '# branch.head main', '1 .M N... 100644 100644 100644 a a src/app.ts', '? deploy.sh', ''].join('\0')
  const { calls } = world(on, { status })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'open|/w/app|changes|src/app.ts' })
  await ui.press({ key: 'open|/w/app|changes|deploy.sh' })
  expect(calls).toContain('open /w/app/src/app.ts')
  expect(calls).toContain('open -R /w/app/deploy.sh')
  expect(calls).not.toContain('open /w/app/deploy.sh')
  await ui.unmount()
})

const fetches = (calls: readonly string[]) => calls.filter(c => c.startsWith('fetch ')).length

test('fetchIntervalMinutes 0 turns off every automatic fetch, the one on opening too', { options: { fetchIntervalMinutes: 0 } }, async ($, on) => {
  const { calls, clock } = world(on)
  await open($)
  await clock.advance(30 * 60_000)
  expect(fetches(calls)).toBe(0)
})

test('a fetch interval under a minute is read as one minute', { options: { fetchIntervalMinutes: 0.1 } }, async ($, on) => {
  const { calls, clock } = world(on)
  await open($)
  // the opening fetch runs after the answer
  await clock.settle()
  expect(fetches(calls)).toBe(1)
  await clock.advance(59_000)
  expect(fetches(calls)).toBe(1)
  await clock.advance(1_000)
  expect(fetches(calls)).toBe(2)
})

test('a fetch tick is skipped while the fetch that timer started still runs', { options: { fetchIntervalMinutes: 1 } }, async ($, on) => {
  let n = 0
  const { calls, clock } = world(on, { delay: line => (line.startsWith('fetch ') && ++n > 1 ? 150_000 : 0) })
  await open($)
  await clock.settle()
  expect(fetches(calls)).toBe(1)
  await clock.advance(60_000)
  expect(fetches(calls)).toBe(2)
  // the ticks at 2 and 3 minutes find it running; queued, they would start a fetch as soon as it ends at 3.5
  await clock.advance(170_000)
  expect(fetches(calls)).toBe(2)
  await clock.advance(10_000)
  expect(fetches(calls)).toBe(3)
})

test('a second /code-control reuses the app: one build, one git queue, one in-flight guard', async ($, on) => {
  const { calls, clock } = world(on, { delay: line => (line === 'push' ? 60_000 : 0) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'push|/w/app' })
  const reopened = open($)
  await clock.settle()
  await ui.press({ key: 'push|/w/app' })
  await clock.advance(60_000)
  expect((await reopened).text).toBe('Source control pane opened.')
  expect(calls.filter(c => c === 'push')).toHaveLength(1)
  expect(calls.filter(c => c === 'uname -s')).toHaveLength(1)
  await ui.unmount()
})

const heldFetchOfA = () => {
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  return { release, hold: (line: string, cwd: string) => (line.startsWith('fetch ') && cwd === '/w/a' ? held : undefined) }
}

const count = (runs: readonly { cwd: string; line: string }[], repo: string, prefix: string) => runs.filter(r => r.cwd === repo && r.line.startsWith(prefix)).length

test('a repository held behind a slow fetch does not stop the 30 s reads of the others', async ($, on) => {
  const { release, hold } = heldFetchOfA()
  const { runs, clock } = world(on, { repos: ['a', 'b'], hold })
  await open($)
  await clock.settle()
  const before = count(runs, '/w/b', 'status ')
  for (let tick = 1; tick <= 3; tick += 1) {
    await clock.advance(30_000)
    expect(count(runs, '/w/b', 'status ')).toBe(before + tick)
  }
  release()
  await clock.settle()
})

test('reads of a repository held behind a slow fetch do not pile up behind it', async ($, on) => {
  const { release, hold } = heldFetchOfA()
  const { runs, clock } = world(on, { repos: ['a', 'b'], hold })
  on('tool.call', () => ({ result: 'ok' }) as never)
  await open($)
  await clock.settle()
  const before = count(runs, '/w/a', 'status ')
  for (let i = 0; i < 3; i += 1) {
    await clock.advance(29_000)
    await ($ as never as { tool: { call: (i: unknown) => Promise<unknown> } }).tool.call({ tool: 'Edit', input: {} })
    await clock.advance(1_000)
  }
  expect(count(runs, '/w/a', 'status ')).toBe(before)
  release()
  await clock.settle()
  // what waited for the fetch: at most one background read, then the fetch's own read
  expect(count(runs, '/w/a', 'status ') - before).toBeLessThanOrEqual(2)
})

test('a fetch held by a slow remote does not stop the timed fetches of the others', { options: { fetchIntervalMinutes: 1 } }, async ($, on) => {
  const { release, hold } = heldFetchOfA()
  const { runs, clock } = world(on, { repos: ['a', 'b'], hold })
  await open($)
  await clock.settle()
  expect(count(runs, '/w/b', 'fetch ')).toBe(1)
  for (let minute = 1; minute <= 3; minute += 1) {
    await clock.advance(60_000)
    expect(count(runs, '/w/b', 'fetch ')).toBe(1 + minute)
  }
  expect(count(runs, '/w/a', 'fetch ')).toBe(1)
  release()
  await clock.settle()
})

test('a second /code-control answers at once while a push holds the repository', async ($, on) => {
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  const { calls, clock } = world(on, { hold: line => (line === 'push' ? held : undefined) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const pushing = ui.press({ key: 'push|/w/app' })
  await clock.settle()
  expect(calls).toContain('push')
  expect((await open($)).text).toBe('Source control pane opened.')
  release()
  await pushing
  await ui.unmount()
})

test('a repository with more branches than a Select may list still draws, and Other branches opens a filter', async ($, on) => {
  const branches = ['refs/heads/main\x1f*', ...Array.from({ length: 69 }, (_, i) => `refs/heads/feat-${i + 1}\x1f `), ''].join('\n')
  const { calls } = world(on, { branches })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await ui.find({ key: 'diff|/w/app|changes|src/app.ts' })).toBeDefined()
  const options = (await ui.find({ key: 'branch|/w/app' }))?.props.options as { value: string; label: string }[]
  expect(options.length).toBeLessThanOrEqual(64)
  expect(options.slice(-2).map(o => o.label)).toEqual(['New branch…', 'Other branches…'])
  expect(await ui.find({ key: 'branchfilter|/w/app' })).toBeUndefined()
  await ui.select({ key: 'branch|/w/app', value: options[options.length - 1]?.value ?? '' })
  expect(calls.some(c => c.startsWith('switch'))).toBe(false)
  expect(await ui.find({ key: 'branchfilter|/w/app' })).toBeDefined()
  await ui.input({ key: 'branchfilter|/w/app', text: 'feat-69', kind: 'change' })
  expect(await ui.find({ key: 'pick|/w/app|feat-1' })).toBeUndefined()
  await ui.press({ key: 'pick|/w/app|feat-69' })
  expect(calls).toContain('switch -- feat-69')
  expect(await ui.find({ key: 'branchfilter|/w/app' })).toBeUndefined()
  await ui.unmount()
})

test('a filter with no match says so', async ($, on) => {
  const branches = ['refs/heads/main\x1f*', ...Array.from({ length: 69 }, (_, i) => `refs/heads/feat-${i + 1}\x1f `), ''].join('\n')
  world(on, { branches })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const options = (await ui.find({ key: 'branch|/w/app' }))?.props.options as { value: string }[]
  await ui.select({ key: 'branch|/w/app', value: options[options.length - 1]?.value ?? '' })
  await ui.input({ key: 'branchfilter|/w/app', text: 'zzz', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: 'No branch matches.' })).toBeDefined()
  await ui.unmount()
})

test('✦ asks the model with a 60 second limit', async ($, on) => {
  world(on)
  const asked: (number | undefined)[] = []
  on('model.complete', ($, e) => {
    asked.push(e.timeoutMs)
    return { value: { isAnswered: true, text: 'feat: generated', usage: {} } } as never
  })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'gen|/w/app' })
  expect(asked).toEqual([60_000])
  expect((await ui.find({ key: 'msg|/w/app' }))?.props.value).toBe('feat: generated')
  await ui.unmount()
})

test('a model call cut at its limit reports it and leaves ✦ free to try again', async ($, on) => {
  world(on)
  let n = 0
  on('model.complete', () => {
    n += 1
    return { value: n === 1 ? { isAnswered: false, reason: 'aborted', usage: {} } : { isAnswered: true, text: 'feat: second', usage: {} } } as never
  })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'gen|/w/app' })
  expect(await ui.find({ type: 'Text', text: "Couldn't write the message (aborted)." })).toBeDefined()
  expect((await ui.find({ key: 'gen|/w/app' }))?.props.label).toBe('✦')
  await ui.press({ key: 'gen|/w/app' })
  expect(n).toBe(2)
  expect((await ui.find({ key: 'msg|/w/app' }))?.props.value).toBe('feat: second')
  await ui.unmount()
})

test('the list puts files first, then the most behind, then the repositories in sync', async ($, on) => {
  const states: Record<string, string> = {
    '/w/ahead2': status({ ahead: 2 }),
    '/w/behind3': status({ behind: 3 }),
    '/w/behind7': status({ behind: 7 }),
    '/w/even': status(),
    '/w/five': status({ files: ['a', 'b', 'c', 'd', 'e'].map(changed) }),
    '/w/quiet': status(),
    '/w/two': status({ behind: 9, files: [changed('a'), changed('b')] }),
  }
  world(on, { repos: Object.keys(states).map(r => r.slice(3)), status: cwd => states[cwd] ?? status() })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await listed(ui)).toEqual(['five', 'two', 'behind7', 'behind3', 'ahead2', 'even', 'quiet'])
  await ui.unmount()
})

test('the list shows 8 repositories and the rest behind a toggle', async ($, on) => {
  const names = Array.from({ length: 12 }, (_, i) => `r${String(i + 1).padStart(2, '0')}`)
  world(on, { repos: names, status: cwd => (cwd === '/w/r12' ? status() : status({ behind: 1 })) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await listed(ui)).toEqual(names.slice(0, 8))
  expect(shown(await ui.find({ key: 'morerepos-row' }))).toEqual(['[Collapsed]', '4 more · 1 up to date'])
  await ui.press({ key: 'morerepos' })
  expect(await listed(ui)).toEqual(names)
  expect(shown(await ui.find({ key: 'morerepos-row' }))).toEqual(['[Expanded]', 'fewer'])
  await ui.press({ key: 'morerepos' })
  expect(await listed(ui)).toEqual(names.slice(0, 8))
  await ui.unmount()
})

test('eight repositories or fewer have no toggle', async ($, on) => {
  world(on, { repos: ['a', 'b'] })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await listed(ui)).toEqual(['a', 'b'])
  expect(await ui.find({ key: 'morerepos' })).toBeUndefined()
  await ui.unmount()
})

test('a list row counts files, commits to pull and to push, and marks trouble in red', async ($, on) => {
  const states: Record<string, string> = {
    '/w/busy': status({ ahead: 2, behind: 3, files: [staged('a'), changed('b'), changed('c')] }),
    '/w/calm': status(),
    '/w/offline': status(),
    '/w/stuck': status({ files: [unmerged('x')] }),
  }
  const { clock } = world(on, { repos: ['busy', 'calm', 'offline', 'stuck'], status: cwd => states[cwd] ?? status(), fail: (line, cwd) => (line.startsWith('fetch ') && cwd === '/w/offline' ? 'fatal: unable to access' : undefined) })
  await open($)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await rowShown(ui, '/w/busy')).toEqual(['[Repository]', 'busy', '[Branch]', 'main', '[3 changes]', '[3 to pull]', '[2 to push]', '3 changes · 3 to pull · 2 to push'])
  expect(await rowShown(ui, '/w/calm')).toEqual(['[Repository]', 'calm', '[Branch]', 'main'])
  expect(await rowShown(ui, '/w/stuck')).toEqual(['[Repository]', 'stuck', '[Branch]', 'main', '[needs attention]', '[1 change]', 'needs attention · 1 change'])
  expect(await rowShown(ui, '/w/offline')).toEqual(['[Repository]', 'offline', '[Branch]', 'main', '[needs attention]', 'needs attention'])
  const trouble = nodes(await ui.find({ key: 'reporow|/w/stuck' })).find(n => n.type === 'Svg' && n.props.alt === 'needs attention')
  expect(String(trouble?.props.source)).toContain('fill="#e5484d"')
  await ui.unmount()
})

test('the first repository with files is selected, and selecting another shows its detail', async ($, on) => {
  const states: Record<string, string> = { '/w/ahead': status({ ahead: 1 }), '/w/clean': status(), '/w/edited': status({ files: [changed('a')] }), '/w/more': status({ files: [changed('a'), changed('b')] }) }
  world(on, { repos: ['ahead', 'clean', 'edited', 'more'], status: cwd => states[cwd] ?? status() })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await ui.find({ key: 'msg|/w/more' })).toBeDefined()
  // the selected row's button is the clear one over the row, so its name is no button
  expect(isBlank(String((await ui.find({ key: 'select|/w/more' }))?.props.label))).toBe(true)
  expect(await ui.find({ key: 'msg|/w/edited' })).toBeUndefined()
  await ui.press({ key: 'select|/w/edited' })
  expect(await ui.find({ key: 'msg|/w/edited' })).toBeDefined()
  expect(await ui.find({ key: 'msg|/w/more' })).toBeUndefined()
  expect((await ui.find({ key: 'reporow|/w/edited' }))?.props.backgroundColor).toBe('#3b82f61f')
  expect((await ui.find({ key: 'reporow|/w/more' }))?.props.backgroundColor).toBeUndefined()
  expect((await rowOf(ui, '/w/edited')).find(l => l.text === 'edited')).toMatchObject({ type: 'Text', props: { bold: true } })
  expect(await ui.find({ key: 'branch|/w/edited' })).toBeDefined()
  expect(await ui.find({ key: 'branch|/w/more' })).toBeUndefined()
  await ui.unmount()
})

test('the whole row of another repository selects it where a pointer reaches; the name does on the terminal', async ($, on) => {
  const states: Record<string, string> = { '/w/edited': status({ files: [changed('a')] }), '/w/more': status({ files: [changed('a'), changed('b')] }) }
  world(on, { repos: ['edited', 'more'], status: cwd => states[cwd] ?? status() })
  await open($)
  const desktop = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const row = nodes(await desktop.drawn()).find(n => n.props.key === 'reporow|/w/edited')
  expect(row?.props.position).toBe('relative')
  // a clear button spans the row, drawn before the state chips so they stay above it
  const cover = nodes(row).find(n => n.type === 'Box' && n.props.position === 'absolute' && n.props.height === 1)
  expect(cover?.props).toMatchObject({ top: 0, left: 0, right: 0, overflow: 'hidden' })
  const press = nodes(cover).find(n => n.type === 'Button')
  expect(press?.props).toMatchObject({ key: 'select|/w/edited', plain: true })
  expect(isBlank(String(press?.props.label))).toBe(true)
  expect(nodes(row).find(n => n.type === 'Text' && n.children[0] === 'edited')).toBeDefined()
  // the selected row keeps its clear button: once a press selects, the focus ring still has it to stand on
  expect(nodes(await desktop.find({ key: 'reporow|/w/more' })).some(n => n.props.position === 'absolute' && n.props.height === 1)).toBe(true)
  await desktop.press({ key: 'select|/w/edited' })
  expect(nodes(await desktop.find({ key: 'reporow|/w/edited' })).find(n => n.type === 'Button')?.props.key).toBe('select|/w/edited')
  expect(await desktop.find({ key: 'msg|/w/edited' })).toBeDefined()
  await desktop.unmount()
  const terminal = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  expect((await terminal.find({ key: 'select|/w/more' }))?.props.label).toBe('more')
  await terminal.unmount()
})

test('the commit row stays on a clean repository, and undo works from there', async ($, on) => {
  const { calls } = world(on, { status: status({ ahead: 1 }) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  for (const key of ['msg|/w/app', 'gen|/w/app', 'commit|/w/app', 'moreactions|/w/app']) expect(await ui.find({ key })).toBeDefined()
  await ui.select({ key: 'moreactions|/w/app', value: 'undo' })
  expect(calls).toContain('reset --soft HEAD~1')
  await ui.unmount()
})

test('the commit button reads ✓ Commit, primary while no operation runs', async ($, on) => {
  const states: Record<string, string> = { '/w/all': status({ files: [changed('a'), changed('b')] }), '/w/one': status({ files: [staged('a'), changed('b'), changed('c')] }) }
  world(on, { repos: ['all', 'one'], status: cwd => states[cwd] ?? status() })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect((await ui.find({ key: 'commit|/w/one' }))?.props.label).toBe('✓ Commit')
  expect((await ui.find({ key: 'commit|/w/one' }))?.props.variant).toBe('primary')
  // the counts the button no longer shows are the groups' badges
  expect(shown(await ui.find({ key: 'head|group|/w/one|staged' }))).toEqual(['[Expanded]', 'Staged Changes', '−', 'Unstage all', '[1]'])
  expect(shown(await ui.find({ key: 'head|group|/w/one|changes' }))).toEqual(['[Expanded]', 'Changes', '+', 'Stage all', '[2]'])
  // the hint says what the press commits: the staged files when there are some, all of them otherwise
  expect(shown(await ui.find({ key: 'tip|commit|/w/one' })).at(-1)).toBe('Commit 1 staged')
  await ui.press({ key: 'select|/w/all' })
  expect((await ui.find({ key: 'commit|/w/all' }))?.props.label).toBe('✓ Commit')
  expect(shown(await ui.find({ key: 'tip|commit|/w/all' })).at(-1)).toBe('Commit all 2 changes')
  await ui.unmount()
})

test('during a merge the commit button is not the primary one', async ($, on) => {
  world(on, { status: CONFLICT, gitDir: ['MERGE_HEAD'] })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect((await ui.find({ key: 'commit|/w/app' }))?.props.label).toBe('✓ Commit')
  expect((await ui.find({ key: 'commit|/w/app' }))?.props.variant).toBeUndefined()
  await ui.unmount()
})

test('⋯ is a menu of amend, undo and stash that returns to ⋯ after each pick', async ($, on) => {
  const { calls } = world(on)
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const menu = async () => (await ui.find({ key: 'moreactions|/w/app' }))?.props
  expect((await menu())?.value).toBe('more|0')
  expect((await menu())?.options).toEqual([
    { value: 'more|0', label: '⋯' },
    { value: 'amend', label: 'Amend last commit' },
    { value: 'undo', label: 'Undo last commit' },
    { value: 'stash', label: 'Stash changes' },
  ])
  await ui.input({ key: 'msg|/w/app', text: 'feat: better', kind: 'change' })
  await ui.select({ key: 'moreactions|/w/app', value: 'amend' })
  expect(calls).toContain('commit --amend -m feat: better')
  // drawn at rest again under a new value: a Select keeps the pick until its value changes
  expect((await menu())?.value).toBe('more|1')
  expect(((await menu())?.options as { value: string; label: string }[] | undefined)?.[0]).toEqual({ value: 'more|1', label: '⋯' })
  await ui.select({ key: 'moreactions|/w/app', value: 'undo' })
  expect(calls).toContain('reset --soft HEAD~1')
  await ui.select({ key: 'moreactions|/w/app', value: 'stash' })
  expect(calls.some(c => c.startsWith('stash push'))).toBe(true)
  await ui.unmount()
})

test('a message longer than the field shows whole under it, where a pointer surface draws the field narrow', async ($, on) => {
  world(on)
  await open($)
  const long = 'feat: show the whole commit message under the field'
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'code-control', surface, ...PANE })
    await ui.input({ key: 'msg|/w/app', text: 'fix: short', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: 'fix: short' })).toBeUndefined()
    await ui.input({ key: 'msg|/w/app', text: long, kind: 'change' })
    expect((await ui.find({ type: 'Text', text: long })) !== undefined).toBe(surface === 'desktop')
    // a blank line between the field and the whole message
    if (surface === 'desktop') expect((await ui.find({ key: 'msgwhole|/w/app' }))?.props.marginTop).toBe(1)
    await ui.unmount()
  }
})

test('pull and push show only with something to pull or push, and publish only without an upstream', async ($, on) => {
  const states: Record<string, string> = { '/w/ahead': status({ ahead: 2 }), '/w/behind': status({ behind: 3 }), '/w/even': status(), '/w/local': status({ upstream: false }) }
  const { calls } = world(on, { repos: ['ahead', 'behind', 'even', 'local'], status: cwd => states[cwd] ?? status() })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const label = async (key: string) => (await ui.find({ key }))?.props.label
  const choose = async (repo: string) => {
    if ((await ui.find({ key: `select|${repo}` })) !== undefined) await ui.press({ key: `select|${repo}` })
  }
  await choose('/w/behind')
  expect(await label('pull|/w/behind')).toBe('↓3')
  expect(shown(await ui.find({ key: 'tip|pull|/w/behind' })).at(-1)).toBe('Pull 3 commits')
  expect(await ui.find({ key: 'push|/w/behind' })).toBeUndefined()
  await ui.press({ key: 'pull|/w/behind' })
  expect(calls).toContain('pull --ff-only')
  await choose('/w/ahead')
  expect(await label('push|/w/ahead')).toBe('↑2')
  expect(shown(await ui.find({ key: 'tip|push|/w/ahead' })).at(-1)).toBe('Push 2 commits')
  expect(await ui.find({ key: 'pull|/w/ahead' })).toBeUndefined()
  await choose('/w/local')
  expect(await label('push|/w/local')).toBe('Publish branch')
  expect(await ui.find({ key: 'pull|/w/local' })).toBeUndefined()
  await choose('/w/even')
  expect(await ui.find({ key: 'push|/w/even' })).toBeUndefined()
  expect(await ui.find({ key: 'pull|/w/even' })).toBeUndefined()
  await ui.unmount()
})

test('an error on the selected repository marks its row and shows under the detail header', async ($, on) => {
  const states: Record<string, string> = { '/w/app': status({ ahead: 1, behind: 2, files: [staged('a'), changed('b')] }), '/w/other': status({ upstream: false }) }
  world(on, { repos: ['app', 'other'], status: cwd => states[cwd] ?? status() })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(await rowShown(ui, '/w/app')).not.toContain('[needs attention]')
  await ui.press({ key: 'commit|/w/app' })
  expect(await ui.find({ type: 'Text', text: 'Write the commit message.' })).toBeDefined()
  expect(await rowShown(ui, '/w/app')).toContain('[needs attention]')
  expect(await rowTexts(ui, '/w/other')).toEqual(['other', 'main'])
  await ui.unmount()
})

test('the pane draws on every surface with its blocks open', async ($, on) => {
  const states: Record<string, string> = { '/w/app': status({ ahead: 1, behind: 2, files: [staged('a'), changed('b'), unmerged('c')] }), '/w/other': status({ upstream: false }) }
  world(on, { repos: ['app', 'other'], status: cwd => states[cwd] ?? status(), gitDir: ['MERGE_HEAD'] })
  await open($)
  const desktop = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  for (const key of ['section|/w/app|incoming', 'history|/w/app', 'commit|/w/app']) await desktop.press({ key })
  await desktop.unmount()
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'code-control', surface, ...PANE })
    expect(await ui.drawn()).toMatchObject({ type: 'Box' })
    expect(await ui.find({ type: 'Text', text: 'Merge in progress · 1 conflict' })).toBeDefined()
    expect(await ui.find({ key: 'reporow|/w/other' })).toBeDefined()
    expect((await ui.find({ key: 'moreactions|/w/app' })) !== undefined).toBe(surface !== 'mobile')
    await ui.unmount()
  }
})

test('the repositories row ends with the last fetch as a short time and a ↻ button', { options: { fetchIntervalMinutes: 0 } }, async ($, on) => {
  const { clock } = world(on)
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  // no title row: the pane's tab already names it
  expect(await ui.find({ type: 'Text', text: 'SOURCE CONTROL' })).toBeUndefined()
  // then ⋯, the pane's settings (a Select: its hint is the last text)
  expect(shown(await ui.find({ key: 'head|section|repos' })).slice(-4)).toEqual(['not fetched yet', '↻', 'Fetch all now', 'Pane settings'])
  expect(await ui.find({ key: 'settings|pane' })).toBeDefined()
  // the time stays on one line beside the menu: its box does not shrink, the text cuts rather than wraps
  expect((await ui.find({ type: 'Text', text: 'not fetched yet' }))?.props.wrap).toBe('truncate-end')
  expect(nodes(await ui.drawn()).find(n => n.type === 'Box' && n.props.flexShrink === 0 && n.children.some(c => (c as { type?: string; children?: unknown[] }).type === 'Text' && (c as { children: unknown[] }).children[0] === 'not fetched yet'))).toBeDefined()
  expect((await ui.find({ key: 'refresh' }))?.props.label).toBe('↻')
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: 'just now' })).toBeDefined()
  await clock.advance(5 * 60_000)
  expect(await ui.find({ type: 'Text', text: '5 min ago' })).toBeDefined()
  await ui.unmount()
})

test('the macOS locale picks Portuguese when LANG does not', async ($, on) => {
  world(on, { extra: line => (line === 'defaults read -g AppleLocale' ? 'pt_BR\n' : undefined) })
  expect((await open($)).text).toBe('Painel de controle de código aberto.')
})

test('the Windows locale picks Portuguese', async ($, on) => {
  world(on, {
    fail: line => (line === 'uname -s' ? 'not found' : undefined),
    extra: line => (line === 'reg query HKCU\\Control Panel\\International /v LocaleName' ? '\r\nHKEY_CURRENT_USER\\Control Panel\\International\r\n    LocaleName    REG_SZ    pt-BR\r\n\r\n' : undefined),
  })
  expect((await open($)).text).toBe('Painel de controle de código aberto.')
})

test('on Linux LC_MESSAGES picks Portuguese', async ($, on) => {
  world(on, { env: { LANG: 'C.UTF-8', LC_MESSAGES: 'pt_BR.UTF-8' }, extra: line => (line === 'uname -s' ? 'Linux\n' : undefined) })
  expect((await open($)).text).toBe('Painel de controle de código aberto.')
})

test('an English macOS locale stays in English', async ($, on) => {
  world(on, { extra: line => (line === 'defaults read -g AppleLocale' ? 'en_BR\n' : undefined) })
  expect((await open($)).text).toBe('Source control pane opened.')
})

test('a list row: the repository icon, the name, the branch cut at its end, and its state in chips at the right', async ($, on) => {
  const states: Record<string, string> = {
    '/w/busy': status({ ahead: 2, behind: 3, files: [staged('a'), changed('b'), changed('c')] }),
    '/w/calm': status(),
    '/w/stuck': status({ files: [unmerged('x')] }),
  }
  world(on, { repos: ['busy', 'calm', 'stuck'], status: cwd => states[cwd] ?? status() })
  await open($)
  const desktop = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const tree = nodes(await desktop.drawn())
  const busy = tree.find(n => n.props.key === 'reporow|/w/busy')
  expect(busy?.props).toMatchObject({ flexDirection: 'row', alignItems: 'center', paddingLeft: 2, paddingRight: 1, backgroundColor: '#3b82f61f' })
  expect(busy?.hover).toEqual({ backgroundColor: '#3b82f62e' })
  const calm = tree.find(n => n.props.key === 'reporow|/w/calm')
  expect(calm?.props.backgroundColor).toBeUndefined()
  expect(calm?.hover).toEqual({ backgroundColor: '#8080801a' })
  const all = nodes(busy)
  expect(String(all.find(n => n.type === 'Svg')?.props.source)).toContain('#3b82f6')
  expect(String(nodes(calm).find(n => n.type === 'Svg')?.props.source)).toContain('#8b949e')
  // the name does not shrink; the branch box takes the room left and cuts the branch at its end
  const boxes = all.filter(n => n.type === 'Box')
  expect(boxes[1]?.props.flexShrink).toBe(0)
  expect(boxes[2]?.props).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0, overflow: 'hidden' })
  expect(leaves(boxes[2]).find(l => l.text === 'main')?.props).toMatchObject({ dimColor: true, wrap: 'truncate-end' })
  // past the clear button over the row, the state box, which does not shrink
  const right = boxes.find((box, i) => i > 2 && box.props.position !== 'absolute' && box.props.flexShrink === 0)
  expect(right).toBeDefined()
  // a chip per count above zero, in its color: the files in amber after a dot, pull in blue, push in green
  const chips = nodes(right).filter(n => n.type === 'Svg')
  expect(chips.map(c => c.props.alt)).toEqual(['3 changes', '3 to pull', '2 to push'])
  expect(String(chips[0]?.props.source)).toContain('<circle')
  expect(String(chips[0]?.props.source)).toContain('fill="#d97706"')
  expect(String(chips[1]?.props.source)).toContain('fill="#3b82f6"')
  expect(String(chips[2]?.props.source)).toContain('fill="#16a34a"')
  // one hint reads them all
  expect(leaves(right).at(-1)?.text).toBe('3 changes · 3 to pull · 2 to push')
  const trouble = nodes(await desktop.find({ key: 'reporow|/w/stuck' })).find(n => n.type === 'Svg' && n.props.alt === 'needs attention')
  expect(String(trouble?.props.source)).toContain('fill="#e5484d"')
  await desktop.unmount()
  const terminal = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  expect(await rowTexts(terminal, '/w/busy')).toEqual(['busy', 'main', '●3', '↓3', '↑2'])
  expect(nodes(await terminal.find({ key: 'reporow|/w/busy' })).some(n => n.type === 'Svg')).toBe(false)
  expect((await rowOf(terminal, '/w/busy')).slice(2).map(l => l.props.color)).toEqual(['#d97706', '#3b82f6', '#16a34a'])
  expect((await rowOf(terminal, '/w/stuck')).find(l => l.text === '!')?.props.color).toBe('#e5484d')
  await terminal.unmount()
})

test('the repositories header folds the list away, the detail stays, and a second press brings it back', async ($, on) => {
  const names = Array.from({ length: 12 }, (_, i) => `r${String(i + 1).padStart(2, '0')}`)
  world(on, { repos: names, status: cwd => (cwd === '/w/r12' ? status() : status({ behind: 1 })) })
  await open($)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'code-control', surface, ...PANE })
    const chevron = async () => shown(await ui.find({ key: 'head|section|repos' }))[0]
    // a clear button over the row where a pointer reaches, the title the button on the terminal
    expect((await ui.find({ key: 'section|repos' }))?.props.plain).toBe(true)
    // the title in the same type and color as the other blocks' (Changes, Graph): not dim
    const title = surface === 'desktop' ? await ui.find({ type: 'Text', text: 'Repositories' }) : await ui.find({ key: 'section|repos' })
    expect(title?.props.dimColor).toBeUndefined()
    if (surface === 'terminal') expect(title?.props.label).toBe('Repositories')
    expect(shown(await ui.find({ key: 'head|section|repos' }))[2]).toBe(surface === 'desktop' ? '[12]' : '12')
    expect(await chevron()).toBe(surface === 'desktop' ? '[Expanded]' : '▾')
    expect(await listed(ui)).toEqual(names.slice(0, 8))
    await ui.press({ key: 'section|repos' })
    expect(await chevron()).toBe(surface === 'desktop' ? '[Collapsed]' : '▸')
    expect(await listed(ui)).toEqual([])
    expect(await ui.find({ key: 'morerepos' })).toBeUndefined()
    expect(await ui.find({ key: 'branch|/w/r01' })).toBeDefined()
    expect(await ui.find({ key: 'pull|/w/r01' })).toBeDefined()
    await ui.press({ key: 'section|repos' })
    expect(await chevron()).toBe(surface === 'desktop' ? '[Expanded]' : '▾')
    expect(await listed(ui)).toEqual(names.slice(0, 8))
    expect(await ui.find({ key: 'morerepos' })).toBeDefined()
    await ui.unmount()
  }
})

// the element whose children hold the one with this key
const holderOf = (tree: Node[], key: string) => tree.find(n => n.children.some(c => typeof c === 'object' && c !== null && (c as { props?: { key?: unknown } }).props?.key === key))

test('the detail: the repository, its branch picker and pull and push, then one packed commit row', async ($, on) => {
  world(on, { status: status({ ahead: 1, behind: 2, files: [changed('src/app.ts')] }) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const tree = nodes(await ui.drawn())
  // no card: the selected row's tint and the bold header set the detail apart
  expect(tree.some(n => n.type === 'Box' && n.props.borderStyle !== undefined)).toBe(false)
  const detail = tree.find(n => n.props.key === 'detail')
  expect(detail?.props).toMatchObject({ flexDirection: 'column', marginTop: 1 })
  const inside = nodes(detail)
  expect(String(inside.find(n => n.type === 'Svg')?.props.source)).toContain('#3b82f6')
  expect(inside.find(n => n.type === 'Text' && n.children[0] === 'app')?.props.bold).toBe(true)
  expect(holderOf(inside, 'branch|/w/app')?.props).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0, overflow: 'hidden' })
  // pull and push at the header's right, as counts with hints
  expect(shown(holderOf(inside, 'tip|pull|/w/app'))).toEqual(['↓2', 'Pull 2 commits', '↑1', 'Push 1 commit'])
  // the field, ✦, Commit and the ⋯ menu packed on one row, each with its hint
  const row = holderOf(inside, 'msg|/w/app')
  expect(row?.props).toMatchObject({ flexDirection: 'row', alignItems: 'center', gap: 1 })
  expect(nodes(row).filter(n => n.type === 'Button' || n.type === 'Select').map(n => [n.type, n.props.key])).toEqual([
    ['Button', 'gen|/w/app'],
    ['Button', 'commit|/w/app'],
    ['Select', 'moreactions|/w/app'],
  ])
  expect(nodes(row).flatMap(n => (n.type === 'Text' ? [n.children[0]] : []))).toEqual(['Write the message with Claude', 'Commit the 1 change', 'Amend, undo, stash'])
  // ✦ and Commit sit on the left, so their hints grow to the right; ⋯'s grows to the left
  const hint = (key: string) => nodes(holderOf(inside, key)).find(n => n.props.position === 'absolute')?.props
  expect(hint('gen|/w/app')).toMatchObject({ top: -1, left: 0 })
  expect(hint('commit|/w/app')).toMatchObject({ top: -1, left: 0 })
  expect(hint('moreactions|/w/app')).toMatchObject({ top: -1, right: 0 })
  // the commit row, the groups and the sections one blank line apart
  type Child = { props?: Record<string, unknown>; children?: Child[] }
  const direct = (detail?.children ?? []) as Child[]
  const holding = (key: string) => direct.find(c => nodes(c).some(n => n.props.key === key))
  expect(holding('msg|/w/app')?.props?.marginTop).toBe(1)
  expect(holding('head|group|/w/app|changes')?.props?.marginTop).toBe(1)
  expect(holding('head|section|/w/app|incoming')?.props?.marginTop).toBe(1)
  await ui.unmount()
  // the terminal words pull and push, with no pointer to show a hint
  const terminal = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  expect((await terminal.find({ key: 'pull|/w/app' }))?.props.label).toBe('Pull ↓2')
  expect((await terminal.find({ key: 'push|/w/app' }))?.props.label).toBe('Push ↑1')
  expect(await terminal.find({ key: 'tip|pull|/w/app' })).toBeUndefined()
  await terminal.unmount()
})

const deleted = (path: string) => `1 .D N... 100644 100644 000000 a a ${path}`

test('a file row: the type mark, the name pressed for the diff, the folder dim, the actions and the letter with hints', async ($, on) => {
  world(on, { status: status({ files: [changed('src/app.ts'), deleted('docs/old.md'), staged('package.json'), '? notes.md'] }) })
  await open($)
  const desktop = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const tree = nodes(await desktop.drawn())
  const line = (id: string) => tree.find(n => n.props.key === `line|/w/app|${id}`)
  const app = line('changes|src/app.ts')
  expect(app?.props).toMatchObject({ flexDirection: 'row', alignItems: 'center', paddingLeft: 2, paddingRight: 1 })
  expect(app?.hover).toEqual({ backgroundColor: '#8080801a' })
  expect(shown(app)).toEqual(['[File]', 'app.ts', 'src', '↗', 'Open file', '↶', 'Discard changes', '+', 'Stage', 'M', 'Modified'])
  expect(String(nodes(app).find(n => n.type === 'Svg')?.props.source)).toContain('>TS</text>')
  const name = nodes(app).find(n => n.type === 'Button')
  expect(name?.props).toMatchObject({ key: 'diff|/w/app|changes|src/app.ts', plain: true, label: 'app.ts' })
  expect(name?.props.dimColor).toBeUndefined()
  expect(leaves(app).find(l => l.text === 'src')?.props).toEqual({ dimColor: true, wrap: 'truncate-start' })
  expect(leaves(app).find(l => l.text === 'M')?.props).toEqual({ color: '#d97706', bold: true })
  // the actions wait for the pointer; the letter stays
  const actions = nodes(app).find(n => n.type === 'Box' && n.props.display === 'none' && n.props.position === undefined)
  expect(actions?.hover).toEqual({ display: 'flex' })
  expect(nodes(actions).some(n => n.type === 'Button' && n.props.label === '+')).toBe(true)
  const old = line('changes|docs/old.md')
  expect(shown(old)).toEqual(['[File]', 'old.md', 'docs', '↶', 'Discard changes', '+', 'Stage', 'D', 'Deleted'])
  expect(nodes(old).find(n => n.type === 'Button')?.props.dimColor).toBe(true)
  expect(leaves(old).find(l => l.text === 'D')?.props.color).toBe('#e5484d')
  expect(shown(line('staged|package.json'))).toEqual(['[File]', 'package.json', '↗', 'Open file', '−', 'Unstage', 'M', 'Modified'])
  expect(String(nodes(line('staged|package.json')).find(n => n.type === 'Svg')?.props.source)).toContain('>{ }</text>')
  expect(leaves(line('changes|notes.md')).find(l => l.text === 'U')?.props.color).toBe('#16a34a')
  await desktop.unmount()
  const terminal = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  expect(shown(await terminal.find({ key: 'row|/w/app|changes|src/app.ts' }))).toEqual(['app.ts', 'src', '↗', '↶', '+', 'M'])
  expect(shown(await terminal.find({ key: 'head|group|/w/app|changes' }))).toEqual(['▾', 'Changes', '+', '3'])
  await terminal.unmount()
})

test('a group shows 50 files, and the rest behind its own button', async ($, on) => {
  const files = Array.from({ length: 53 }, (_, i) => changed(`f${String(i).padStart(2, '0')}.ts`))
  world(on, { status: status({ files }) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const rows = async () => (await ui.findAll({ type: 'Box' })).filter(b => String(b.key).startsWith('row|/w/app|changes|')).length
  expect(await rows()).toBe(50)
  const more = nodes(await ui.drawn()).find(n => n.props.key === 'morerow|/w/app|changes')
  expect(more?.props.paddingLeft).toBe(2)
  expect((await ui.find({ key: 'more|/w/app|changes' }))?.props).toMatchObject({ label: '+ 3 files', plain: true, dimColor: true })
  await ui.press({ key: 'more|/w/app|changes' })
  expect(await rows()).toBe(53)
  await ui.unmount()
})

test('a conflict row has the file icon, the name in red, the ! last, and keeps its buttons', async ($, on) => {
  world(on, { status: CONFLICT, gitDir: ['MERGE_HEAD'] })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const row = await ui.find({ key: 'row|/w/app|conflicts|src/app.ts' })
  expect(shown(row).slice(0, 4)).toEqual(['[File]', 'app.ts', 'src', '!'])
  expect(leaves(row)[0]?.props.color).toBe('#e5484d')
  for (const key of ['view', 'mine', 'theirs', 'open', 'resolved', 'claude']) expect(await ui.find({ key: `${key}|/w/app|conflicts|src/app.ts` })).toBeDefined()
  await ui.unmount()
})

test('icons are Svg where the surface has it; the terminal draws none and shows ▾ and ▸ for the chevrons', async ($, on) => {
  world(on, { status: status({ ahead: 1, behind: 2, files: [changed('src/app.ts')] }) })
  await open($)
  const desktop = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const alts = (await desktop.findAll({ type: 'Svg' })).map(svg => String(svg.props.alt))
  expect([...new Set(alts)].sort()).toEqual(['1', '1 change', '1 to push', '2 to pull', 'Branch', 'Collapsed', 'Expanded', 'File', 'Graph', 'Incoming', 'Repository'])
  expect(await desktop.find({ type: 'Text', text: '▾' })).toBeUndefined()
  expect(await desktop.find({ type: 'Text', text: '▸' })).toBeUndefined()
  await desktop.unmount()
  const terminal = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  expect(await terminal.findAll({ type: 'Svg' })).toHaveLength(0)
  // ▾ before the open repository list and the Changes group, ▸ before the closed Incoming and Graph
  expect(shown(await terminal.find({ key: 'head|section|repos' }))[0]).toBe('▾')
  expect(shown(await terminal.find({ key: 'head|group|/w/app|changes' }))[0]).toBe('▾')
  expect(shown(await terminal.find({ key: 'head|section|/w/app|incoming' }))[0]).toBe('▸')
  expect(shown(await terminal.find({ key: 'head|history|/w/app' }))[0]).toBe('▸')
  expect(await rowTexts(terminal, '/w/app')).toEqual(['app', 'main', '●1', '↓2', '↑1'])
  await terminal.unmount()
})

test('a repository with 13 files, 2 staged and 1 conflict draws on every surface', async ($, on) => {
  const files = [staged('src/a.ts'), staged('src/b.json'), ...Array.from({ length: 10 }, (_, i) => changed(`docs/page-${i}.md`)), unmerged('src/c.tsx')]
  const states: Record<string, string> = { '/w/app': status({ ahead: 1, behind: 3, files }), '/w/other': status({ behind: 4 }) }
  world(on, { repos: ['app', 'other'], status: cwd => states[cwd] ?? status(), gitDir: ['MERGE_HEAD'] })
  await open($)
  const desktop = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  for (const key of ['section|/w/app|incoming', 'history|/w/app', 'diff|/w/app|changes|docs/page-0.md', 'view|/w/app|conflicts|src/c.tsx']) await desktop.press({ key })
  await desktop.unmount()
  for (const surface of ['desktop', 'terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'code-control', surface, ...PANE })
    expect(await ui.drawn()).toMatchObject({ type: 'Box' })
    // a count is a chip where Svg draws (its alt in brackets), the number itself on the terminal
    const asShown = (n: string) => (surface === 'terminal' ? n : `[${n}]`)
    const count = async (group: string) => shown(await ui.find({ key: `head|group|/w/app|${group}` })).at(-1)
    expect(await count('conflicts')).toBe(asShown('1'))
    expect(await count('staged')).toBe(asShown('2'))
    expect(await count('changes')).toBe(asShown('10'))
    expect(shown(await ui.find({ key: 'reporow|/w/app' }))).toContain(surface === 'terminal' ? '●13' : '[13 changes]')
    expect(await ui.find({ key: 'reporow|/w/other' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Merge in progress · 1 conflict' })).toBeDefined()
    expect((await ui.findAll({ type: 'Svg' })).length > 0).toBe(surface !== 'terminal')
    expect((await ui.find({ key: 'msg|/w/app' })) !== undefined).toBe(surface !== 'mobile')
    await ui.unmount()
  }
})

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 80, scroll: { offset: 0, bodyRows: 7 }, view: {} } } as const

// The session starting, and beneath the plugin what the engine draws in the band when no hook does.
const start = async ($: { session: { start: (input: never) => Promise<unknown> } }, on: On) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({ key: 'engine-band' }))
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true } as never)
}

test('the row above the prompt: the selected repository, its state, how many others have something, and a press opens the pane', async ($, on) => {
  const states: Record<string, string> = { '/w/busy': status({ ahead: 2, behind: 3, files: [changed('a'), changed('b'), changed('c')] }), '/w/calm': status(), '/w/late': status({ behind: 1 }) }
  // no /code-control: the session's start reads the repositories for the row
  const { calls, clock } = world(on, { repos: ['busy', 'calm', 'late'], status: cwd => states[cwd] ?? status() })
  await start($, on)
  await clock.settle()
  const desktop = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...BAND })
  const band = await desktop.find({ key: 'band' })
  expect(shown(band)).toEqual(['[Repository]', 'busy', '[Branch]', 'main', '[3 changes]', '[3 to pull]', '[2 to push]', '+1 more'])
  // no hint: the band clips anything drawn above its one row
  expect(nodes(band).some(n => n.props.display === 'none')).toBe(false)
  const cover = nodes(band).find(n => n.type === 'Box' && n.props.position === 'absolute')
  expect(cover?.props).toMatchObject({ top: 0, left: 0, right: 0, height: 1, overflow: 'hidden' })
  // the clear label stops short of the row's end, so the surface cuts nothing with an ellipsis
  const label = String(nodes(cover).find(n => n.type === 'Button')?.props.label)
  expect(isBlank(label)).toBe(true)
  expect(label.length).toBeLessThan(80)
  expect(calls).not.toContain('open code-control')
  await desktop.press({ key: 'band|open' })
  expect(calls).toContain('open code-control')
  await desktop.unmount()
  const terminal = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...BAND })
  expect((await terminal.find({ key: 'band|open' }))?.props.label).toBe('busy')
  await terminal.unmount()
})

test('the row above the prompt yields to a survey and draws nothing without a repository', async ($, on) => {
  const { clock } = world(on)
  await start($, on)
  await clock.settle()
  const survey = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...BAND, props: { ...BAND.props, hasSurvey: true } })
  expect(await survey.find({ key: 'band' })).toBeUndefined()
  await survey.unmount()
})

test('without a repository the row above the prompt draws nothing', async ($, on) => {
  const { clock } = world(on, { repos: [] })
  await start($, on)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...BAND })
  expect(await ui.find({ key: 'band' })).toBeUndefined()
  expect(await ui.find({ key: 'engine-band' })).toBeDefined()
  await ui.unmount()
})

test('the focus ring landing on a list row by the person selects it; a plugin moving it, or another element, does not', () => {
  expect(focusedRepo({ element: 'select|/w/app', origin: { kind: 'person' } })).toBe('/w/app')
  expect(focusedRepo({ element: 'select|/w/app', origin: { kind: 'plugin' } })).toBeNull()
  expect(focusedRepo({ element: 'stage|/w/app|changes|a', origin: { kind: 'person' } })).toBeNull()
  expect(focusedRepo({ origin: { kind: 'person' } })).toBeNull()
})

test('with the row above the prompt turned off, it draws nothing and the session starts without reading the repositories', { options: { showStatusRow: false } }, async ($, on) => {
  const { calls, clock } = world(on)
  await start($, on)
  await clock.settle()
  expect(calls.some(c => c.startsWith('status '))).toBe(false)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...BAND })
  expect(await ui.find({ key: 'band' })).toBeUndefined()
  expect(await ui.find({ key: 'engine-band' })).toBeDefined()
  await ui.unmount()
})

// The settings as /config lists them, holding the row above the prompt's field; `sets` records changes.
const settingsWith = (on: On, shown: boolean) => {
  const state = { shown, sets: [] as unknown[] }
  on('config.list', () => ({
    value: [{ key: 'code-control.showStatusRow', label: 'Row above the prompt', kind: 'boolean', value: state.shown, provider: { plugin: 'code-control', tier: 'user' }, isLocked: false }],
  }))
  on('config.set', ($, e) => {
    state.sets.push(e.value)
    state.shown = e.value === true
    return { value: e.value }
  })
  return state
}

test('the pane ⋯ turns the row above the prompt off and on, in the setting /config shows', async ($, on) => {
  const settings = settingsWith(on, true)
  world(on)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({ key: 'engine-band' }))
  await open($)
  const pane = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const menu = async () => (await pane.find({ key: 'settings|pane' }))?.props as { value: string; options: { value: string; label: string }[] } | undefined
  expect((await menu())?.value).toBe('more|0')
  expect((await menu())?.options).toEqual([
    { value: 'more|0', label: '⋯' },
    { value: 'row', label: 'Hide the row above the prompt' },
  ])
  const band = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...BAND })
  expect(await band.find({ key: 'band' })).toBeDefined()
  await pane.select({ key: 'settings|pane', value: 'row' })
  expect(settings.sets).toEqual([false])
  await band.redraw()
  await pane.redraw()
  expect(await band.find({ key: 'band' })).toBeUndefined()
  expect((await menu())?.options[1]?.label).toBe('Show the row above the prompt')
  expect((await menu())?.value).toBe('more|1')
  await pane.select({ key: 'settings|pane', value: 'row' })
  expect(settings.sets).toEqual([false, true])
  await band.redraw()
  expect(await band.find({ key: 'band' })).toBeDefined()
  await band.unmount()
  await pane.unmount()
})

test('where the settings list no row for it, the pane ⋯ still hides the row above the prompt for the session', async ($, on) => {
  world(on)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({ key: 'engine-band' }))
  await open($)
  const pane = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await pane.select({ key: 'settings|pane', value: 'row' })
  const band = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...BAND })
  expect(await band.find({ key: 'band' })).toBeUndefined()
  await pane.redraw()
  expect(((await pane.find({ key: 'settings|pane' }))?.props.options as { label: string }[])[1]?.label).toBe('Show the row above the prompt')
  await band.unmount()
  await pane.unmount()
})

test('list rows stand 24 pixels tall where Svg draws, repository rows 32: each one leads with an icon drawn in a box that tall', async ($, on) => {
  world(on, { status: status({ behind: 1, files: [changed('src/app.ts')] }) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const tree = nodes(await ui.drawn())
  const lead = (key: string) => nodes(tree.find(n => n.props.key === key)).find(n => n.type === 'Svg')?.props.height
  expect(lead('reporow|/w/app')).toBe(32)
  for (const key of ['line|/w/app|changes|src/app.ts', 'head|group|/w/app|changes', 'head|section|repos', 'head|section|/w/app|incoming']) expect(lead(key)).toBe(24)
  await ui.unmount()
})

test('a block head opens and closes from anywhere on its row where a pointer reaches', async ($, on) => {
  world(on, { status: status({ behind: 1, files: [changed('a')] }) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  for (const key of ['section|repos', 'section|/w/app|incoming', 'history|/w/app']) {
    const head = nodes(await ui.find({ key: `head|${key}` }))
    expect(head[0]?.props.position).toBe('relative')
    const cover = head.find(n => n.type === 'Box' && n.props.position === 'absolute' && n.props.height === 1)
    expect(cover?.props).toMatchObject({ top: 0, left: 0, right: 0 })
    expect(nodes(cover).find(n => n.type === 'Button')?.props.key).toBe(key)
  }
  await ui.press({ key: 'section|/w/app|incoming' })
  expect(shown(await ui.find({ key: 'head|section|/w/app|incoming' }))[0]).toBe('[Expanded]')
  await ui.unmount()
})

test('a click that only gives the pane the keys still flips the block toggle it lands on', async () => {
  const flips: string[] = []
  const actions = { toggle: async (key: string, current: boolean) => void flips.push(`${key}:${current}`), toggleHistory: async (repo: string) => void flips.push(`history:${repo}`) } as never
  const ui = { open: { 'section|/w/app|stash': true } } as never
  await toggleOnTake('section|repos', ui, actions)?.()
  await toggleOnTake('morerepos', ui, actions)?.()
  await toggleOnTake('section|/w/app|stash', ui, actions)?.()
  await toggleOnTake('history|/w/app', ui, actions)?.()
  expect(flips).toEqual(['section|repos:true', 'morerepos:false', 'section|/w/app|stash:true', 'history:/w/app'])
  expect(toggleOnTake('stage|/w/app|changes|a', ui, actions)).toBeNull()
})

test('a file group opens and closes like the sections, from anywhere on its row', async ($, on) => {
  world(on, { status: status({ files: [changed('src/app.ts'), staged('b.ts')] }) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const head = nodes(await ui.find({ key: 'head|group|/w/app|changes' }))
  expect(nodes(head.find(n => n.props.position === 'absolute' && n.props.height === 1)).find(n => n.type === 'Button')?.props.key).toBe('group|/w/app|changes')
  expect(await ui.find({ key: 'row|/w/app|changes|src/app.ts' })).toBeDefined()
  await ui.press({ key: 'group|/w/app|changes' })
  expect(shown(await ui.find({ key: 'head|group|/w/app|changes' }))[0]).toBe('[Collapsed]')
  expect(await ui.find({ key: 'row|/w/app|changes|src/app.ts' })).toBeUndefined()
  // the other group stays open
  expect(await ui.find({ key: 'row|/w/app|staged|b.ts' })).toBeDefined()
  await ui.press({ key: 'group|/w/app|changes' })
  expect(await ui.find({ key: 'row|/w/app|changes|src/app.ts' })).toBeDefined()
  await ui.unmount()
  const flips: string[] = []
  const actions = { toggle: async (key: string, current: boolean) => void flips.push(`${key}:${current}`) } as never
  await toggleOnTake('group|/w/app|changes', { open: {} } as never, actions)?.()
  expect(flips).toEqual(['group|/w/app|changes:true'])
})

test("a commit's hash links to its page on the remote's site; its subject opens its files", async ($, on) => {
  world(on, {
    status: status({ behind: 1 }),
    extra: line =>
      line.startsWith('log --topo-order')
        ? `\x1eC\x1fCs\x1f\x1fAna\x1f1799990000\x1fHEAD -> main\x1fone\n`
        : line === 'show --name-status --format= C'
          ? 'M\tsrc/a.ts\n'
          : line === 'remote get-url origin'
            ? 'https://someone@dev.azure.com/org/project/_git/app.git\n'
            : undefined,
  })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'history|/w/app' })
  const line = nodes(await ui.find({ key: 'histline|commit|/w/app|C' }))
  expect(line.find(n => n.type === 'Link')?.props).toEqual({ href: 'https://dev.azure.com/org/project/_git/app/commit/C', label: 'Cs' })
  // no clear button over the line: the link takes its own click
  expect(line.some(n => n.props.position === 'absolute')).toBe(false)
  await ui.press({ key: 'commit|/w/app|C' })
  expect(await ui.find({ key: 'hist:cfile|/w/app|C|src/a.ts' })).toBeDefined()
  await ui.unmount()
  const calls: string[] = []
  const actions = {
    toggle: async (key: string, current: boolean) => void calls.push(`${key}:${current}`),
    toggleCommit: async (repo: string, hash: string) => void calls.push(`commit:${repo}:${hash}`),
  } as never
  await toggleOnTake('commit|/w/app|C', { open: {} } as never, actions)?.()
  await toggleOnTake('in|/w/app|I', { open: {} } as never, actions)?.()
  expect(calls).toEqual(['commit:/w/app:C', 'in|/w/app|I:false'])
})

test('the Graph shows its first 20 commits and the rest behind their own button', async ($, on) => {
  const log = Array.from({ length: 30 }, (_, i) => `\x1eh${i}\x1fs${i}\x1f${i < 29 ? `h${i + 1}` : ''}\x1fAna\x1f${1799990000 - i}\x1f\x1fc${i}\n`).join('')
  world(on, { extra: line => (line.startsWith('log --topo-order') ? log : undefined) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'history|/w/app' })
  const rows = async () => (await ui.findAll({ type: 'Box' })).filter(b => String(b.key).startsWith('histline|')).length
  expect(await rows()).toBe(20)
  expect((await ui.find({ key: 'histmore|/w/app' }))?.props.label).toBe('+ 10 commits')
  await ui.press({ key: 'histmore|/w/app' })
  expect(await rows()).toBe(30)
  await ui.unmount()
})

test('closing the heavy blocks keeps Repositories and the file groups as they are', () => {
  const ui = { open: { 'section|repos': false, 'group|/w/app|changes': false, 'history|/w/app': true, 'commit|/w/app|C': true, 'section|/w/app|incoming': true, 'in|/w/app|I': true, 'histmore|/w/app': true } } as never
  expect(closeHeavy(ui).open).toEqual({ 'section|repos': false, 'group|/w/app|changes': false })
})

test('a drawing past what the surface draws closes the heavy blocks and shows fewer files, rather than leave the pane blank', async ($, on) => {
  const deep = (i: number) => `src/features/settings/panels/section-${i}/settings-panel-number-${i}.component.ts`
  const files = [...Array.from({ length: 60 }, (_, i) => staged(deep(i))), ...Array.from({ length: 60 }, (_, i) => changed(deep(100 + i)))]
  world(on, { status: status({ ahead: 3, behind: 40, files }) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn.length).toBeLessThanOrEqual(200_000)
  const rows = (await ui.findAll({ type: 'Box' })).filter(b => String(b.key).startsWith('row|/w/app|changes|')).length
  expect(rows).toBe(15)
  expect((await ui.find({ key: 'more|/w/app|changes' }))?.props.label).toBe('+ 45 files')
  await ui.unmount()
})

test('past what the surface draws, the Graph stays open with fewer commits rather than close', async ($, on) => {
  const log = Array.from({ length: 50 }, (_, i) => `\x1eh${i}\x1fs${i}\x1f${i < 49 ? `h${i + 1}` : ''}\x1fAna\x1f${1799990000 - i}\x1f\x1fc${i}\n`).join('')
  const deep = (i: number) => `src/features/settings/panels/section-${i}/settings-panel-number-${i}.component.ts`
  const files = Array.from({ length: 50 }, (_, i) => changed(deep(i)))
  world(on, { status: status({ files }), extra: line => (line.startsWith('log --topo-order') ? log : undefined) })
  await open($)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'history|/w/app' })
  expect(JSON.stringify(await ui.drawn()).length).toBeLessThanOrEqual(240_000)
  expect(shown(await ui.find({ key: 'head|history|/w/app' }))[0]).toBe('[Expanded]')
  const rows = (await ui.findAll({ type: 'Box' })).filter(b => String(b.key).startsWith('histline|')).length
  expect(rows).toBeGreaterThan(0)
  await ui.unmount()
})
