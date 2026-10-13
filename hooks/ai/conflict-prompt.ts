import type { Operation } from '../../types'
import { opLabel, type T } from '../i18n'

export type ResolveInput = { file: string; repo: string; path: string; operation: Operation | null; mine: string; theirs: string }

export const buildResolvePrompt = (t: T, input: ResolveInput): string => {
  const vars = { file: input.file, repo: input.repo, path: input.path, mine: input.mine, theirs: input.theirs }
  return input.operation === null ? t('resolvePromptPlain', vars) : t('resolvePrompt', { ...vars, op: opLabel(t, input.operation).toLowerCase() })
}
