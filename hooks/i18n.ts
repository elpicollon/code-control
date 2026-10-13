import type { Operation } from '../types'
import { isWindowsPlatform } from './paths'

export type Lang = 'en' | 'pt-BR'

const en = {
  title: 'Source control',
  commandDescription: 'Open the source control pane',
  opened: 'Source control pane opened.',
  notPlaced: "The pane didn't open: {reason}",
  neverFetched: 'not fetched yet',
  noRepos: "No git repositories in this session's folders.",
  repositories: 'Repositories',
  moreRepos: '{n} more · {clean} up to date',
  fewerRepos: 'fewer',
  detached: '(detached)',
  altRepo: 'Repository',
  altBranch: 'Branch',
  altFile: 'File',
  altOpen: 'Expanded',
  altClosed: 'Collapsed',
  conflictsTitle: 'Conflicts',
  stagedTitle: 'Staged Changes',
  changesTitle: 'Changes',
  incomingSection: 'Incoming',
  stashSection: 'Stash',
  historySection: 'Graph',
  moreFiles: '+ {n} files',
  moreCommits: '+ {n} commits',
  showingOf: 'showing {shown} of {total}',
  messagePlaceholder: 'Commit message',
  commit: 'Commit',
  amend: 'Amend last commit',
  undo: 'Undo last commit',
  generating: 'Generating…',
  pullN: 'Pull ↓{n}',
  pushN: 'Push ↑{n}',
  publish: 'Publish branch',
  merge: 'Merge',
  rebase: 'Rebase',
  diverged: 'The branches diverged.',
  stashSave: 'Stash changes',
  apply: 'Apply',
  pop: 'Apply and drop',
  viewDiff: 'View diff',
  drop: 'Delete',
  confirm: 'Confirm?',
  newBranch: 'New branch…',
  otherBranches: 'Other branches…',
  branchFilterPlaceholder: 'Type part of a branch name',
  noBranchMatch: 'No branch matches.',
  branchPlaceholder: 'new-branch-name',
  createBranch: 'Create',
  stashAndSwitch: 'Stash and switch',
  switchMessage: 'before switching to {branch}',
  binary: 'Binary file',
  bigDiff: 'Large diff, open the file',
  loadMore: 'Load more',
  opMerge: 'Merge',
  opRebase: 'Rebase',
  opCherryPick: 'Cherry-pick',
  inProgress1: '{op} in progress · 1 conflict',
  inProgressN: '{op} in progress · {n} conflicts',
  conclude: 'Continue',
  abort: 'Abort',
  viewConflict: 'View conflict',
  keepMine: 'Keep mine',
  keepTheirs: 'Keep theirs',
  markResolved: 'Mark resolved',
  resolveWithClaude: 'Resolve with Claude',
  emptyMessage: 'Write the commit message.',
  nothingToAmend: 'Nothing to amend.',
  pushed: 'That commit was already pushed; changing it would need a force push.',
  operationInProgress: 'Finish or abort the {op} first.',
  firstCommit: "The repository's first commit can't be undone here.",
  noCommitYet: 'There is no commit to change yet.',
  markersLeft: 'The file still has conflict markers.',
  conflictsLeft: 'Resolve the conflicts first.',
  stashMoved: 'The stash list changed. Refresh and try again.',
  aiFailed: "Couldn't write the message ({reason}).",
  invalidBranch: 'Invalid branch name.',
  noRemote: 'No remote to push to.',
  fetchFailed: 'fetch failed: {reason}',
  resolvePrompt:
    'Resolve the merge conflicts in `{file}` of the `{repo}` repository ({path}). A {op} is in progress: "mine" is {mine} and "theirs" is {theirs}. Read both sides, keep what each one needs and leave the file with no conflict markers. Then explain in a few lines what you kept from each side. Do not stage the file and do not commit.',
  resolvePromptPlain:
    'Resolve the merge conflicts in `{file}` of the `{repo}` repository ({path}). "mine" is {mine} and "theirs" is {theirs}. Read both sides, keep what each one needs and leave the file with no conflict markers. Then explain in a few lines what you kept from each side. Do not stage the file and do not commit.',
  otherSide: 'the other side',
  tipFetch: 'Fetch all now',
  tipGenerate: 'Write the message with Claude',
  tipCommitStaged1: 'Commit 1 staged',
  tipCommitStaged: 'Commit {n} staged',
  tipCommitAll1: 'Commit the 1 change',
  tipCommitAll: 'Commit all {n} changes',
  tipMore: 'Amend, undo, stash',
  tipPull1: 'Pull 1 commit',
  tipPull: 'Pull {n} commits',
  tipPush1: 'Push 1 commit',
  tipPush: 'Push {n} commits',
  tipOpen: 'Open file',
  tipDiscard: 'Discard changes',
  tipStage: 'Stage',
  tipUnstage: 'Unstage',
  tipStageAll: 'Stage all',
  tipUnstageAll: 'Unstage all',
  statusM: 'Modified',
  statusA: 'Added',
  statusD: 'Deleted',
  statusR: 'Renamed',
  statusC: 'Copied',
  statusU: 'Untracked',
  statusConflict: 'Conflict',
  stateChanges1: '1 change',
  stateChanges: '{n} changes',
  stateBehind: '{n} to pull',
  stateAhead: '{n} to push',
  stateTrouble: 'needs attention',
  bandMore: '+{n} more',
  trimmed: 'Too much to draw at once: some open items show shorter.',
  tipSettings: 'Pane settings',
  showRow: 'Show the row above the prompt',
  hideRow: 'Hide the row above the prompt',
  settingRefused: "The setting didn't change ({reason}).",
  agoNow: 'just now',
  agoMin: '{n} min ago',
  agoHour: '{n} h ago',
  agoDay: '{n} d ago',
  agoMonth: '{n} mo ago',
  agoYear: '{n} y ago',
}

