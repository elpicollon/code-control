import { atom, read, update } from 'claude-code'
import type { ConfigRow, EngineInterface, PluginOptions, Register, RenderElement, Timer } from 'claude-code'
import type { RepoSnapshot } from '../types'
import { createController, emptyDetails, emptyUi, type Controller } from './controller'
import { createGit } from './git/run'
import type { Host } from './host'
import { localeArgv, parseLocale, pickLanguage, translator, type T } from './i18n'
import { openArgv } from './paths'
import { detached, fetchMinutes } from './schedule'
import { BAND_PRESS, BandView } from './ui/band'
import { toKit } from './ui/kit'
import { closeHeavy, focusedRepo, PaneView, ROW_SETTING, SETTINGS, toggleOnTake } from './ui/pane'

const PANE = 'code-control'
const STATUS_EVERY_MS = 30_000
const WRITERS = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash'])
// The row above the prompt, unless the person turned it off: as the settings hold it now, since the
// pane's ⋯ or /config may change it while the module runs; the value it loaded with when they cannot
// be read.
const ROW_FIELD = 'showStatusRow'
const rowSetting = async ($: EngineInterface): Promise<ConfigRow | undefined> =>
  (await $.config.list().catch(() => [] as ConfigRow[])).find(row => row.provider.plugin === PANE && row.key.endsWith(`.${ROW_FIELD}`))
// Where the settings list no such row (a plugin loaded from a folder may have none), the pane's ⋯ keeps
// its choice for the session here.
let rowChoice: boolean | null = null

// Whether the pane held the keys when it last drew, so a focus landing can tell the click that gives it
// them from a Tab inside it.
let paneHasKeys = false

// How many picks the pane's menus have taken (PaneModel `picks`); the key of a repository's ⋯ menu.
let menuPicks = 0
const MORE_ACTIONS = 'moreactions|'
const showsRow = async ($: EngineInterface, options: PluginOptions): Promise<boolean> => {
  const row = await rowSetting($)
  return typeof row?.value === 'boolean' ? row.value : (rowChoice ?? options[ROW_FIELD] !== false)
}

const repos = atom({ plugin: 'code-control', key: 'repos' } as const, [] as RepoSnapshot[])
const ui = atom({ plugin: 'code-control', key: 'ui' } as const, emptyUi())
const details = atom({ plugin: 'code-control', key: 'details' } as const, emptyDetails())

type App = { t: T; controller: Controller }

let app: App | null = null
let building: Promise<App> | null = null
let timers: Timer[] = []
let pending: Timer | null = null

// macOS and Windows keep it in their settings; elsewhere it is the environment, LC_ALL first.
const systemLocale = async ($: EngineInterface, platform: string, lang: string | undefined): Promise<string | undefined> => {
  const argv = localeArgv(platform)
  if (argv === null) return [await $.env.get('LC_ALL'), await $.env.get('LC_MESSAGES'), lang].find(v => v !== undefined && v !== '')
  const answer = await $.process.run(argv, { timeoutMs: 5_000 }).catch(() => null)
  return answer !== null && answer.exitCode === 0 ? parseLocale(platform, answer.stdout) : undefined
}

const build = async ($: EngineInterface, options: PluginOptions): Promise<App> => {
  const settings = await $.settings.read()
  const uname = await $.process.run(['uname', '-s'], { timeoutMs: 5_000 }).catch(() => null)
  const platform = uname !== null && uname.exitCode === 0 ? uname.stdout.trim() : 'Windows'
  const lang = await $.env.get('LANG')
  const t = translator(pickLanguage(String(options.language ?? 'auto'), settings.language, lang, await systemLocale($, platform, lang)))
  const host: Host = {
    run: (argv, o) => $.process.run(argv, { cwd: o.cwd, ...(o.env === undefined ? {} : { env: o.env }), ...(o.timeoutMs === undefined ? {} : { timeoutMs: o.timeoutMs }) }),
    list: path => $.fs.list(path),
    readText: path => $.fs.read(path),
    complete: request => $.model.complete({ model: request.model, system: request.system, prompt: request.prompt, maxTokens: 400, timeoutMs: request.timeoutMs }),
    submit: async text => {
      await $.prompt.submit({ text })
    },
    open: async path => {
      await $.process.run(openArgv(platform, path), { timeoutMs: 10_000 })
    },
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
  }
  const roots = async (): Promise<string[]> => {
    const permissions = settings.permissions as { additionalDirectories?: unknown } | undefined
    const extra = Array.isArray(permissions?.additionalDirectories)
      ? permissions.additionalDirectories.filter((d): d is string => typeof d === 'string')
      : []
    return [...new Set([await $.session.cwd(), await $.session.root(), ...extra])]
  }
  const controller = createController({
    git: createGit(host),
    host,
    t,
    roots,
    model: String(options.commitMessageModel ?? 'sonnet'),
    repos: { read: () => read($, repos), update: async fn => void (await update($, repos, fn)) },
    ui: { read: () => read($, ui), update: async fn => void (await update($, ui, fn)) },
    details: { read: () => read($, details), update: async fn => void (await update($, details, fn)) },
  })
  return { t, controller }
}

