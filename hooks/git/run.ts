import type { ProcessRunResult } from 'claude-code'
import { GitError } from '../errors'
import type { Host } from '../host'

export type GitResult = { exitCode: number; stdout: string; stderr: string }
// network: fetch, pull and push wait for their own slots, so a slow remote never holds the local ones.
// skipQueue: a lookup that takes no lock and reads nothing the queued commands change (discovery's
// `rev-parse --show-toplevel`) runs beside the repository's queue, so it never waits behind a push.
export type GitOptions = { env?: Record<string, string>; allowFail?: boolean; timeoutMs?: number; network?: boolean; skipQueue?: boolean }
export type Git = (cwd: string, args: readonly string[], options?: GitOptions) => Promise<GitResult>

// --literal-pathspecs: a path after `--` is that one file, never a pattern ([ab].txt must not reach a.txt).
// --no-optional-locks: background reads (status) must not take index.lock from Claude's own git commands.
export const BASE_ARGS = ['git', '--literal-pathspecs', '--no-optional-locks', '-c', 'core.quotepath=off'] as const

// The C locale keeps git's messages in English, where the matchers (`CONFLICT (`, `fast-forward`,
// `would be overwritten`) look for them. Paths are unaffected: quotepath=off writes their bytes raw.
// A call's own env is laid over it, but LC_ALL stays C.
const localeEnv = (env: Readonly<Record<string, string>> = {}): Record<string, string> => ({ LANGUAGE: 'C', ...env, LC_ALL: 'C' })

type Slots = { acquire: () => Promise<void>; release: () => void }

const slots = (limit: number): Slots => {
  const waiting: (() => void)[] = []
  let active = 0
  return {
    acquire: async () => {
      if (active < limit) {
        active += 1
        return
      }
      await new Promise<void>(resolve => waiting.push(resolve))
    },
    release: () => {
      const nextInLine = waiting.shift()
      if (nextInLine === undefined) active -= 1
      else nextInLine()
    },
  }
}

export const createGit = (host: Host, limit = 4, networkLimit = 4): Git => {
  const tails = new Map<string, Promise<unknown>>()
  const local = slots(limit)
  const network = slots(networkLimit)

  const exec = async (cwd: string, args: readonly string[], options: GitOptions): Promise<GitResult> => {
    const argv = [...BASE_ARGS, ...args]
    const pool = options.network === true ? network : local
    await pool.acquire()
    try {
      let r: ProcessRunResult
      try {
        r = await host.run(argv, { cwd, env: localeEnv(options.env), timeoutMs: options.timeoutMs ?? 60_000 })
      } catch (error) {
        throw new GitError(argv, -1, error instanceof Error ? error.message : String(error))
      }
      if (r.exitCode !== 0 && options.allowFail !== true) throw new GitError(argv, r.exitCode, r.stderr)
      return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    } finally {
      pool.release()
    }
  }

  return (cwd, args, options = {}) => {
    if (options.skipQueue === true) return exec(cwd, args, options)
    const previous = tails.get(cwd) ?? Promise.resolve()
    const run = () => exec(cwd, args, options)
    const next = previous.then(run, run)
    tails.set(
      cwd,
      next.catch(() => undefined),
    )
    return next
  }
}
