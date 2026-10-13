import { test, expect } from 'claude-code/testing'
import { discoverRepos, labelRepos, scanRoots } from '../hooks/git/discover'
import { dir, fakeHost, file, scriptGit } from './helpers'

const TREE: Record<string, ReturnType<typeof dir>[]> = {
  '/w': [dir('apps'), dir('Docs'), dir('node_modules'), dir('.cache'), file('a.txt'), dir('docs-site')],
  '/w/apps': [dir('web'), dir('api')],
  '/w/apps/web': [dir('.git'), dir('src')],
  '/w/apps/api': [file('.git')],
  '/w/Docs': [dir('docs-site')],
  '/w/Docs/docs-site': [dir('.git')],
  '/w/docs-site': [dir('.git')],
  '/w/node_modules': [dir('pkg')],
  '/w/node_modules/pkg': [dir('.git')],
}

const host = fakeHost({ list: async path => TREE[path] ?? [] })

test('scans three levels, skips hidden folders and node_modules, and visits a root once', async () => {
  expect(await scanRoots(host, ['/w', '/w/Docs'])).toEqual([
    '/w/Docs/docs-site',
    '/w/apps/api',
    '/w/apps/web',
    '/w/docs-site',
  ])
})

test('labels repositories with the same name by their path under the root', () => {
  expect(labelRepos(['/w/Docs/docs-site', '/w/docs-site', '/w/apps/api'], ['/w'])).toEqual([
    { path: '/w/Docs/docs-site', name: 'docs-site', label: 'Docs/docs-site' },
    { path: '/w/docs-site', name: 'docs-site', label: 'docs-site' },
    { path: '/w/apps/api', name: 'api', label: 'api' },
  ])
})

test('normalizes by the top level and drops duplicates', async () => {
  const { git } = scriptGit((args, cwd) =>
    args.join(' ') === 'rev-parse --show-toplevel'
      ? { stdout: `${cwd === '/w/apps/api' ? '/w/apps/web' : cwd}\n` }
      : undefined,
  )
  const repos = await discoverRepos(git, host, ['/w'])
  expect(repos.map(r => r.path)).toEqual(['/w/Docs/docs-site', '/w/apps/web', '/w/docs-site'])
})

test('the top-level lookup skips the repository queue', async () => {
  const { git, calls } = scriptGit((args, cwd) => (args[0] === 'rev-parse' ? { stdout: `${cwd}\n` } : undefined))
  await discoverRepos(git, host, ['/w'])
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.every(call => call.options.skipQueue === true)).toBe(true)
})

test('skips Library, AppData and Applications', async () => {
  const tree: Record<string, ReturnType<typeof dir>[]> = {
    '/h': [dir('Library'), dir('AppData'), dir('Applications'), dir('code')],
    '/h/Library': [dir('.git')],
    '/h/AppData': [dir('.git')],
    '/h/Applications': [dir('.git')],
    '/h/code': [dir('.git')],
  }
  expect(await scanRoots(fakeHost({ list: async path => tree[path] ?? [] }), ['/h'])).toEqual(['/h/code'])
})

test('stops after scanning 2000 folders', async () => {
  let listed = 0
  const wide = fakeHost({
    list: async path => {
      listed += 1
      return path.split('/').length > 3 ? [] : Array.from({ length: 60 }, (_, i) => dir(`d${i}`))
    },
  })
  await scanRoots(wide, ['/h', '/k'])
  expect(listed).toBe(2000)
})