export type MessageKey = keyof typeof en

const pt: Record<MessageKey, string> = {
  title: 'Controle de código',
  commandDescription: 'Abre o painel de controle de código',
  opened: 'Painel de controle de código aberto.',
  notPlaced: 'O painel não abriu: {reason}',
  neverFetched: 'sem fetch ainda',
  noRepos: 'Nenhum repositório git nas pastas desta sessão.',
  repositories: 'Repositórios',
  moreRepos: 'mais {n} · {clean} em dia',
  fewerRepos: 'menos',
  detached: '(destacada)',
  altRepo: 'Repositório',
  altBranch: 'Branch',
  altFile: 'Arquivo',
  altOpen: 'Aberto',
  altClosed: 'Fechado',
  conflictsTitle: 'Conflitos',
  stagedTitle: 'Preparadas',
  changesTitle: 'Alterações',
  incomingSection: 'Para puxar',
  stashSection: 'Stash',
  historySection: 'Gráfico',
  moreFiles: '+ {n} arquivos',
  moreCommits: '+ {n} commits',
  showingOf: 'mostrando {shown} de {total}',
  messagePlaceholder: 'Mensagem do commit',
  commit: 'Commit',
  amend: 'Corrigir último commit',
  undo: 'Desfazer último commit',
  generating: 'Gerando…',
  pullN: 'Pull ↓{n}',
  pushN: 'Push ↑{n}',
  publish: 'Publicar branch',
  merge: 'Mesclar',
  rebase: 'Rebase',
  diverged: 'As branches divergiram.',
  stashSave: 'Guardar alterações',
  apply: 'Aplicar',
  pop: 'Aplicar e remover',
  viewDiff: 'Ver diff',
  drop: 'Excluir',
  confirm: 'Confirmar?',
  newBranch: 'Nova branch…',
  otherBranches: 'Outras branches…',
  branchFilterPlaceholder: 'Digite parte do nome da branch',
  noBranchMatch: 'Nenhuma branch com esse nome.',
  branchPlaceholder: 'nome-da-nova-branch',
  createBranch: 'Criar',
  stashAndSwitch: 'Guardar e trocar',
  switchMessage: 'antes de trocar para {branch}',
  binary: 'Arquivo binário',
  bigDiff: 'Diff grande, abra o arquivo',
  loadMore: 'Carregar mais',
  opMerge: 'Merge',
  opRebase: 'Rebase',
  opCherryPick: 'Cherry-pick',
  inProgress1: '{op} em andamento · 1 conflito',
  inProgressN: '{op} em andamento · {n} conflitos',
  conclude: 'Concluir',
  abort: 'Abortar',
  viewConflict: 'Ver conflito',
  keepMine: 'Manter a minha',
  keepTheirs: 'Manter a deles',
  markResolved: 'Marcar resolvido',
  resolveWithClaude: 'Resolver com o Claude',
  emptyMessage: 'Escreva a mensagem do commit.',
  nothingToAmend: 'Nada para corrigir.',
  pushed: 'Esse commit já foi enviado; mudá-lo exigiria push forçado.',
  operationInProgress: 'Conclua ou aborte o {op} antes.',
  firstCommit: 'O primeiro commit do repositório não pode ser desfeito pelo painel.',
  noCommitYet: 'Ainda não há commit para mudar.',
  markersLeft: 'O arquivo ainda tem marcadores de conflito.',
  conflictsLeft: 'Resolva os conflitos antes.',
  stashMoved: 'A lista de stash mudou. Atualize e tente de novo.',
  aiFailed: 'Não deu para gerar a mensagem ({reason}).',
  invalidBranch: 'Nome de branch inválido.',
  noRemote: 'Nenhum remoto para enviar.',
  fetchFailed: 'fetch falhou: {reason}',
  resolvePrompt:
    'Resolva os conflitos de merge em `{file}` do repositório `{repo}` ({path}). Há um {op} em andamento: "a minha" é {mine} e "a deles" é {theirs}. Leia os dois lados, mantenha o que cada um precisa e deixe o arquivo sem marcadores de conflito. Depois explique em poucas linhas o que ficou de cada lado. Não prepare o arquivo e não faça commit.',
  resolvePromptPlain:
    'Resolva os conflitos de merge em `{file}` do repositório `{repo}` ({path}). "A minha" é {mine} e "a deles" é {theirs}. Leia os dois lados, mantenha o que cada um precisa e deixe o arquivo sem marcadores de conflito. Depois explique em poucas linhas o que ficou de cada lado. Não prepare o arquivo e não faça commit.',
  otherSide: 'o outro lado',
  tipFetch: 'Buscar tudo agora',
  tipGenerate: 'Escrever a mensagem com o Claude',
  tipCommitStaged1: 'Commit da preparada',
  tipCommitStaged: 'Commit das {n} preparadas',
  tipCommitAll1: 'Commit da alteração',
  tipCommitAll: 'Commit das {n} alterações',
  tipMore: 'Corrigir, desfazer, guardar',
  tipPull1: 'Puxar 1 commit',
  tipPull: 'Puxar {n} commits',
  tipPush1: 'Enviar 1 commit',
  tipPush: 'Enviar {n} commits',
  tipOpen: 'Abrir arquivo',
  tipDiscard: 'Descartar alterações',
  tipStage: 'Preparar',
  tipUnstage: 'Tirar da preparação',
  tipStageAll: 'Preparar tudo',
  tipUnstageAll: 'Tirar tudo da preparação',
  statusM: 'Modificado',
  statusA: 'Adicionado',
  statusD: 'Excluído',
  statusR: 'Renomeado',
  statusC: 'Copiado',
  statusU: 'Novo',
  statusConflict: 'Conflito',
  stateChanges1: '1 alteração',
  stateChanges: '{n} alterações',
  stateBehind: '{n} para puxar',
  stateAhead: '{n} para enviar',
  stateTrouble: 'precisa de atenção',
  bandMore: '+{n} outros',
  trimmed: 'Coisa demais para desenhar de uma vez: alguns itens abertos aparecem resumidos.',
  tipSettings: 'Ajustes do painel',
  showRow: 'Mostrar a linha acima do campo',
  hideRow: 'Esconder a linha acima do campo',
  settingRefused: 'O ajuste não mudou ({reason}).',
  agoNow: 'agora',
  agoMin: 'há {n} min',
  agoHour: 'há {n} h',
  agoDay: 'há {n} d',
  agoMonth: 'há {n} meses',
  agoYear: 'há {n} anos',
}

