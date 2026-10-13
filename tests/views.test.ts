import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { BASE_ARGS } from '../hooks/git/run'
import { isBlank, leaves, nodes, result, shown } from './helpers'

const PANE = { component: 'Pane', requestId: 'code-control', props: { title: 'Source control', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const
const entry = (name: string) => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })
const STATUS = ['# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +0 -1', '1 .M N... 100644 100644 100644 a a src/app.ts', ''].join('\0')
const header = (fields: string[]) => `\x1e${fields.join('\x1f')}\n`
const HISTORY = header(['M', 'Ms', 'A B', 'Ana', '1799990000', 'HEAD -> main', 'merge']) + header(['A', 'As', 'C', 'Ana', '1799980000', '', 'a']) + header(['B', 'Bs', 'C', 'Bia', '1799970000', 'origin/main', 'b']) + header(['C', 'Cs', '', 'Bia', '1799960000', '', 'c'])
const INCOMING = `${header(['I', 'Is', 'M', 'Caio', '1799999000', 'origin/main', 'incoming change'])}\nM\tsrc/server.ts\n`

const world = (on: On, history = HISTORY, status = STATUS, incoming = INCOMING, locale = '') => {
  const calls: string[] = []
  mock.clock(on, { now: 1_800_000_000_000 })
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('session.cwd', () => ({ value: '/w' }))
  on('session.root', () => ({ value: '/w' }))
  on('settings.read', () => ({ value: {} }))
  on('command.register', () => ({ value: { command: 'code-control' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))
  on('fs.list', ($, e) => ({ value: e.path === '/w' ? [entry('app')] : e.path === '/w/app' ? [entry('.git')] : [] }))
  on('process.run', ($, e) => {
    const args = e.argv[0] === 'git' ? e.argv.slice(BASE_ARGS.length) : [...e.argv]
    const line = args.join(' ')
    calls.push(line)
    if (line === 'uname -s') return { value: result({ stdout: 'Darwin\n' }) }
    if (line === 'defaults read -g AppleLocale') return { value: result({ stdout: locale }) }
    if (line === 'rev-parse --show-toplevel') return { value: result({ stdout: '/w/app\n' }) }
    if (line === 'rev-parse --absolute-git-dir') return { value: result({ stdout: '/w/app/.git\n' }) }
    if (line.startsWith('status ')) return { value: result({ stdout: status }) }
    if (line.startsWith('log --topo-order')) return { value: result({ stdout: history }) }
    if (line.endsWith('HEAD..@{u}')) return { value: result({ stdout: incoming }) }
    if (line.startsWith('stash list')) return { value: result({ stdout: 'stash@{0}\x1fOn main: wip\x1f1799000000\x1fs0hash\n' }) }
    if (line === 'rev-parse --verify -q stash@{0}') return { value: result({ stdout: 's0hash\n' }) }
    if (line.startsWith('for-each-ref')) return { value: result({ stdout: 'refs/heads/main\x1f*\n' }) }
    if (line === 'show --name-status --format= I') return { value: result({ stdout: 'M\tsrc/server.ts\n' }) }
    if (line === 'remote') return { value: result({ stdout: 'origin\n' }) }
    return { value: result() }
  })
  return { calls }
}

test('incoming commits list their files', async ($, on) => {
  world(on)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(shown(await ui.find({ key: 'head|section|/w/app|incoming' }))).toEqual(['[Collapsed]', '[Incoming]', 'Incoming', '[1 to pull]'])
  await ui.press({ key: 'section|/w/app|incoming' })
  await ui.press({ key: 'in|/w/app|I' })
  expect(await ui.find({ key: 'in:cfile|/w/app|I|src/server.ts' })).toBeDefined()
  await ui.unmount()
})

test('incoming reads 50 commits, shows 10 and expands on demand', async ($, on) => {
  const many = Array.from({ length: 60 }, (_, i) => `${header([`h${i}`, `s${i}`, 'M', 'Caio', '1799999000', '', `change ${i}`])}\nM\tsrc/f${i}.ts\n`).join('')
  const { calls } = world(on, HISTORY, STATUS.replace('-1', '-612'), many)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(calls.some(c => c.startsWith('log ') && c.includes('HEAD..@{u}') && c.includes('-n50'))).toBe(true)
  expect(shown(await ui.find({ key: 'head|section|/w/app|incoming' }))).toEqual(['[Collapsed]', '[Incoming]', 'Incoming', '[612 to pull]'])
  await ui.press({ key: 'section|/w/app|incoming' })
  const rows = async () => (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('in|/w/app|'))
  expect((await rows()).length).toBe(10)
  await ui.press({ key: 'inmore|/w/app' })
  expect((await rows()).length).toBe(60)
  expect(await ui.find({ type: 'Text', text: 'showing 60 of 612' })).toBeDefined()
  await ui.unmount()
})

test('history: svg on desktop, characters on the terminal', async ($, on) => {
  world(on)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const desktop = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await desktop.press({ key: 'history|/w/app' })
  // one graph drawing per commit row, beside the pane's icons
  for (const hash of ['M', 'A', 'B', 'C']) expect(nodes(await desktop.find({ key: `hist|commit|/w/app|${hash}` })).filter(n => n.type === 'Svg')).toHaveLength(1)
  expect(await desktop.find({ type: 'Text', text: '[HEAD -> main]' })).toBeDefined()
  await desktop.unmount()
  const terminal = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  expect((await terminal.findAll({ type: 'Svg' })).length).toBe(0)
  expect(await terminal.find({ type: 'Text', text: '● │' })).toBeDefined()
  await terminal.unmount()
})

test('stash: delete asks twice', async ($, on) => {
  const { calls } = world(on)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  expect(shown(await ui.find({ key: 'head|section|/w/app|stash' }))).toEqual(['[Collapsed]', '[Stash]', 'Stash', '[1]'])
  await ui.press({ key: 'section|/w/app|stash' })
  await ui.press({ key: 'drop|/w/app|s0hash' })
  expect(calls).not.toContain('stash drop stash@{0}')
  await ui.press({ key: 'drop|/w/app|s0hash' })
  expect(calls).toContain('rev-parse --verify -q stash@{0}')
  expect(calls).toContain('stash drop stash@{0}')
  await ui.unmount()
})

test('a commit both incoming and in history keeps distinct file-row keys', async ($, on) => {
  world(on, header(['I', 'Is', 'M', 'Caio', '1799999000', 'origin/main', 'incoming change']) + HISTORY)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'section|/w/app|incoming' })
  await ui.press({ key: 'in|/w/app|I' })
  await ui.press({ key: 'history|/w/app' })
  await ui.press({ key: 'commit|/w/app|I' })
  expect(await ui.find({ key: 'in:cfile|/w/app|I|src/server.ts' })).toBeDefined()
  expect(await ui.find({ key: 'hist:cfile|/w/app|I|src/server.ts' })).toBeDefined()
  await ui.unmount()
})

