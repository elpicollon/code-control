import type { BranchRef, Stash } from '../../types'
import type { Git } from './run'

export const parseBranches = (out: string): BranchRef[] => {
  const locals: BranchRef[] = []
  const remotes: BranchRef[] = []
  for (const line of out.split('\n')) {
    const [ref = '', head = ''] = line.split('\x1f')
    if (ref.startsWith('refs/heads/')) {
      const name = ref.slice('refs/heads/'.length)
      locals.push({ value: name, name, remote: null, isCurrent: head === '*' })
    } else if (ref.startsWith('refs/remotes/')) {
      const short = ref.slice('refs/remotes/'.length)
      const slash = short.indexOf('/')
      const name = short.slice(slash + 1)
      if (slash < 0 || name === 'HEAD') continue
      remotes.push({ value: short, name, remote: short.slice(0, slash), isCurrent: false })
    }
  }
  const localNames = new Set(locals.map(b => b.name))
  const current = locals.findIndex(b => b.isCurrent)
  const ordered = current <= 0 ? locals : [...locals.slice(current, current + 1), ...locals.slice(0, current), ...locals.slice(current + 1)]
  return [...ordered, ...remotes.filter(b => !localNames.has(b.name))]
}

export const readBranches = async (git: Git, repo: string): Promise<BranchRef[]> =>
  parseBranches((await git(repo, ['for-each-ref', '--sort=-committerdate', '--format=%(refname)%1f%(HEAD)', 'refs/heads', 'refs/remotes'])).stdout)

export const parseStashes = (out: string): Stash[] =>
  out
    .split('\n')
    .filter(line => line !== '')
    .map(line => {
      const [ref = '', subject = '', time = '0', hash = ''] = line.split('\x1f')
      return { ref, hash, message: subject.replace(/^(WIP )?[Oo]n [^:]+: /, ''), time: Number(time) }
    })

export const readStashes = async (git: Git, repo: string): Promise<Stash[]> =>
  parseStashes((await git(repo, ['stash', 'list', '--format=%gd%x1f%gs%x1f%ct%x1f%H'])).stdout)

export const readRemotes = async (git: Git, repo: string): Promise<string[]> =>
  (await git(repo, ['remote'])).stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

// A remote URL's parts: the host and port it names, the repository's path (no .git), and whether it is
// reached by SSH (`ssh://`, or `[user@]host:path`, the host then possibly an alias of ~/.ssh/config).
// Null for anything else: a local path (a drive letter is no host), plain http.
export type RemoteParts = { host: string; port: number | null; path: string; isSsh: boolean }

export const parseRemote = (remoteUrl: string): RemoteParts | null => {
  const url = remoteUrl.trim().replace(/\/+$/, '').replace(/\.git$/, '')
  const https = /^https:\/\/(?:[^@/]+@)?([^/:]+)(?::(\d+))?\/(.+)$/.exec(url)
  if (https !== null) return { host: https[1] ?? '', port: https[2] === undefined ? null : Number(https[2]), path: https[3] ?? '', isSsh: false }
  const ssh = /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::(\d+))?\/(.+)$/.exec(url)
  if (ssh !== null) return { host: ssh[1] ?? '', port: ssh[2] === undefined ? null : Number(ssh[2]), path: ssh[3] ?? '', isSsh: true }
  const scp = /^(?:[^@/]+@)?([^:/\\]{2,}):(?!\/)(.+)$/.exec(url)
  if (scp !== null) return { host: scp[1] ?? '', port: null, path: scp[2] ?? '', isSsh: true }
  return null
}

// The default SSH port of Bitbucket Server (Data Center), which tells its SSH remotes apart.
const BITBUCKET_SERVER_SSH = 7999