// One app per module load: a second /code-control must not make a second git queue or in-flight set.
const ensureApp = ($: EngineInterface, options: PluginOptions): Promise<App> => {
  if (app !== null) return Promise.resolve(app)
  building ??= build($, options).then(
    built => {
      app = built
      return built
    },
    error => {
      building = null
      throw error
    },
  )
  return building
}

const stopTimers = (): void => {
  for (const timer of timers) timer.cancel()
  timers = []
  pending?.cancel()
  pending = null
}

const startTimers = ($: EngineInterface, options: PluginOptions): void => {
  stopTimers()
  timers.push($.clock.every(STATUS_EVERY_MS, detached(() => app?.controller.startRefresh(false))))
  const minutes = fetchMinutes(options.fetchIntervalMinutes)
  if (minutes > 0) timers.push($.clock.every(minutes * 60_000, detached(() => app?.controller.fetchAll(false))))
}

// The most a pane's drawing may weigh, serialized: past some size the surface draws nothing and leaves
// the pane blank (one of 305,000 characters did; the same pane a little lighter drew), so it draws
// lighter before that.
const DRAW_BUDGET = 240_000
const FEW_FILES = 15
const FEW_COMMITS = 10
// The pane draws often: the notice shows once, again only after a minute without drawing too much.
const TRIM_NOTICE_MS = 60_000
let trimmedAt = 0

