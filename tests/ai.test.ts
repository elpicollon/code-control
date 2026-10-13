import { test, expect } from 'claude-code/testing'
import { buildCommitRequest, cleanMessage, DIFF_LIMIT, generateCommitMessage } from '../hooks/ai/commit-message'
import { buildResolvePrompt } from '../hooks/ai/conflict-prompt'
import type { CompleteRequest } from '../hooks/host'
import { translator } from '../hooks/i18n'
import { fakeHost, scriptGit } from './helpers'

test('the request carries the style examples and cuts the diff', () => {
  const { system, prompt } = buildCommitRequest('x'.repeat(DIFF_LIMIT + 10), ['a.ts'], ['feat(ds): one', 'fix(ds): two'])
  expect(system).toContain('commit message only')
  expect(prompt).toContain('- feat(ds): one\n- fix(ds): two')
  expect(prompt).toContain('New files: a.ts')
  expect(prompt).toContain(`[diff cut at ${DIFF_LIMIT} characters]`)
  expect(prompt.length).toBeLessThan(DIFF_LIMIT + 1000)
})

test('the answer is cleaned of fences and quotes', () => {
  expect(cleanMessage('```\nfeat: x\n```')).toBe('feat: x')
  expect(cleanMessage('"fix: y"')).toBe('fix: y')
})

test('staged diff when something is staged; whole diff and new files otherwise', async () => {
  const requests: CompleteRequest[] = []
  const host = fakeHost({
    complete: async request => {
      requests.push(request)
      return { isAnswered: true, text: '`feat: x`', usage: {} } as never
    },
  })
  const { git, lines } = scriptGit(args =>
    args[0] === 'log' ? { stdout: 'feat(ds): a\nfix(ds): b\n' } : args[0] === 'ls-files' ? { stdout: 'novo.html\n' } : { stdout: 'DIFF' },
  )
  expect(await generateCommitMessage(git, host, '/r', 2, 'sonnet')).toBe('feat: x')
  expect(await generateCommitMessage(git, host, '/r', 0, 'haiku')).toBe('feat: x')
  expect(lines()).toEqual(['log -10 --format=%s', 'diff --cached', 'log -10 --format=%s', 'diff HEAD', 'ls-files --others --exclude-standard'])
  expect(requests.map(r => r.model)).toEqual(['sonnet', 'haiku'])
  expect(requests[1]?.prompt).toContain('New files: novo.html')
})

test('the model call is bounded at 60 seconds', async () => {
  const requests: CompleteRequest[] = []
  const host = fakeHost({
    complete: async request => {
      requests.push(request)
      return { isAnswered: true, text: 'feat: x', usage: {} } as never
    },
  })
  const { git } = scriptGit(() => undefined)
  await generateCommitMessage(git, host, '/r', 1, 'sonnet')
  expect(requests.map(r => r.timeoutMs)).toEqual([60_000])
})

test('a failed model call becomes a refusal with the reason', async () => {
  const host = fakeHost({ complete: async () => ({ isAnswered: false, reason: 'empty-reply', usage: {} }) as never })
  const { git } = scriptGit(() => undefined)
  await expect(generateCommitMessage(git, host, '/r', 1, 'sonnet')).rejects.toThrow('aiFailed')
})

test('the conflict prompt names the file, the repository and both sides', () => {
  const text = buildResolvePrompt(translator('pt-BR'), { file: 'src/a.ts', repo: 'app', path: '/w/app', operation: 'merge', mine: 'main', theirs: 'feature/x' })
  expect(text).toContain('`src/a.ts` do repositório `app` (/w/app)')
  expect(text).toContain('Há um merge em andamento: "a minha" é main e "a deles" é feature/x.')
  expect(text).toContain('Não prepare o arquivo e não faça commit.')
})

test('with no operation the prompt has no "in progress" clause and theirs is the other side', () => {
  const en = translator('en')
  const text = buildResolvePrompt(en, { file: 'src/a.ts', repo: 'app', path: '/w/app', operation: null, mine: 'main', theirs: en('otherSide') })
  expect(text).toContain('`src/a.ts` of the `app` repository (/w/app)')
  expect(text).toContain('"mine" is main and "theirs" is the other side.')
  expect(text).not.toContain('in progress')
  expect(text).toContain('Do not stage the file and do not commit.')
  const pt = translator('pt-BR')
  const texto = buildResolvePrompt(pt, { file: 'src/a.ts', repo: 'app', path: '/w/app', operation: null, mine: 'main', theirs: pt('otherSide') })
  expect(texto).toContain('"A minha" é main e "a deles" é o outro lado.')
  expect(texto).not.toContain('em andamento')
  expect(texto).toContain('Não prepare o arquivo e não faça commit.')
})
