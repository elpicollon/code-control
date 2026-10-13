import type { RenderElement } from 'claude-code'
import type { RepoSnapshot, UiState } from '../../types'
import { ago, counted } from '../i18n'
import { BranchExtras, BranchSelect } from './branch'
import { ConflictBanner } from './conflict'
import { GroupView } from './files'
import { BLUE, branchIcon, C, GRAY, repoIcon } from './icons'
import { canAct, hoverOnly, menuRest, type Actions, type Kit, type PaneModel } from './kit'
import { HistoryView, IncomingView } from './log'
import { Act, Chevron, Icon, Pill, REPO_ROW_PX, ROW_HOVER, RowPress, SectionHead, SELECTED, SELECTED_HOVER, Tip } from './marks'
import { StashView } from './stash'

export const LISTED = 8

// The repositories list is open unless this key is false; the rest of a long list shows when the other
// is true.
const REPOS_KEY = 'section|repos'
const MORE_REPOS = 'morerepos'
// A repository's Graph toggle, before its path.
const HISTORY = 'history|'

// Files or an operation first, most files first; then behind or ahead, most behind first; then the
// repositories in sync. Ties keep the discovery order.
const tier = (s: RepoSnapshot): number => (s.files.length > 0 || s.operation !== null ? 0 : s.branch.behind > 0 || s.branch.ahead > 0 ? 1 : 2)
const weight = (s: RepoSnapshot): number => {
  const level = tier(s)
  return level === 0 ? s.files.length : level === 1 ? s.branch.behind : 0
}

export const orderRepos = (repos: readonly RepoSnapshot[]): RepoSnapshot[] =>
  repos
    .map((s, i) => ({ s, i }))
    .sort((a, b) => tier(a.s) - tier(b.s) || weight(b.s) - weight(a.s) || a.i - b.i)
    .map(({ s }) => s)

export const isInSync = (s: RepoSnapshot): boolean => tier(s) === 2

// The selection, or the first repository when there is none or it left the list.
export const selectedOf = (ordered: readonly RepoSnapshot[], ui: UiState): RepoSnapshot | undefined =>
  ordered.find(s => s.repo.path === ui.selected) ?? ordered[0]

const needsAttention = (s: RepoSnapshot, ui: UiState): boolean =>
  s.operation !== null || s.files.some(f => f.group === 'conflicts') || ui.errors[s.repo.path] !== undefined || ui.fetchErrors[s.repo.path] !== undefined

// A block of the detail, one blank row above it.
const spaced = (kit: Kit, block: RenderElement | null) => {
  const { Box } = kit
  return block === null ? null : (
    <Box flexDirection="column" marginTop={1}>
      {block}
    </Box>
  )
}

// A repository's state in chips, only those above zero: a red ! for an operation, a conflict or an
// error, the files in amber, the commits to pull in blue and to push in green. One hint reads them all,
// where there is room above the row for it (`hint`).
export const RepoState = (kit: Kit, model: PaneModel, s: RepoSnapshot, hint = true) => {
  const { Box, Text } = kit
  const { t, ui } = model
  const repo = s.repo.path
  const { ahead, behind } = s.branch
  const n = s.files.length
  const parts = [
    needsAttention(s, ui) ? { label: '!', color: C.red, says: t('stateTrouble'), dot: false } : null,
    n > 0 ? { label: String(n), color: C.amber, says: counted(t, 'stateChanges1', 'stateChanges', n), dot: true } : null,
    behind > 0 ? { label: `↓${behind}`, color: C.blue, says: t('stateBehind', { n: behind }), dot: false } : null,
    ahead > 0 ? { label: `↑${ahead}`, color: C.green, says: t('stateAhead', { n: ahead }), dot: false } : null,
  ].filter(p => p !== null)
  return (
    <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
      {ui.busy[repo] === undefined ? null : <Text dimColor>…</Text>}
      {parts.length === 0
        ? null
        : !hint
          ? parts.map(p => Pill(kit, p.label, p.color, p.says, p.dot))
          : Tip(
              kit,
              `state|${repo}`,
              parts.map(p => p.says).join(' · '),
              <Box flexDirection="row" alignItems="center" gap={1}>
                {parts.map(p => Pill(kit, p.label, p.color, p.says, p.dot))}
              </Box>,
            )}
    </Box>
  )
}