export const register: Register = (on, options) => {
  // The row above the prompt shows the repositories from the start, so with it they are read, and kept
  // fresh, whether the pane is open or not; without it, only while the pane is open.
  on('session.start', async ($, e, next) => {
    const current = await ensureApp($, options)
    await $.command.register({ name: PANE, description: current.t('commandDescription') })
    const isRowShown = await showsRow($, options)
    if (isRowShown) void current.controller.startRefresh(true).catch(() => undefined)
    if (isRowShown || (await $.ui.panes()).some(pane => pane.id === PANE)) startTimers($, options)
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && !(await showsRow($, options))) stopTimers()
    return next(e)
  })

  on('command.run', { command: PANE }, async $ => {
    const current = await ensureApp($, options)
    const placed = await $.ui.open({ id: PANE, title: current.t('title') })
    if (!placed.isPlaced) return { text: current.t('notPlaced', { reason: placed.reason }) }
    // The answer waits for discovery (a new repository shows) and the timers only: the reads and the
    // fetch go on after it, since a repository's git calls may wait minutes behind a push or pull.
    await current.controller.startRefresh(true)
    startTimers($, options)
    if (fetchMinutes(options.fetchIntervalMinutes) > 0) void current.controller.fetchAll(false).catch(() => undefined)
    return { text: current.t('opened') }
  }).catch(async (_$, _e, next) => ({ text: next.error.message ?? next.error.kind }))

  on('tool.call', async ($, e, next) => {
    const answer = await next(e)
    if (timers.length > 0 && WRITERS.has(String(e.tool))) {
      pending?.cancel()
      pending = $.clock.after(1_000, detached(() => app?.controller.startRefresh(false)))
    }
    return answer
  }).catch(($, e, next) => next(e))

  // A click on a site that does not hold the keys only lands its focus ring on the element under the
  // pointer, and presses nothing. On a list row any landing by the person selects the repository; on a
  // block's toggle that first landing opens or closes it (a Tab once the pane holds the keys does not).
  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const isTake = !paneHasKeys
    const answer = await next(e)
    const actions = app?.controller.actions
    const repo = focusedRepo(e)
    if (actions === undefined) return answer
    if (repo !== null) await actions.select(repo)
    else if (isTake && e.origin.kind === 'person' && e.element !== undefined) await toggleOnTake(e.element, await read($, ui), actions)?.()
    return answer
  })

  // The same on the row above the prompt: the ring landing there opens the pane.
  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    const answer = await next(e)
    if (e.origin.kind === 'person' && e.element === BAND_PRESS) {
      const current = await ensureApp($, options)
      await $.ui.open({ id: PANE, title: current.t('title') })
    }
    return answer
  })

  // The pane's ⋯ turns the row above the prompt on or off, in the settings /config shows too; then the
  // row and the menu draw again. With the row on, the repositories are kept fresh from now on.
  on('ui.select', { component: 'Pane' }, async ($, e, next) => {
    const answer = await next(e)
    // every pick of a menu (this one, a repository's ⋯) draws it at rest again
    if (e.element === SETTINGS || e.element.startsWith(MORE_ACTIONS)) {
      menuPicks += 1
      $.ui.invalidate('ui.render')
    }
    if (e.element !== SETTINGS || e.value !== ROW_SETTING) return answer
    const current = await ensureApp($, options)
    const row = await rowSetting($)
    const isShown = await showsRow($, options)
    const set = row === undefined ? null : await $.config.set({ key: row.key, value: !isShown })
    if (set?.deny !== undefined) $.ui.toast(current.t('settingRefused', { reason: set.deny }))
    else {
      if (row === undefined) rowChoice = !isShown
      if (!isShown) {
        void current.controller.startRefresh(true).catch(() => undefined)
        startTimers($, options)
      }
    }
    $.ui.invalidate('ui.render')
    return answer
  })

  // Pressing the row above the prompt opens the pane: the press is the person's asking, so the pane
  // is placed at any width.
  on('ui.press', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.element === BAND_PRESS) {
      const current = await ensureApp($, options)
      await $.ui.open({ id: PANE, title: current.t('title') })
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await showsRow($, options))) return next(e)
    const current = await ensureApp($, options)
    const band = BandView(toKit($.ui.resolve(e), e.surface), {
      repos: await read($, repos),
      ui: await read($, ui),
      details: await read($, details),
      now: await $.clock.now(),
      t: current.t,
      columns: e.props.bodyColumns,
      isRowShown: true,
      picks: menuPicks,
    })
    return band ?? next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const current = await ensureApp($, options)
    paneHasKeys = e.props.isFocused
    const model = {
      repos: await read($, repos),
      ui: await read($, ui),
      details: await read($, details),
      now: await $.clock.now(),
      t: current.t,
      columns: e.props.bodyColumns,
      isRowShown: await showsRow($, options),
      picks: menuPicks,
    }
    const kit = toKit($.ui.resolve(e), e.surface)
    // A drawing that throws leaves the pane blank; the error shows in it instead.
    try {
      const fits = (tree: RenderElement): boolean => JSON.stringify(tree).length <= DRAW_BUDGET
      let tree = PaneView(kit, model, current.controller.actions)
      if (fits(tree)) return tree
      // Past what the surface draws, the pane would stay blank: draw it lighter, step by step, and say so
      // (a drawing reads state and writes none). First without the open diffs, then with fewer commits
      // and files, the Graph still open; only then with the heavy blocks closed.
      const now = await $.clock.now()
      if (now - trimmedAt > TRIM_NOTICE_MS) $.ui.toast(current.t('trimmed'))
      trimmedAt = now
      const noDiffs = { ...model, details: { ...model.details, diffs: {} } }
      const shorter = { ...noDiffs, listCap: FEW_COMMITS, fileCap: FEW_FILES }
      for (const lighter of [noDiffs, shorter, { ...shorter, ui: closeHeavy(model.ui) }]) {
        tree = PaneView(kit, lighter, current.controller.actions)
        if (fits(tree)) return tree
      }
      return tree
    } catch (error) {
      const { Text } = kit
      return <Text color="error">{`code-control: ${error instanceof Error ? error.message : String(error)}`}</Text>
    }
  })
}
