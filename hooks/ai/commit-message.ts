import { Refusal } from '../errors'
import type { Git } from '../git/run'
import type { Host } from '../host'

export const DIFF_LIMIT = 60_000
// The engine sets no limit of its own: a hung call would keep the repository busy for good.
// Cut at this, the call resolves `aborted` and becomes the aiFailed refusal.
export const MODEL_MS = 60_000

export const buildCommitRequest = (diff: string, newFiles: readonly string[], examples: readonly string[]): { system: string; prompt: string } => {
  const cut = diff.length > DIFF_LIMIT ? `${diff.slice(0, DIFF_LIMIT)}\n[diff cut at ${DIFF_LIMIT} characters]` : diff
  return {
    system: 'You write git commit messages. Answer with the commit message only: no quotes, no code fences, no explanation.',
    prompt: [
      'Recent commit subjects in this repository, newest first. Write in the same style and the same language as them:',
      examples.length > 0 ? examples.map(subject => `- ${subject}`).join('\n') : '(none: write one short imperative subject line in English)',
      newFiles.length > 0 ? `New files: ${newFiles.join(', ')}` : '',
      'Diff to describe:',
      cut,
    ]
      .filter(part => part !== '')
      .join('\n\n'),
  }
}

export const cleanMessage = (text: string): string =>
  text
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()

export const generateCommitMessage = async (git: Git, host: Host, repo: string, stagedCount: number, model: string): Promise<string> => {
  const examples = (await git(repo, ['log', '-10', '--format=%s'], { allowFail: true })).stdout.split('\n').filter(Boolean)
  const diff = (await git(repo, stagedCount > 0 ? ['diff', '--cached'] : ['diff', 'HEAD'], { allowFail: true })).stdout
  const newFiles =
    stagedCount > 0 ? [] : (await git(repo, ['ls-files', '--others', '--exclude-standard'], { allowFail: true })).stdout.split('\n').filter(Boolean)
  const answer = await host.complete({ model, ...buildCommitRequest(diff, newFiles, examples), timeoutMs: MODEL_MS })
  if (!answer.isAnswered) throw new Refusal('aiFailed', { reason: answer.reason })
  return cleanMessage(answer.text)
}