// What a press on a toggle does (a block's, or a commit line's), for a click that only gives the pane
// the keys: it lands the focus ring on the toggle and presses nothing, so the landing opens or closes
// it. Null for any other element. Only that first click: once the pane holds the keys, Tab landing on a toggle must not
// flip it.
export const toggleOnTake = (key: string, ui: UiState, actions: Actions): (() => Promise<void>) | null => {
  if (key === REPOS_KEY) return () => actions.toggle(REPOS_KEY, ui.open[REPOS_KEY] !== false)
  if (key === MORE_REPOS) return () => actions.toggle(MORE_REPOS, ui.open[MORE_REPOS] === true)
  if (key.startsWith('section|')) return () => actions.toggle(key, ui.open[key] === true)
  if (key.startsWith('group|')) return () => actions.toggle(key, ui.open[key] !== false)
  if (key.startsWith(HISTORY)) return () => actions.toggleHistory(key.slice(HISTORY.length))
  // a commit's line, in Incoming (`in|<repo>|<hash>`) or the Graph (`commit|<repo>|<hash>`): its files
  const cut = key.lastIndexOf('|')
  if (key.startsWith('in|') && cut > 3) return () => actions.toggle(key, ui.open[key] === true)
  if (key.startsWith('commit|') && cut > 7) return () => actions.toggleCommit(key.slice(7, cut), key.slice(cut + 1))
  return null
}

// The pane's state with its heavy blocks closed (the Graph, Incoming, Stash, the commits opened in them,
// and the rest of a long list), for a drawing grown past what the surface draws; Repositories and the
// file groups stay as they are.
const HEAVY = ['history|', 'histmore|', 'commit|', 'in|', 'inmore|', 'more|']
export const closeHeavy = (ui: UiState): UiState => ({
  ...ui,
  open: Object.fromEntries(
    Object.entries(ui.open).filter(([key]) => !HEAVY.some(prefix => key.startsWith(prefix)) && !(key.startsWith('section|') && key !== REPOS_KEY)),
  ),
})

// The key of a list row's button, before the repository's path.
export const SELECT = 'select|'

// The repository whose list row the focus ring landed on by the person's hand (a click, Tab or the
// arrows), or null: a click on a pane that does not hold the keys only lands the ring and presses
// nothing, so the landing itself selects, as a list's selection follows its focus.
export const focusedRepo = (e: { element?: string; origin: { kind: string } }): string | null =>
  e.origin.kind === 'person' && e.element?.startsWith(SELECT) === true ? e.element.slice(SELECT.length) : null

// One line: the repository icon (blue when selected), the name (bold when selected), the branch cut at
// its end, and its state at the right. Where a pointer reaches it, a clear button over the whole row
// selects it, the selected row's too, so the focus ring keeps an element to stand on once a press
// selects; the state chips sit above that button, so their hint still opens. Elsewhere the name of
// another repository is the button, as a focus ring over the whole row would hide it.
const RepoRow = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot, isSelected: boolean) => {
  const { Box, Text, Button } = kit
  const { t } = model
  const repo = s.repo.path
  const select = () => void actions.select(repo)
  const overRow = hoverOnly(kit)
  return (
    <Box
      key={`reporow|${repo}`}
      position="relative"
      flexDirection="row"
      alignItems="center"
      gap={1}
      paddingLeft={2}
      paddingRight={1}
      {...(isSelected ? { backgroundColor: SELECTED } : {})}
      hover={{ backgroundColor: isSelected ? SELECTED_HOVER : ROW_HOVER }}
    >
      {Icon(kit, repoIcon(isSelected ? BLUE : GRAY), t('altRepo'), 16, REPO_ROW_PX)}
      <Box flexShrink={0}>
        {isSelected || overRow ? <Text bold={isSelected}>{s.repo.label}</Text> : <Button key={`${SELECT}${repo}`} plain label={s.repo.label} onPress={select} />}
      </Box>
      <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        {Icon(kit, branchIcon(GRAY), t('altBranch'), 14)}
        <Text dimColor wrap="truncate-end">
          {s.branch.head ?? t('detached')}
        </Text>
      </Box>
      {overRow ? RowPress(kit, `${SELECT}${repo}`, model.columns, select) : null}
      {RepoState(kit, model, s)}
    </Box>
  )
}

// The key of the pane's settings menu; a `ui.select` hook acts on its pick, as a setting needs `$`.
export const SETTINGS = 'settings|pane'
export const ROW_SETTING = 'row'

// The last fetch as a short time, ↻, and ⋯: the pane's settings, the row above the prompt for now.
const FetchState = (kit: Kit, model: PaneModel, actions: Actions) => {
  const { Box, Text, Select } = kit
  const { t, ui } = model
  return (
    <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
      <Text dimColor wrap="truncate-end">
        {ui.lastFetchAt === null ? t('neverFetched') : ago(t, ui.lastFetchAt / 1000, model.now)}
      </Text>
      {Act(kit, 'refresh', '↻', t('tipFetch'), () => void actions.refresh(), 'left')}
      {Select === undefined
        ? null
        : Tip(
            kit,
            SETTINGS,
            t('tipSettings'),
            <Select
              key={SETTINGS}
              value={menuRest(model).value}
              options={[
                menuRest(model),
                { value: ROW_SETTING, label: model.isRowShown ? t('hideRow') : t('showRow') },
              ]}
              onSelect={() => undefined}
            />,
            'left',
          )}
    </Box>
  )
}

