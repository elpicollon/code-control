import { test, expect } from 'claude-code/testing'
import { LOG_FORMAT, parseLog, readHistory, readIncoming } from '../hooks/git/log'
import { scriptGit } from './helpers'

const commit = (fields: string[], files = ''): string => `\x1e${fields.join('\x1f')}\n${files === '' ? '' : `\n${files}\n`}`
const OUT =
  commit(['h1', 'h1s', 'p1 p2', 'Ana', '1800000000', 'HEAD -> main, origin/main', 'Merge x'], 'M\tsrc/a.ts\nR100\told.ts\tnew name.ts') +
  commit(['h2', 'h2s', '', 'Bia', '1700000000', '', 'first'])

test('parses commits with parents, refs and files', () => {
  expect(parseLog(OUT)).toEqual([
    {
      hash: 'h1',
      short: 'h1s',
      parents: ['p1', 'p2'],
      author: 'Ana',
      time: 1800000000,
      refs: ['HEAD -> main', 'origin/main'],
      subject: 'Merge x',
      files: [
        { status: 'M', path: 'src/a.ts' },
        { status: 'R', path: 'new name.ts' },
      ],
    },
    { hash: 'h2', short: 'h2s', parents: [], author: 'Bia', time: 1700000000, refs: [], subject: 'first', files: [] },
  ])
})

test('incoming needs an upstream', async () => {
  const { git, lines } = scriptGit(() => ({ stdout: OUT }))
  expect(await readIncoming(git, '/r', null)).toEqual([])
  expect(lines()).toEqual([])
  expect((await readIncoming(git, '/r', 'origin/main')).map(c => c.hash)).toEqual(['h1', 'h2'])
  expect(lines()).toEqual([`log ${LOG_FORMAT} --name-status -n50 HEAD..@{u}`])
})

test('history pages through HEAD and the upstream', async () => {
  const { git, lines } = scriptGit(() => ({ stdout: OUT }))
  const commits = await readHistory(git, '/r', 'origin/main', 50)
  expect(commits[0]).toEqual({ hash: 'h1', short: 'h1s', parents: ['p1', 'p2'], author: 'Ana', time: 1800000000, refs: ['HEAD -> main', 'origin/main'], subject: 'Merge x' })
  expect(lines()).toEqual([`log --topo-order ${LOG_FORMAT} -n50 --skip=50 --ignore-missing HEAD @{u}`])
  const empty = scriptGit(() => ({ exitCode: 128, stderr: "fatal: your current branch 'main' does not have any commits yet" }))
  expect(await readHistory(empty.git, '/r', null, 0)).toEqual([])
})
