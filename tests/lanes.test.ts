import { test, expect } from 'claude-code/testing'
import { computeLanes } from '../hooks/git/lanes'
import { rowSvg, rowText } from '../hooks/ui/graph'

const c = (hash: string, ...parents: string[]) => ({ hash, parents })
const s = (from: number, to: number) => ({ from, to, color: to % 6 })

test('a straight line', () => {
  expect(computeLanes([c('A', 'B'), c('B', 'C'), c('C')])).toEqual([
    { hash: 'A', col: 0, width: 1, top: [], bottom: [s(0, 0)] },
    { hash: 'B', col: 0, width: 1, top: [s(0, 0)], bottom: [s(0, 0)] },
    { hash: 'C', col: 0, width: 1, top: [s(0, 0)], bottom: [] },
  ])
})

test('a merge opens a lane and the shared parent closes it', () => {
  expect(computeLanes([c('M', 'A', 'B'), c('A', 'C'), c('B', 'C'), c('C')])).toEqual([
    { hash: 'M', col: 0, width: 2, top: [], bottom: [s(0, 0), { from: 0, to: 1, color: 1 }] },
    { hash: 'A', col: 0, width: 2, top: [s(0, 0), s(1, 1)], bottom: [s(0, 0), s(1, 1)] },
    { hash: 'B', col: 1, width: 2, top: [s(0, 0), s(1, 1)], bottom: [s(0, 0), s(1, 1)] },
    { hash: 'C', col: 0, width: 2, top: [s(0, 0), { from: 1, to: 0, color: 1 }], bottom: [] },
  ])
})

test('two tips in parallel (HEAD and the upstream)', () => {
  const rows = computeLanes([c('X', 'P'), c('Y', 'Q'), c('P', 'R'), c('Q', 'R'), c('R')])
  expect(rows.map(r => r.col)).toEqual([0, 1, 0, 1, 0])
  expect(rows[1]).toEqual({ hash: 'Y', col: 1, width: 2, top: [s(0, 0)], bottom: [s(0, 0), s(1, 1)] })
  expect(rows[4]?.top).toEqual([s(0, 0), { from: 1, to: 0, color: 1 }])
})

test('drawn as svg on desktop and as characters on the terminal', () => {
  const [, merge] = computeLanes([c('M', 'A', 'B'), c('A', 'C'), c('B', 'C'), c('C')])
  const svg = rowSvg(merge!)
  expect(svg).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="22"')
  expect(svg.match(/<path /g)?.length).toBe(4)
  expect(svg).toContain('<circle cx="6" cy="11" r="4"')
  expect(rowText(merge!)).toBe('● │')
})