// The repository's web page, from a remote's parts: https as it is (its port kept), an SSH remote on its
// host's https. Azure DevOps over SSH (ssh.dev.azure.com:v3/org/project/repo, or the older
// vs-ssh.visualstudio.com) and Bitbucket Server (cloned from /scm/project/repo over https, or
// project/repo over its SSH port) have web pages of their own shape.
export const webUrlFrom = (parts: RemoteParts): string | null => {
  const v3 = /^v3\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(parts.path)
  if (parts.isSsh && v3 !== null && parts.host === 'ssh.dev.azure.com') return `https://dev.azure.com/${v3[1]}/${v3[2]}/_git/${v3[3]}`
  if (parts.isSsh && v3 !== null && parts.host === 'vs-ssh.visualstudio.com') return `https://${v3[1]}.visualstudio.com/${v3[2]}/_git/${v3[3]}`
  const base = parts.isSsh || parts.port === null ? `https://${parts.host}` : `https://${parts.host}:${parts.port}`
  const scm = parts.isSsh ? (parts.port === BITBUCKET_SERVER_SSH ? /^()(~?[^/]+)\/([^/]+)$/.exec(parts.path) : null) : /^(?:(.+)\/)?scm\/(~?[^/]+)\/([^/]+)$/.exec(parts.path)
  if (scm !== null) {
    const [, context, owner = '', repo = ''] = scm
    const where = owner.startsWith('~') ? `users/${owner.slice(1)}` : `projects/${owner.toUpperCase()}`
    return `${base}${context === undefined || context === '' ? '' : `/${context}`}/${where}/repos/${repo}`
  }
  return `${base}/${parts.path}`
}

export const webUrlOf = (remoteUrl: string): string | null => {
  const parts = parseRemote(remoteUrl)
  return parts === null ? null : webUrlFrom(parts)
}

// A commit's page on the repository's web page: Azure DevOps and GitHub (and most others) under
// /commit/, GitLab under /-/commit/, Bitbucket (cloud and server) under /commits/.
export const commitUrlOf = (webUrl: string, hash: string): string => {
  const { host, pathname } = new URL(webUrl)
  if (host === 'gitlab.com' || host.startsWith('gitlab.')) return `${webUrl}/-/commit/${hash}`
  if (host === 'bitbucket.org' || /\/(?:projects|users)\/[^/]+\/repos\/[^/]+$/.test(pathname)) return `${webUrl}/commits/${hash}`
  return `${webUrl}/commit/${hash}`
}

// What `ssh -G <alias>` says an SSH host resolves to: its real hostname and port. Null when it says
// neither.
export const parseSshConfig = (out: string): { host: string; port: number | null } | null => {
  const value = (name: string): string | undefined => new RegExp(`^${name}\\s+(\\S+)\\s*$`, 'im').exec(out)?.[1]
  const host = value('hostname')
  if (host === undefined) return null
  const port = value('port')
  return { host, port: port === undefined ? null : Number(port) }
}

// A host name ssh may be asked about: letters, digits, dots, dashes and underscores, no leading dash,
// so a crafted remote cannot pass ssh an option.
export const isSshHostName = (host: string): boolean => /^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(host)

export type ResolveSsh = (host: string) => Promise<{ host: string; port: number | null } | null>

// The web page of the remote a branch tracks (its upstream's), else origin's, else the first one's. An
// SSH host goes through `resolve` first, as it may be an alias of ~/.ssh/config naming the real host.
export const readWebUrl = async (git: Git, repo: string, remotes: readonly string[], upstream: string | null, resolve?: ResolveSsh): Promise<string | null> => {
  const tracked = upstream === null ? undefined : [...remotes].sort((a, b) => b.length - a.length).find(r => upstream.startsWith(`${r}/`))
  const remote = tracked ?? (remotes.includes('origin') ? 'origin' : remotes[0])
  if (remote === undefined) return null
  const r = await git(repo, ['remote', 'get-url', remote], { allowFail: true })
  const parts = r.exitCode === 0 ? parseRemote(r.stdout) : null
  if (parts === null) return null
  const real = parts.isSsh && resolve !== undefined && isSshHostName(parts.host) ? await resolve(parts.host) : null
  return webUrlFrom(real === null ? parts : { ...parts, host: real.host, port: parts.port ?? real.port })
}
