export type Segment = { from: number; to: number; color: number }
export type LaneRow = { hash: string; col: number; width: number; top: Segment[]; bottom: Segment[] }

export const COLORS = 6

const firstFree = (lanes: readonly (string | null)[]): number => {
  const at = lanes.indexOf(null)
  return at < 0 ? lanes.length : at
}

export const computeLanes = (commits: readonly { hash: string; parents: readonly string[] }[]): LaneRow[] => {
  const lanes: (string | null)[] = []
  return commits.map(commit => {
    let col = lanes.indexOf(commit.hash)
    const isNew = col < 0
    if (isNew) {
      col = firstFree(lanes)
      lanes[col] = commit.hash
    }
    const before = [...lanes]
    const top: Segment[] = []
    before.forEach((waiting, i) => {
      if (waiting === null || (isNew && i === col)) return
      top.push({ from: i, to: waiting === commit.hash ? col : i, color: i % COLORS })
    })
    before.forEach((waiting, i) => {
      if (waiting === commit.hash) lanes[i] = null
    })
    const parentCols: number[] = []
    commit.parents.forEach((parent, index) => {
      const existing = lanes.indexOf(parent)
      if (index > 0 && existing >= 0) {
        parentCols.push(existing)
        return
      }
      const at = index === 0 ? col : firstFree(lanes)
      lanes[at] = parent
      parentCols.push(at)
    })
    const bottom: Segment[] = []
    lanes.forEach((waiting, j) => {
      if (waiting === null) return
      if (before[j] !== undefined && before[j] !== null && before[j] !== commit.hash && before[j] === waiting) {
        bottom.push({ from: j, to: j, color: j % COLORS })
      }
      if (parentCols.includes(j)) bottom.push({ from: col, to: j, color: j % COLORS })
    })
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
    const reach = [...top, ...bottom].flatMap(segment => [segment.from + 1, segment.to + 1])
    return { hash: commit.hash, col, width: Math.max(col + 1, ...reach), top, bottom }
  })
}
