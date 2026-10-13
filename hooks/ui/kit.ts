import type {
  BoxProps, ButtonProps, CodeProps, ElementConstructor, Elements, InputProps, LinkProps, RenderSurface, SelectProps, SvgProps, TextProps,
} from 'claude-code'
import type { Details, FileChange, RepoSnapshot, Stash, UiState } from '../../types'
import type { PullMode, Side } from '../git/actions'
import type { T } from '../i18n'

export type Kit = {
  surface: RenderSurface
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Code: ElementConstructor<CodeProps>
  Link: ElementConstructor<LinkProps>
  Input?: ElementConstructor<InputProps>
  Select?: ElementConstructor<SelectProps>
  Svg?: ElementConstructor<SvgProps>
}

// The engine completes the element table for every surface (an omitted element draws a fragment),
// so presence is decided by surface here, not by checking the table.
export const toKit = (els: Elements[RenderSurface], surface: RenderSurface): Kit => {
  const full = els as Elements['desktop']
  return {
    surface,
    Box: els.Box,
    Text: els.Text,
    Button: els.Button,
    Code: els.Code,
    Link: els.Link,
    ...(surface === 'mobile' ? {} : { Input: full.Input, Select: full.Select }),
    ...(surface === 'terminal' ? {} : { Svg: full.Svg }),
  }
}

// `columns`: the cells the tree is laid out in (the site's bodyColumns); `isRowShown`: whether the row
// above the prompt shows, as the settings hold it now; `picks`: how many picks the pane's menus have
// taken, so a menu draws a new resting value after each and shows ⋯ again.
export type PaneModel = {
  repos: readonly RepoSnapshot[]
  ui: UiState
  details: Details
  now: number
  t: T
  columns: number
  isRowShown: boolean
  picks: number
  // when a drawing must stay small: how many files a group shows before its "+ N files", and how many
  // commits the Graph and Incoming show, open "+ N" buttons or not
  fileCap?: number
  listCap?: number
}

// A menu's resting option: ⋯, under a value that changes with every pick. A Select keeps showing the
// person's pick until its hook draws a different value, so the same value drawn again would leave it.
export const menuRest = (model: PaneModel): { value: string; label: string } => ({ value: `more|${model.picks}`, label: '⋯' })

export const NEW_BRANCH = '__code_control_new_branch__'
export const OTHER_BRANCHES = '__code_control_other_branches__'
// The engine refuses a Select with more than 64 options, and one refused element discards the whole pane.
export const SELECT_LIMIT = 64

export const HOVER_ONLY = { display: 'none', hover: { display: 'flex' } } as const

export const canAct = (kit: Kit): boolean => kit.Input !== undefined

// The glyph before a toggle's label: open or closed.
export const arrow = (isOpen: boolean): string => (isOpen ? '▾' : '▸')

export const hoverOnly = (kit: Kit): boolean => kit.surface === 'desktop' || kit.surface === 'vscode'

export const confirming = (model: PaneModel, key: string): boolean =>
  model.ui.confirm !== null && model.ui.confirm.key === key && model.now < model.ui.confirm.until

export type Actions = {
  refresh: () => Promise<void>
  toggle: (key: string, current: boolean) => Promise<void>
  select: (repo: string) => Promise<void>
  setDraft: (repo: string, text: string) => Promise<void>
  setBranchDraft: (repo: string, text: string) => Promise<void>
  setBranchFilter: (repo: string, text: string) => Promise<void>
  commit: (repo: string) => Promise<void>
  amend: (repo: string) => Promise<void>
  undo: (repo: string) => Promise<void>
  generate: (repo: string) => Promise<void>
  stage: (repo: string, file: FileChange | 'all') => Promise<void>
  unstage: (repo: string, file: FileChange | 'all') => Promise<void>
  discard: (repo: string, file: FileChange) => Promise<void>
  toggleDiff: (repo: string, file: FileChange) => Promise<void>
  openFile: (repo: string, path: string) => Promise<void>
  pull: (repo: string, mode: PullMode) => Promise<void>
  push: (repo: string) => Promise<void>
  switchBranch: (repo: string, value: string) => Promise<void>
  stashAndSwitch: (repo: string) => Promise<void>
  createBranch: (repo: string) => Promise<void>
  stashSave: (repo: string) => Promise<void>
  stashApply: (repo: string, stash: Stash) => Promise<void>
  stashPop: (repo: string, stash: Stash) => Promise<void>
  stashDrop: (repo: string, stash: Stash) => Promise<void>
  toggleStashDiff: (repo: string, stash: Stash) => Promise<void>
  toggleHistory: (repo: string) => Promise<void>
  loadMore: (repo: string) => Promise<void>
  toggleCommit: (repo: string, hash: string) => Promise<void>
  toggleCommitFile: (repo: string, hash: string, path: string) => Promise<void>
  keep: (repo: string, path: string, side: Side) => Promise<void>
  markResolved: (repo: string, path: string) => Promise<void>
  toggleConflict: (repo: string, path: string) => Promise<void>
  resolveWithClaude: (repo: string, path: string) => Promise<void>
  conclude: (repo: string) => Promise<void>
  abort: (repo: string) => Promise<void>
  dismissError: (repo: string) => Promise<void>
}
