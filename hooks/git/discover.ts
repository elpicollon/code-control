import type { Repo } from '../../types'
import type { Host } from '../host'
import { basename, join, toPosix } from '../paths'
import type { Git } from './run'

const SKIP = new Set(['node_modules', 'bower_components', 'vendor', 'dist', 'build', 'out', 'bin', 'obj', 'target', 'Library', 'AppData', 'Applications'])

// A session opened on a home folder must not walk the whole disk.
export const SCAN_LIMIT = 2_000

const byName = (a: { name: string }, b: { name: string }): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

export const scanRoots = async (host: Host, roots: readonly string[], depth = 3, limit = SCAN_LIMIT): Promise<string[]> => {
  const found: string[] = []
  const seen = new Set<string>()
  const walk = async (folder: string, level: number): Promise<void> => {
    if (seen.has(folder) || seen.size >= limit) return
    seen.add(folder)
    let entries
    try {
      entries = [...(await host.list(folder))].sort(byName)
    } catch {
      return
    }
    if (entries.some(entry => entry.name === '.git')) {
      found.push(folder)
      return
    }
    if (level >= depth) return
    for (const entry of entries) {
      if (entry.kind !== 'dir' || entry.isLink || entry.name.startsWith('.') || SKIP.has(entry.name)) continue
      await walk(join(folder, entry.name), level + 1)
    }
  }
  for (const root of roots) await walk(toPosix(root), 0)
  return found
}

export const labelRepos = (paths: readonly string[], roots: readonly string[]): Repo[] => {
  const names = paths.map(path => basename(path))
  return paths.map((path, i) => {
    const name = names[i] ?? path
    const isDuplicate = names.filter(other => other === name).length > 1
    const root = roots.find(r => path.startsWith(`${r}/`))
    return { path, name, label: isDuplicate && root !== undefined ? path.slice(root.length + 1) : name }
  })
}

export const discoverRepos = async (git: Git, host: Host, roots: readonly string[]): Promise<Repo[]> => {
  const tops: string[] = []
  for (const folder of await scanRoots(host, roots)) {
    const r = await git(folder, ['rev-parse', '--show-toplevel'], { allowFail: true, skipQueue: true })
    const top = r.exitCode === 0 ? toPosix(r.stdout.trim()) : ''
    if (top !== '' && !tops.includes(top)) tops.push(top)
  }
  return labelRepos(tops, roots.map(toPosix))
}