test('incoming, stash and history start as one line each and open on demand', async ($, on) => {
  world(on)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  const head = async (key: string) => shown(await ui.find({ key: `head|${key}` }))
  expect(await head('section|/w/app|incoming')).toEqual(['[Collapsed]', '[Incoming]', 'Incoming', '[1 to pull]'])
  expect(await head('section|/w/app|stash')).toEqual(['[Collapsed]', '[Stash]', 'Stash', '[1]'])
  expect(await head('history|/w/app')).toEqual(['[Collapsed]', '[Graph]', 'Graph'])
  expect(await ui.find({ key: 'in|/w/app|I' })).toBeUndefined()
  expect(await ui.find({ key: 'drop|/w/app|s0hash' })).toBeUndefined()
  expect(await ui.find({ key: 'commit|/w/app|M' })).toBeUndefined()
  await ui.press({ key: 'section|/w/app|incoming' })
  expect(await head('section|/w/app|incoming')).toEqual(['[Expanded]', '[Incoming]', 'Incoming', '[1 to pull]'])
  expect(await ui.find({ key: 'in|/w/app|I' })).toBeDefined()
  await ui.press({ key: 'section|/w/app|stash' })
  expect(await head('section|/w/app|stash')).toEqual(['[Expanded]', '[Stash]', 'Stash', '[1]'])
  expect(await ui.find({ key: 'drop|/w/app|s0hash' })).toBeDefined()
  await ui.press({ key: 'history|/w/app' })
  expect(await head('history|/w/app')).toEqual(['[Expanded]', '[Graph]', 'Graph'])
  expect(await ui.find({ key: 'commit|/w/app|M' })).toBeDefined()
  await ui.press({ key: 'section|/w/app|incoming' })
  expect(await ui.find({ key: 'in|/w/app|I' })).toBeUndefined()
  await ui.unmount()
})

