import type { FsEntry, ModelCompleteResult, ProcessRunResult } from 'claude-code'

export type RunOptions = { cwd: string; env?: Record<string, string>; timeoutMs?: number }
export type CompleteRequest = { model: string; system: string; prompt: string; timeoutMs: number }
export type Cancel = { cancel: () => void }

export type Host = {
  run: (argv: readonly string[], options: RunOptions) => Promise<ProcessRunResult>
  list: (path: string) => Promise<readonly FsEntry[]>
  readText: (path: string) => Promise<string>
  complete: (request: CompleteRequest) => Promise<ModelCompleteResult>
  submit: (text: string) => Promise<void>
  open: (path: string) => Promise<void>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => Cancel
}

export type Store<V> = { read: () => Promise<V>; update: (fn: (value: V) => V) => Promise<void> }
