import { test, expect } from 'claude-code/testing'
import { commitUrlOf, isSshHostName, parseBranches, parseSshConfig, parseStashes, readBranches, readStashes, readWebUrl, webUrlOf } from '../hooks/git/refs'
import { scriptGit } from './helpers'

test('local branches first, then remote ones with no local copy', () => {
  const out = [
    'refs/heads/main\x1f*',
    'refs/heads/feature/x\x1f ',
    'refs/remotes/origin/HEAD\x1f ',
    'refs/remotes/origin/main\x1f ',
    'refs/remotes/origin/develop\x1f ',
    '',
  ].join('\n')
  expect(parseBranches(out)).toEqual([
    { value: 'main', name: 'main', remote: null, isCurrent: true },
    { value: 'feature/x', name: 'feature/x', remote: null, isCurrent: false },
    { value: 'origin/develop', name: 'develop', remote: 'origin', isCurrent: false },
  ])
})

test('stash messages lose the "On branch:" prefix', () => {
  const out = ['stash@{0}\x1fOn main: antes de trocar\x1f1800000000\x1faaa111', 'stash@{1}\x1fWIP on dev: abc123 msg\x1f1700000000\x1fbbb222', ''].join('\n')
  expect(parseStashes(out)).toEqual([
    { ref: 'stash@{0}', hash: 'aaa111', message: 'antes de trocar', time: 1800000000 },
    { ref: 'stash@{1}', hash: 'bbb222', message: 'abc123 msg', time: 1700000000 },
  ])
})

test('the stash list is read with each entry hash', async () => {
  const { git, lines } = scriptGit(() => ({ stdout: 'stash@{0}\x1fOn main: wip\x1f1800000000\x1fccc333\n' }))
  expect((await readStashes(git, '/r')).map(s => s.hash)).toEqual(['ccc333'])
  expect(lines()).toEqual(['stash list --format=%gd%x1f%gs%x1f%ct%x1f%H'])
})

test('the current branch comes first, then recent locals, then remote-only ones', () => {
  const out = [
    'refs/heads/newest\x1f ',
    'refs/remotes/origin/remote-new\x1f ',
    'refs/heads/main\x1f*',
    'refs/heads/older\x1f ',
    'refs/remotes/origin/remote-old\x1f ',
    '',
  ].join('\n')
  expect(parseBranches(out).map(b => b.value)).toEqual(['main', 'newest', 'older', 'origin/remote-new', 'origin/remote-old'])
})

test('branches are read sorted by most recent commit', async () => {
  const { git, lines } = scriptGit(() => ({ stdout: 'refs/heads/main\x1f*\n' }))
  await readBranches(git, '/r')
  expect(lines()).toEqual(['for-each-ref --sort=-committerdate --format=%(refname)%1f%(HEAD) refs/heads refs/remotes'])
})

test('a remote URL becomes its repository web page: https as is, the SSH forms turned to it', () => {
  expect(webUrlOf('https://dev.azure.com/org/project/_git/repo')).toBe('https://dev.azure.com/org/project/_git/repo')
  expect(webUrlOf('https://someone@dev.azure.com/org/project/_git/repo\n')).toBe('https://dev.azure.com/org/project/_git/repo')
  expect(webUrlOf('git@ssh.dev.azure.com:v3/org/project/repo')).toBe('https://dev.azure.com/org/project/_git/repo')
  expect(webUrlOf('https://org.visualstudio.com/project/_git/repo')).toBe('https://org.visualstudio.com/project/_git/repo')
  expect(webUrlOf('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo')
  expect(webUrlOf('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo')
  expect(webUrlOf('ssh://git@gitlab.com:2222/group/sub/repo.git')).toBe('https://gitlab.com/group/sub/repo')
  expect(webUrlOf('/srv/git/repo.git')).toBeNull()
  expect(webUrlOf('http://intranet/repo')).toBeNull()
})

test("a commit's page follows each site's path", () => {
  expect(commitUrlOf('https://dev.azure.com/org/project/_git/repo', 'abc')).toBe('https://dev.azure.com/org/project/_git/repo/commit/abc')
  expect(commitUrlOf('https://github.com/owner/repo', 'abc')).toBe('https://github.com/owner/repo/commit/abc')
  expect(commitUrlOf('https://gitlab.com/group/repo', 'abc')).toBe('https://gitlab.com/group/repo/-/commit/abc')
  expect(commitUrlOf('https://bitbucket.org/owner/repo', 'abc')).toBe('https://bitbucket.org/owner/repo/commits/abc')
})

test('Bitbucket Server: a /scm/ clone over https, or one over its SSH port, has a /projects/ or /users/ web page', () => {
  expect(webUrlOf('https://bitbucket.example.com/scm/proj/repo.git')).toBe('https://bitbucket.example.com/projects/PROJ/repos/repo')
  expect(webUrlOf('https://someone@example.com/bitbucket/scm/proj/repo.git')).toBe('https://example.com/bitbucket/projects/PROJ/repos/repo')
  expect(webUrlOf('https://bitbucket.example.com:8443/scm/~ana/notes.git')).toBe('https://bitbucket.example.com:8443/users/ana/repos/notes')
  expect(webUrlOf('ssh://git@bitbucket.example.com:7999/proj/repo.git')).toBe('https://bitbucket.example.com/projects/PROJ/repos/repo')
  expect(commitUrlOf('https://bitbucket.example.com/projects/PROJ/repos/repo', 'abc')).toBe('https://bitbucket.example.com/projects/PROJ/repos/repo/commits/abc')
  expect(commitUrlOf('https://bitbucket.example.com/users/ana/repos/notes', 'abc')).toBe('https://bitbucket.example.com/users/ana/repos/notes/commits/abc')
  // the older Azure DevOps SSH host, and a Windows path that is no host
  expect(webUrlOf('org@vs-ssh.visualstudio.com:v3/org/project/repo')).toBe('https://org.visualstudio.com/project/_git/repo')
  expect(webUrlOf('C:/work/repo')).toBeNull()
})

test('an SSH alias of ~/.ssh/config resolves to its real host, a crafted one is never asked about', async () => {
  expect(parseSshConfig('user git\nhostname github.com\nport 22\n')).toEqual({ host: 'github.com', port: 22 })
  expect(parseSshConfig('user git\n')).toBeNull()
  expect(isSshHostName('github-work')).toBe(true)
  expect(isSshHostName('-oProxyCommand=evil')).toBe(false)
  const { git } = scriptGit(args => (args.join(' ') === 'remote get-url origin' ? { stdout: 'github-work:owner/repo.git\n' } : undefined))
  const asked: string[] = []
  const resolve = async (host: string) => {
    asked.push(host)
    return { host: 'github.com', port: 22 }
  }
  expect(await readWebUrl(git, '/w/app', ['origin'], 'origin/main', resolve)).toBe('https://github.com/owner/repo')
  // an alias that sets Bitbucket Server's SSH port makes its remote one
  expect(await readWebUrl(git, '/w/app', ['origin'], 'origin/main', async () => ({ host: 'bb.example.com', port: 7999 }))).toBe('https://bb.example.com/projects/OWNER/repos/repo')
  const crafted = scriptGit(args => (args.join(' ') === 'remote get-url origin' ? { stdout: '-oProxyCommand=evil:owner/repo\n' } : undefined))
  await readWebUrl(crafted.git, '/w/app', ['origin'], 'origin/main', resolve)
  expect(asked).toEqual(['github-work'])
})
