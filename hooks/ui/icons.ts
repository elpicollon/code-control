// The pane's icons and count chips as SVG source. They are drawings, so they carry fixed colors, mid
// tones readable on a light and a dark theme; the terminal has no Svg and draws none of them (each
// falls back to characters where it is used).

export const C = { gray: '#8b949e', blue: '#3b82f6', amber: '#d97706', green: '#16a34a', red: '#e5484d' } as const
export const BLUE = C.blue
export const GRAY = C.gray

const FONT = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`
const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const svg = (body: string, width = 16, height = width): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const repoIcon = (color: string): string =>
  svg(`<path d="M3.5 2.5A1.5 1.5 0 0 1 5 1h7.5v10.5H5A1.5 1.5 0 0 0 3.5 13zM3.5 13A1.5 1.5 0 0 0 5 14.5h7.5v-3" stroke="${color}" stroke-width="1.3"/>`)

export const branchIcon = (color: string): string =>
  svg(
    `<g stroke="${color}" stroke-width="1.3"><circle cx="4" cy="3.5" r="1.7"/><circle cx="4" cy="12.5" r="1.7"/><circle cx="10.5" cy="5" r="1.7"/>` +
      `<path d="M4 5.2v5.6M10.5 6.7c0 3-6.5 1.6-6.5 4.1"/></g>`,
    14,
    16,
  )

export const chevron = (isOpen: boolean): string =>
  svg(`<path d="${isOpen ? 'M2.5 6l3.5 3.5L9.5 6' : 'M4.5 4.5L8 8l-3.5 3.5'}" stroke="${GRAY}" stroke-width="1.5"/>`, 12, 16)

// The sections' icons: what comes in to pull, the stash, the commit graph; and the ✓ before the
// repositories in sync.
export const incomingIcon = svg(`<g stroke="${C.blue}" stroke-width="1.5"><path d="M8 2v7.5M4.8 6.5 8 9.7l3.2-3.2M2.5 11v2.5h11V11"/></g>`)
export const stashIcon = svg(`<g stroke="${C.amber}" stroke-width="1.4"><rect x="2" y="2.5" width="12" height="3.5" rx="1"/><path d="M3 6v7.5h10V6M6.5 9h3"/></g>`)
export const graphIcon = svg(
  `<g stroke="${C.green}" stroke-width="1.4"><circle cx="5" cy="3.5" r="1.8"/><circle cx="5" cy="12.5" r="1.8"/><circle cx="11" cy="8" r="1.8"/><path d="M5 5.3v5.4M6.6 4.6 9.4 7"/></g>`,
)
export const checkIcon = svg(`<path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="${C.green}" stroke-width="1.7"/>`)

// A language's mark, its color and its font size: the size keeps each mark about as tall as the text
// beside it. Any other extension, or a name without one, has the plain file icon in gray.
const MARKS: Readonly<Record<string, readonly [string, string, number]>> = {
  ts: ['TS', '#3178c6', 10.5],
  tsx: ['TS', '#3178c6', 10.5],
  js: ['JS', '#b59a00', 10.5],
  jsx: ['JS', '#b59a00', 10.5],
  mjs: ['JS', '#b59a00', 10.5],
  cjs: ['JS', '#b59a00', 10.5],
  json: ['{ }', '#b59a00', 11],
  md: ['M↓', '#4a8ebf', 9.5],
  html: ['<>', '#e34c26', 12],
  css: ['#', '#2f74c0', 14],
  scss: ['#', '#cd6799', 14],
  py: ['PY', '#3572a5', 10.5],
  go: ['GO', '#00add8', 10.5],
  rs: ['RS', '#dea584', 10.5],
  java: ['J', '#b07219', 12],
  cs: ['C#', '#178600', 10.5],
  yml: ['Y', '#a074c4', 12],
  yaml: ['Y', '#a074c4', 12],
  sh: ['$', '#3fa34d', 12],
}

const markOf = (name: string): readonly [string, string, number] | undefined => {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? undefined : MARKS[name.slice(dot + 1).toLowerCase()]
}

export const extColor = (name: string): string => markOf(name)?.[1] ?? GRAY

// As wide as a mark, so the names after them line up.
export const TYPE_WIDTH = 18
export const typeIcon = (name: string): string => {
  const mark = markOf(name)
  if (mark === undefined) return svg(`<g transform="translate(1 0)" stroke="${GRAY}" stroke-width="1.2"><path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3"/></g>`, TYPE_WIDTH, 16)
  const [label, color, size] = mark
  return svg(
    `<text x="9" y="12.2" text-anchor="middle" ${FONT} font-size="${size}" font-weight="700" letter-spacing="-0.3" fill="${color}">${escape(label)}</text>`,
    TYPE_WIDTH,
    16,
  )
}

// A rounded count chip: the number in its color on the color's tint; `dot` puts a filled dot before it.
export const PILL_HEIGHT = 18
const lead = (dot: boolean): number => (dot ? 13 : 7)
export const pillWidth = (label: string, dot = false): number => Math.round(lead(dot) + label.length * 6.6 + 7)
export const pill = (label: string, color: string, dot = false): string => {
  const width = pillWidth(label, dot)
  return svg(
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${PILL_HEIGHT - 1}" rx="8.5" fill="${color}1f" stroke="${color}55"/>` +
      (dot ? `<circle cx="8" cy="9" r="2.6" fill="${color}"/>` : '') +
      `<text x="${lead(dot) + (label.length * 6.6) / 2}" y="12.8" text-anchor="middle" ${FONT} font-size="11" font-weight="600" fill="${color}">${escape(label)}</text>`,
    width,
    PILL_HEIGHT,
  )
}