export const TABLES: Readonly<Record<Lang, Readonly<Record<MessageKey, string>>>> = { en, 'pt-BR': pt }

export type T = (key: MessageKey, vars?: Readonly<Record<string, string | number>>) => string

export const translator =
  (lang: Lang): T =>
  (key, vars = {}) =>
    TABLES[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))

const isPortuguese = (value: unknown): boolean => typeof value === 'string' && /^(pt|portug)/i.test(value.trim())

// The option, when it names a language; on auto, Portuguese when any hint is: the Claude Code
// `language` setting, LANG, or the system locale (the desktop app does not pass a Portuguese LANG).
export const pickLanguage = (option: string, settingsLanguage: unknown, envLang: string | undefined, osLocale?: string): Lang => {
  if (option === 'en' || option === 'pt-BR') return option
  return [settingsLanguage, envLang, osLocale].some(isPortuguese) ? 'pt-BR' : 'en'
}

// The command that prints the system locale: AppleLocale on macOS, LocaleName on Windows. Elsewhere
// the locale is in the environment (LC_ALL, LC_MESSAGES, LANG), so there is none.
export const localeArgv = (platform: string): string[] | null => {
  if (platform === 'Darwin') return ['defaults', 'read', '-g', 'AppleLocale']
  if (isWindowsPlatform(platform)) return ['reg', 'query', 'HKCU\\Control Panel\\International', '/v', 'LocaleName']
  return null
}

export const parseLocale = (platform: string, out: string): string | undefined => {
  const value = isWindowsPlatform(platform) ? /LocaleName\s+REG_SZ\s+(\S+)/.exec(out)?.[1] : out.trim()
  return value === undefined || value === '' ? undefined : value
}

// One message for a single thing, another for the rest, as `inProgress1` and `inProgressN` are.
export const counted = (t: T, one: MessageKey, many: MessageKey, n: number): string => (n === 1 ? t(one) : t(many, { n }))

export const ago = (t: T, seconds: number, nowMs: number): string => {
  const elapsed = Math.max(0, Math.round(nowMs / 1000 - seconds))
  if (elapsed < 60) return t('agoNow')
  if (elapsed < 3600) return t('agoMin', { n: Math.round(elapsed / 60) })
  if (elapsed < 86_400) return t('agoHour', { n: Math.round(elapsed / 3600) })
  const days = Math.round(elapsed / 86_400)
  if (days < 30) return t('agoDay', { n: days })
  if (days < 365) return t('agoMonth', { n: Math.round(days / 30) })
  return t('agoYear', { n: Math.round(days / 365) })
}

const OP_KEYS = { merge: 'opMerge', rebase: 'opRebase', 'cherry-pick': 'opCherryPick' } as const

export const opLabel = (t: T, operation: Operation): string => t(OP_KEYS[operation])
