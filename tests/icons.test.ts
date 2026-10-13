import { test, expect } from 'claude-code/testing'
import { branchIcon, chevron, extColor, GRAY, pill, pillWidth, repoIcon, typeIcon } from '../hooks/ui/icons'

test('the icons are svg documents drawn in the color given', () => {
  for (const source of [repoIcon('#123456'), branchIcon('#123456')]) {
    expect(source.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(source.endsWith('</svg>')).toBe(true)
    expect(source).toContain('stroke="#123456"')
  }
})

test('the chevron points down when open and right when closed', () => {
  expect(chevron(true)).toContain('d="M2.5 6l3.5 3.5L9.5 6"')
  expect(chevron(false)).toContain('d="M4.5 4.5L8 8l-3.5 3.5"')
})

test('a file shows its language mark in the language color, a gray file icon otherwise', () => {
  expect(typeIcon('app.ts')).toContain('>TS</text>')
  expect(typeIcon('app.ts')).toContain('fill="#3178c6"')
  expect(typeIcon('View.TSX')).toContain('>TS</text>')
  expect(typeIcon('index.html')).toContain('>&lt;&gt;</text>')
  expect(typeIcon('Makefile')).not.toContain('<text')
  expect(typeIcon('Makefile')).toContain(`stroke="${GRAY}"`)
  // every mark is as wide as the plain icon, so the names after them line up
  for (const name of ['a.ts', 'a.json', 'Makefile']) expect(typeIcon(name)).toContain('width="18" height="16"')
})

test('a file color comes from its extension, gray otherwise', () => {
  expect(extColor('app.ts')).toBe('#3178c6')
  expect(extColor('View.TSX')).toBe('#3178c6')
  expect(extColor('CHANGELOG.md')).toBe('#4a8ebf')
  expect(extColor('package.json')).toBe('#b59a00')
  expect(extColor('Makefile')).toBe(GRAY)
  expect(extColor('.gitignore')).toBe(GRAY)
  expect(extColor('archive.tar.gz')).toBe(GRAY)
  for (const ext of ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'md', 'html', 'css', 'scss', 'py', 'go', 'rs', 'java', 'cs', 'yml', 'yaml', 'sh']) {
    expect(extColor(`a.${ext}`)).not.toBe(GRAY)
  }
})

test('a pill is a rounded chip in its color, wider for a longer count and for a dot', () => {
  const source = pill('↓12', '#3b82f6')
  expect(source).toContain('rx="8.5"')
  expect(source).toContain('fill="#3b82f61f"')
  expect(source).toContain('>↓12</text>')
  expect(source).not.toContain('<circle')
  expect(pill('3', '#d97706', true)).toContain('<circle')
  expect(pillWidth('12')).toBeGreaterThan(pillWidth('1'))
  expect(pillWidth('1', true)).toBeGreaterThan(pillWidth('1'))
})
