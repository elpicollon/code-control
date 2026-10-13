import type { LaneRow } from '../git/lanes'

export const LANE_COLORS = ['#378ADD', '#7F77DD', '#1D9E75', '#D85A30', '#D4537E', '#BA7517'] as const
export const STEP = 12
export const ROW = 22

const x = (lane: number): number => 6 + lane * STEP
const colorOf = (index: number): string => LANE_COLORS[index % LANE_COLORS.length] ?? LANE_COLORS[0]

const curve = (x1: number, y1: number, x2: number, y2: number, color: number): string => {
  const mid = (y1 + y2) / 2
  return `<path d="M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}" stroke="${colorOf(color)}" stroke-width="2" fill="none"/>`
}

export const rowSvg = (row: LaneRow): string => {
  const width = row.width * STEP
  const mid = ROW / 2
  const parts = [
    ...row.top.map(s => curve(x(s.from), 0, x(s.to), mid, s.color)),
    ...row.bottom.map(s => curve(x(s.from), mid, x(s.to), ROW, s.color)),
    `<circle cx="${x(row.col)}" cy="${mid}" r="4" fill="${colorOf(row.col)}"/>`,
  ]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW}" viewBox="0 0 ${width} ${ROW}">${parts.join('')}</svg>`
}

export const rowText = (row: LaneRow): string => {
  const cells = Array.from({ length: row.width }, () => ' ')
  for (const segment of [...row.top, ...row.bottom]) {
    cells[segment.from] = '│'
    cells[segment.to] = '│'
  }
  cells[row.col] = '●'
  return cells.join(' ')
}
