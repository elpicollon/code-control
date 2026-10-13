export type FileStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '!'
export type FileGroup = 'staged' | 'changes' | 'conflicts'
export type FileChange = { path: string; from: string | null; status: FileStatus; group: FileGroup }
export type Operation = 'merge' | 'rebase' | 'cherry-pick'
export type BranchState = { head: string | null; oid: string | null; upstream: string | null; ahead: number; behind: number }
export type Commit = { hash: string; short: string; parents: string[]; author: string; time: number; refs: string[]; subject: string }
export type CommitFile = { status: string; path: string }
export type IncomingCommit = Commit & { files: CommitFile[] }
export type Stash = { ref: string; hash: string; message: string; time: number }
export type BranchRef = { value: string; name: string; remote: string | null; isCurrent: boolean }
export type Repo = { path: string; name: string; label: string }
export type RepoSnapshot = {
  repo: Repo
  branch: BranchState
  files: FileChange[]
  operation: Operation | null
  incoming: IncomingCommit[]
  stashes: Stash[]
  branches: BranchRef[]
  remotes: string[]
  // the remote repository's web page (where a commit's link goes), or null
  webUrl: string | null
}
export type Confirm = { key: string; until: number }
export type UiState = {
  open: Record<string, boolean>
  drafts: Record<string, string>
  branchDrafts: Record<string, string>
  branchFilters: Record<string, string>
  busy: Record<string, string>
  errors: Record<string, string>
  fetchErrors: Record<string, string>
  diverged: Record<string, boolean>
  blockedSwitch: Record<string, string>
  confirm: Confirm | null
  lastFetchAt: number | null
  // the repository whose detail shows; null, or one no longer listed, means the first in the list
  selected: string | null
}
export type DiffContent = { kind: 'diff' | 'text'; text: string; isCut: boolean } | { kind: 'binary' }
export type Details = {
  diffs: Record<string, DiffContent>
  history: Record<string, Commit[]>
  commitFiles: Record<string, CommitFile[]>
}

declare module 'claude-code' {
  interface PluginState {
    'code-control': { repos: RepoSnapshot[]; ui: UiState; details: Details }
  }
}
