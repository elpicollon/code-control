import { test, expect } from 'claude-code/testing'
import { gitErrorLine, Refusal } from '../hooks/errors'
import { ago, localeArgv, opLabel, parseLocale, pickLanguage, TABLES, translator } from '../hooks/i18n'

test('the option wins over the environment', () => {
  expect(pickLanguage('en', 'portuguese', 'pt_BR.UTF-8')).toBe('en')
  expect(pickLanguage('pt-BR', undefined, 'en_US.UTF-8')).toBe('pt-BR')
})

test('auto reads the Claude Code language setting or LANG', () => {
  expect(pickLanguage('auto', 'portuguese', undefined)).toBe('pt-BR')
  expect(pickLanguage('auto', 'Português', 'en_US.UTF-8')).toBe('pt-BR')
  expect(pickLanguage('auto', undefined, 'pt_BR.UTF-8')).toBe('pt-BR')
  expect(pickLanguage('auto', 'english', 'en_US.UTF-8')).toBe('en')
  expect(pickLanguage('auto', undefined, undefined)).toBe('en')
})

test('auto also reads the system locale', () => {
  expect(pickLanguage('auto', undefined, 'en_US.UTF-8', 'pt_BR')).toBe('pt-BR')
  expect(pickLanguage('auto', 'english', undefined, 'pt-BR')).toBe('pt-BR')
  expect(pickLanguage('auto', undefined, undefined, 'en_BR')).toBe('en')
  expect(pickLanguage('en', undefined, undefined, 'pt_BR')).toBe('en')
})

test('the system locale: one command per system, read from its answer', () => {
  expect(localeArgv('Darwin')).toEqual(['defaults', 'read', '-g', 'AppleLocale'])
  expect(localeArgv('Windows')).toEqual(['reg', 'query', 'HKCU\\Control Panel\\International', '/v', 'LocaleName'])
  expect(localeArgv('Linux')).toBeNull()
  expect(parseLocale('Darwin', 'pt_BR\n')).toBe('pt_BR')
  expect(parseLocale('Windows', '\r\nHKEY_CURRENT_USER\\Control Panel\\International\r\n    LocaleName    REG_SZ    pt-BR\r\n')).toBe('pt-BR')
  expect(parseLocale('Windows', 'ERROR: The system was unable to find the specified registry key or value.')).toBeUndefined()
  expect(parseLocale('Darwin', '')).toBeUndefined()
})

test('both tables have the same keys', () => {
  expect(Object.keys(TABLES['pt-BR']).sort()).toEqual(Object.keys(TABLES.en).sort())
})

test('fills variables', () => {
  const pt = translator('pt-BR')
  expect(pt('moreFiles', { n: 3 })).toBe('+ 3 arquivos')
  expect(translator('en')('moreFiles', { n: 3 })).toBe('+ 3 files')
  expect(pt('commit')).toBe('Commit')
  expect(translator('en')('moreRepos', { n: 4, clean: 1 })).toBe('4 more · 1 up to date')
  expect(pt('moreRepos', { n: 4, clean: 1 })).toBe('mais 4 · 1 em dia')
  expect(pt('pullN', { n: 16 })).toBe('Pull ↓16')
  expect(opLabel(pt, 'cherry-pick')).toBe('Cherry-pick')
})

test('relative time', () => {
  const pt = translator('pt-BR')
  const now = 1_800_000_000_000
  expect(ago(pt, now / 1000 - 30, now)).toBe('agora')
  expect(ago(pt, now / 1000 - 120, now)).toBe('há 2 min')
  expect(ago(translator('en'), now / 1000 - 3 * 3600, now)).toBe('3 h ago')
  expect(ago(pt, now / 1000 - 2 * 86400, now)).toBe('há 2 d')
})

test('git error line skips hints and warnings', () => {
  expect(gitErrorLine('hint: use --force\nwarning: x\nfatal: not a git repository\n')).toBe('fatal: not a git repository')
  expect(gitErrorLine('warning: LF will be replaced\nsomething broke\n')).toBe('something broke')
  expect(new Refusal('emptyMessage').key).toBe('emptyMessage')
})
