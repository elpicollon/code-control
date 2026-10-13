import { test, expect } from 'claude-code/testing'
import { BASE_ARGS, createGit } from '../hooks/git/run'
import { fakeHost, result } from './helpers'

test('prefixes git with literal pathspecs, no optional locks and quotepath off, and passes cwd, env and timeout', async () => {
  const seen: unknown[] = []
  const git = createGit(
    fakeHost({
      run: async (argv, options) => {
        seen.push({ argv, options })
        return result({ stdout: 'ok' })
      },
    }),
  )
  expect((await git('/repo', ['status'], { env: { A: '1' } })).stdout).toBe('ok')
  expect(seen).toEqual([
    {
      argv: ['git', '--literal-pathspecs', '--no-optional-locks', '-c', 'core.quotepath=off', 'status'],
      options: { cwd: '/repo', env: { A: '1', LC_ALL: 'C', LANGUAGE: 'C' }, timeoutMs: 60_000 },
    },
  ])
})

test('every git call runs in the C locale, so the English matchers read what git wrote', async () => {
  const envs: unknown[] = []
  const git = createGit(
    fakeHost({
      run: async (argv, options) => {
        envs.push(options.env)
        return result()
      },
    }),
  )
  await git('/r', ['status'])
  await git('/r', ['fetch'], { env: { GIT_TERMINAL_PROMPT: '0', LANGUAGE: 'pt_BR', LC_ALL: 'pt_BR.UTF-8' } })
  expect(envs).toEqual([
    { LC_ALL: 'C', LANGUAGE: 'C' },
    { GIT_TERMINAL_PROMPT: '0', LANGUAGE: 'pt_BR', LC_ALL: 'C' },
  ])
})

test('a non-zero exit throws unless allowFail; warnings with exit 0 are not errors', async () => {
  const git = createGit(
    fakeHost({
      run: async argv =>
        argv.includes('bad')
          ? result({ exitCode: 128, stderr: 'hint: x\nfatal: not a git repository' })
          : result({ stderr: 'warning: LF will be replaced by CRLF' }),
    }),
  )
  expect((await git('/r', ['ok'])).stderr).toContain('CRLF')
  await expect(git('/r', ['bad'])).rejects.toThrow('fatal: not a git repository')
  expect((await git('/r', ['bad'], { allowFail: true })).exitCode).toBe(128)
})

test('a process that cannot start becomes a GitError', async () => {
  const git = createGit(fakeHost({ run: async () => Promise.reject(new Error('spawn git ENOENT')) }))
  await expect(git('/r', ['status'])).rejects.toThrow('spawn git ENOENT')
})

test('one command at a time per repository', async () => {
  const log: string[] = []
  const git = createGit(
    fakeHost({
      run: async argv => {
        log.push(`start ${argv[BASE_ARGS.length]}`)
        await Promise.resolve()
        await Promise.resolve()
        log.push(`end ${argv[BASE_ARGS.length]}`)
        return result()
      },
    }),
  )
  await Promise.all([git('/r', ['a']), git('/r', ['b'])])
  expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
})

test('at most four repositories at once', async () => {
  let active = 0
  let peak = 0
  const git = createGit(
    fakeHost({
      run: async () => {
        active += 1
        peak = Math.max(peak, active)
        for (let i = 0; i < 5; i += 1) await Promise.resolve()
        active -= 1
        return result()
      },
    }),
  )
  await Promise.all(['/a', '/b', '/c', '/d', '/e', '/f'].map(repo => git(repo, ['status'])))
  expect(peak).toBe(4)
})

test('network calls have their own four slots, so local reads never wait behind them', async () => {
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  let active = 0
  let peak = 0
  const git = createGit(
    fakeHost({
      run: async argv => {
        if (!argv.includes('fetch')) return result({ stdout: 'local' })
        active += 1
        peak = Math.max(peak, active)
        await held
        active -= 1
        return result()
      },
    }),
  )
  const fetches = ['/a', '/b', '/c', '/d', '/e', '/f'].map(repo => git(repo, ['fetch'], { network: true }))
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
  expect(peak).toBe(4)
  expect((await git('/g', ['status'])).stdout).toBe('local')
  release()
  await Promise.all(fetches)
  expect(peak).toBe(4)
})

test('a lookup that takes no lock can skip the repository queue, so it never waits behind a push', async () => {
  let release: () => void = () => undefined
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  const git = createGit(
    fakeHost({
      run: async argv => {
        if (argv.includes('push')) await held
        return result({ stdout: argv[BASE_ARGS.length] ?? '' })
      },
    }),
  )
  const push = git('/r', ['push'], { network: true })
  const queued = git('/r', ['status'])
  expect((await git('/r', ['rev-parse', '--show-toplevel'], { skipQueue: true })).stdout).toBe('rev-parse')
  let statusDone = false
  void queued.then(() => {
    statusDone = true
  })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
  expect(statusDone).toBe(false)
  release()
  expect((await push).stdout).toBe('push')
  expect((await queued).stdout).toBe('status')
})