// The header folds the whole list away; the selected repository's detail stays below it.
const RepoList = (kit: Kit, model: PaneModel, actions: Actions, ordered: readonly RepoSnapshot[], selected: RepoSnapshot | undefined) => {
  const { Box, Text, Button } = kit
  const { t, ui } = model
  const isOpen = ui.open[REPOS_KEY] !== false
  const showAll = ui.open[MORE_REPOS] === true
  const hidden = ordered.slice(LISTED)
  const shown = showAll ? ordered : ordered.slice(0, LISTED)
  const moreLabel = showAll ? t('fewerRepos') : t('moreRepos', { n: hidden.length, clean: hidden.filter(isInSync).length })
  return (
    <Box flexDirection="column">
      {SectionHead(kit, t, REPOS_KEY, t('repositories'), isOpen, () => void actions.toggle(REPOS_KEY, isOpen), {
        badge: Pill(kit, String(ordered.length), GRAY, String(ordered.length)),
        end: FetchState(kit, model, actions),
        columns: model.columns,
      })}
      {isOpen ? shown.map(s => RepoRow(kit, model, actions, s, s === selected)) : null}
      {isOpen && hidden.length > 0 ? (
        <Box key="morerepos-row" position="relative" flexDirection="row" alignItems="center" gap={1} paddingLeft={2} hover={{ backgroundColor: ROW_HOVER }}>
          {Chevron(kit, t, showAll, REPO_ROW_PX)}
          {hoverOnly(kit) ? (
            <Text dimColor>{moreLabel}</Text>
          ) : (
            <Button key={MORE_REPOS} plain dimColor label={moreLabel} onPress={() => void actions.toggle(MORE_REPOS, showAll)} />
          )}
          {hoverOnly(kit) ? RowPress(kit, MORE_REPOS, model.columns, () => void actions.toggle(MORE_REPOS, showAll)) : null}
        </Box>
      ) : null}
    </Box>
  )
}

// Pull and push as compact counts where hints explain them, worded elsewhere; Publish for a branch
// with a commit, no upstream and a remote to publish to.
const SyncButtons = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  const { Box, Button } = kit
  if (!canAct(kit)) return null
  const { t } = model
  const repo = s.repo.path
  const { ahead, behind, head, oid, upstream } = s.branch
  const canPublish = upstream === null && oid !== null && head !== null && s.remotes.length > 0
  if (behind === 0 && ahead === 0 && !canPublish) return null
  const compact = hoverOnly(kit)
  return (
    <Box flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
      {behind > 0
        ? Tip(kit, `pull|${repo}`, counted(t, 'tipPull1', 'tipPull', behind), <Button key={`pull|${repo}`} label={compact ? `↓${behind}` : t('pullN', { n: behind })} onPress={() => void actions.pull(repo, 'ff')} />)
        : null}
      {ahead > 0
        ? Tip(kit, `push|${repo}`, counted(t, 'tipPush1', 'tipPush', ahead), <Button key={`push|${repo}`} label={compact ? `↑${ahead}` : t('pushN', { n: ahead })} onPress={() => void actions.push(repo)} />)
        : null}
      {canPublish ? <Button key={`push|${repo}`} label={t('publish')} onPress={() => void actions.push(repo)} /> : null}
    </Box>
  )
}

// The repository icon and name, the branch picker taking the room left, pull and push at the right;
// under it the diverged choice, an error and what the branch picker opened.
const DetailHeader = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  const { Box, Text, Button } = kit
  const { t, ui } = model
  const repo = s.repo.path
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" alignItems="center" gap={1}>
        {Icon(kit, repoIcon(BLUE), t('altRepo'), 16)}
        <Box flexShrink={0}>
          <Text bold>{s.repo.label}</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          {Icon(kit, branchIcon(GRAY), t('altBranch'), 14)}
          {BranchSelect(kit, model, actions, s)}
        </Box>
        {ui.busy[repo] === undefined ? null : <Text dimColor>…</Text>}
        {SyncButtons(kit, model, actions, s)}
      </Box>
      {canAct(kit) && ui.diverged[repo] === true ? (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text color="warning">{t('diverged')}</Text>
          <Button key={`merge|${repo}`} label={t('merge')} onPress={() => void actions.pull(repo, 'merge')} />
          <Button key={`rebase|${repo}`} label={t('rebase')} onPress={() => void actions.pull(repo, 'rebase')} />
        </Box>
      ) : null}
      {ui.errors[repo] === undefined ? null : (
        <Box flexDirection="row" gap={1}>
          <Text color="error" wrap="truncate-end">
            {ui.errors[repo]}
          </Text>
          <Button key={`repo|${repo}|dismiss`} plain label="×" onPress={() => void actions.dismissError(repo)} />
        </Box>
      )}
      {ui.fetchErrors[repo] === undefined ? null : (
        <Text color="warning" wrap="truncate-end">
          {ui.fetchErrors[repo]}
        </Text>
      )}
      {BranchExtras(kit, model, actions, s)}
    </Box>
  )
}