test('an incoming row is one line: hash, subject (the button for its files, cut at the row), one short date, no author', async ($, on) => {
  world(on)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  await ui.press({ key: 'section|/w/app|incoming' })
  const row = leaves(await ui.find({ key: 'inrow|in|/w/app|I' })).filter(l => !isBlank(l.text))
  expect(row.map(l => l.text)).toEqual(['Is', 'incoming change', '17 min ago'])
  expect(row[1]?.type).toBe('Button')
  expect(nodes(await ui.find({ key: 'inrow|in|/w/app|I' })).find(n => n.type === 'Box' && n.props.overflow === 'hidden')?.props).toMatchObject({ flexShrink: 1, minWidth: 0 })
  expect(row.filter(l => l.type === 'Text' && l.text === '17 min ago')).toHaveLength(1)
  expect(row.some(l => l.text.includes('Caio'))).toBe(false)
  await ui.unmount()
})

test('a history row is one line with no author', async ($, on) => {
  world(on)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  await ui.press({ key: 'history|/w/app' })
  const row = leaves(await ui.find({ key: 'hist|commit|/w/app|M' }))
  expect(row.some(l => l.text.includes('Ana'))).toBe(false)
  expect(row.find(l => l.text === 'merge')?.type).toBe('Button')
  expect(row.filter(l => l.text === '3 h ago')).toHaveLength(1)
  await ui.unmount()
})

test('the sections stack under one blank line: the chevron, a colored icon, the title to press, a count at the right, then their rows indented', async ($, on) => {
  world(on)
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'desktop', ...PANE })
  for (const key of ['section|/w/app|incoming', 'section|/w/app|stash', 'history|/w/app']) {
    expect((await ui.find({ key }))?.props).toMatchObject({ plain: true })
    await ui.press({ key })
  }
  const tree = nodes(await ui.drawn())
  const section = (key: string) => tree.find(n => n.children.some(c => (c as { props?: { key?: unknown } }).props?.key === `head|${key}`))
  const blocks = ['section|/w/app|incoming', 'section|/w/app|stash', 'history|/w/app'].map(section)
  // one column holds the three, a blank line above it and none between them
  const column = tree.find(n => n.children.some(c => (c as { props?: { key?: unknown } }).props?.key === 'inblock|/w/app'))
  expect(column?.props).toMatchObject({ flexDirection: 'column', marginTop: 1 })
  for (const block of blocks) {
    expect(block?.props.marginTop).toBeUndefined()
    expect((block?.children[1] as { props?: unknown } | undefined)?.props).toMatchObject({ flexDirection: 'column', paddingLeft: 2 })
  }
  const head = tree.find(n => n.props.key === 'head|section|/w/app|incoming')
  expect(head?.hover).toEqual({ backgroundColor: '#8080801a' })
  const icons = nodes(head).filter(n => n.type === 'Svg')
  expect(String(icons[1]?.props.source)).toContain('stroke="#3b82f6"')
  expect(String(icons[2]?.props.source)).toContain('>1</text>')
  expect(nodes(head).some(n => n.props.borderStyle !== undefined)).toBe(false)
  await ui.unmount()
  // the terminal: the characters for the chevrons and the count as text, so the title stays one line
  const terminal = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  const line = await terminal.find({ key: 'head|section|/w/app|incoming' })
  expect(shown(line)).toEqual(['▾', 'Incoming', '1'])
  expect(leaves(line).at(-1)?.props.color).toBe('#8b949e')
  await terminal.unmount()
})

test('the section titles in Portuguese', async ($, on) => {
  world(on, HISTORY, STATUS, INCOMING, 'pt_BR\n')
  await $.command.run({ command: 'code-control', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'code-control', surface: 'terminal', ...PANE })
  expect(shown(await ui.find({ key: 'head|section|/w/app|incoming' }))).toEqual(['▸', 'Para puxar', '1'])
  expect(shown(await ui.find({ key: 'head|section|/w/app|stash' }))).toEqual(['▸', 'Stash', '1'])
  expect(shown(await ui.find({ key: 'head|history|/w/app' }))).toEqual(['▸', 'Gráfico'])
  await ui.unmount()
})
