import type { MessageKey } from './i18n'

export const gitErrorLine = (stderr: string): string => {
  const lines = stderr
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '')
  return lines.find(line => /^(fatal|error):/i.test(line)) ?? lines.find(line => !/^(hint|warning):/i.test(line)) ?? ''
}

export class GitError extends Error {
  constructor(
    readonly argv: readonly string[],
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(gitErrorLine(stderr) || `git exited with ${exitCode}`)
    this.name = 'GitError'
  }
}

export class Refusal extends Error {
  constructor(
    readonly key: MessageKey,
    readonly vars: Readonly<Record<string, string>> = {},
  ) {
    super(key)
    this.name = 'Refusal'
  }
}