// What the desktop's message field shows at once: the app draws it at a fixed width (an Input takes
// no size), about this many characters.
const FIELD_CHARS = 22

// The message field, then ✦, Commit and ⋯ packed on one row; ⋯ is a menu of the rarer actions. It
// stays on a clean repository, so amend and undo are there after a commit; the phone, with no field,
// has none. A message longer than the field shows whole under it, where the field cannot.
const CommitRow = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  const { Box, Text, Button, Input, Select } = kit
  if (Input === undefined) return null
  const { t, ui } = model
  const repo = s.repo.path
  const draft = ui.drafts[repo] ?? ''
  const staged = s.files.filter(f => f.group === 'staged').length
  const changed = s.files.filter(f => f.group === 'changes').length
  const commitTip =
    staged > 0 ? counted(t, 'tipCommitStaged1', 'tipCommitStaged', staged) : changed > 0 ? counted(t, 'tipCommitAll1', 'tipCommitAll', changed) : t('commit')
  const more: Readonly<Record<string, () => void>> = {
    amend: () => void actions.amend(repo),
    undo: () => void actions.undo(repo),
    stash: () => void actions.stashSave(repo),
  }
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Input
          key={`msg|${repo}`}
          placeholder={t('messagePlaceholder')}
          value={draft}
          onInput={value => void actions.setDraft(repo, value)}
          onSubmit={() => void actions.commit(repo)}
        />
        {Tip(
          kit,
          `gen|${repo}`,
          t('tipGenerate'),
          <Button key={`gen|${repo}`} label={ui.busy[repo] === 'generate' ? t('generating') : '✦'} onPress={() => void actions.generate(repo)} />,
          'upRight',
        )}
        {Tip(
          kit,
          `commit|${repo}`,
          commitTip,
          <Button key={`commit|${repo}`} label={`✓ ${t('commit')}`} {...(s.operation === null ? { variant: 'primary' as const } : {})} onPress={() => void actions.commit(repo)} />,
          'upRight',
        )}
        {Select === undefined
          ? null
          : Tip(
              kit,
              `moreactions|${repo}`,
              t('tipMore'),
              <Select
                key={`moreactions|${repo}`}
                value={menuRest(model).value}
                options={[
                  menuRest(model),
                  { value: 'amend', label: t('amend') },
                  { value: 'undo', label: t('undo') },
                  { value: 'stash', label: t('stashSave') },
                ]}
                onSelect={value => more[value]?.()}
              />,
            )}
      </Box>
      {hoverOnly(kit) && draft.length > FIELD_CHARS ? (
        <Box key={`msgwhole|${repo}`} marginTop={1} paddingLeft={1}>
          <Text dimColor wrap="wrap">
            {draft}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}

// Blocks that may each be absent, together under one blank row, or nothing when all are.
const stack = (kit: Kit, blocks: readonly (RenderElement | null)[]) => {
  const { Box } = kit
  const present = blocks.filter(b => b !== null)
  return present.length === 0 ? null : (
    <Box flexDirection="column" marginTop={1}>
      {present}
    </Box>
  )
}

// The selected repository under the list: its header, the operation banner, the commit row, the file
// groups, then the sections that open on demand.
const Detail = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  const { Box } = kit
  return (
    <Box key="detail" flexDirection="column" marginTop={1}>
      {DetailHeader(kit, model, actions, s)}
      {spaced(kit, ConflictBanner(kit, model, actions, s))}
      {spaced(kit, CommitRow(kit, model, actions, s))}
      {stack(kit, [GroupView(kit, model, actions, s, 'conflicts'), GroupView(kit, model, actions, s, 'staged'), GroupView(kit, model, actions, s, 'changes')])}
      {stack(kit, [IncomingView(kit, model, actions, s), StashView(kit, model, actions, s), HistoryView(kit, model, actions, s)])}
    </Box>
  )
}

export const PaneView = (kit: Kit, model: PaneModel, actions: Actions) => {
  const { Box, Text } = kit
  const { t, ui } = model
  const ordered = orderRepos(model.repos)
  const selected = selectedOf(ordered, ui)
  return (
    <Box flexDirection="column">
      {ordered.length === 0 ? (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text dimColor>{t('noRepos')}</Text>
          <Box flexGrow={1} />
          {FetchState(kit, model, actions)}
        </Box>
      ) : (
        RepoList(kit, model, actions, ordered, selected)
      )}
      {selected === undefined ? null : Detail(kit, model, actions, selected)}
    </Box>
  )
}
