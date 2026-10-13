import type { FileChange, FileGroup, FileStatus, RepoSnapshot } from '../../types'
import type { MessageKey } from '../i18n'
import { basename, dirname } from '../paths'
import { ConflictRow } from './conflict'
import { DiffBlock } from './diff'
import { C, GRAY } from './icons'
import { canAct, confirming, HOVER_ONLY, hoverOnly, type Actions, type Kit, type PaneModel } from './kit'
import { Act, FileIcon, Pill, ROW_HOVER, SectionHead, Tip } from './marks'

export const SHOWN = 50

export const STATUS_COLOR: Readonly<Record<FileStatus, string>> = { M: C.amber, A: C.green, U: C.green, D: C.red, R: C.blue, C: C.blue, '!': C.red }
const STATUS_NAME: Readonly<Record<FileStatus, MessageKey>> = {
  M: 'statusM',
  A: 'statusA',
  U: 'statusU',
  D: 'statusD',
  R: 'statusR',
  C: 'statusC',
  '!': 'statusConflict',
}
const TITLE = { staged: 'stagedTitle', changes: 'changesTitle', conflicts: 'conflictsTitle' } as const

// The status letter in its color, in a column of its own at the row's end, with its name as the hint.
export const StatusLetter = (kit: Kit, model: PaneModel, key: string, status: FileStatus) => {
  const { Box, Text } = kit
  return Tip(
    kit,
    key,
    model.t(STATUS_NAME[status]),
    <Box width={2} flexDirection="row" justifyContent="flex-end">
      <Text color={STATUS_COLOR[status]} bold>
        {status}
      </Text>
    </Box>,
  )
}

export const FileRow = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot, f: FileChange) => {
  const { Box, Text, Button } = kit
  const { t } = model
  const repo = s.repo.path
  const id = `${repo}|${f.group}|${f.path}`
  const discardKey = `discard|${id}`
  const isConfirming = confirming(model, discardKey)
  const content = model.details.diffs[`diff|${id}`]
  const name = f.from === null ? basename(f.path) : `${basename(f.from)} → ${basename(f.path)}`
  const writable = canAct(kit)
  // One line: the type mark, the name (pressed for the diff; dim when deleted), the folder dim and cut
  // at its start, the actions under the pointer, the status letter.
  return (
    <Box key={`row|${id}`} flexDirection="column">
      <Box key={`line|${id}`} flexDirection="row" alignItems="center" gap={1} paddingLeft={2} paddingRight={1} hover={{ backgroundColor: ROW_HOVER }}>
        {FileIcon(kit, t, f.path)}
        <Box flexShrink={0}>
          <Button key={`diff|${id}`} plain {...(f.status === 'D' ? { dimColor: true } : {})} label={name} onPress={() => void actions.toggleDiff(repo, f)} />
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Text dimColor wrap="truncate-start">
            {dirname(f.path)}
          </Text>
        </Box>
        <Box flexDirection="row" gap={1} {...(hoverOnly(kit) && !isConfirming ? HOVER_ONLY : {})}>
          {writable && f.status !== 'D' ? Act(kit, `open|${id}`, '↗', t('tipOpen'), () => void actions.openFile(repo, f.path)) : null}
          {isConfirming ? <Text color="error">{t('confirm')}</Text> : null}
          {writable && f.group === 'changes' ? Act(kit, discardKey, '↶', t('tipDiscard'), () => void actions.discard(repo, f)) : null}
          {writable && f.group === 'changes' ? Act(kit, `stage|${id}`, '+', t('tipStage'), () => void actions.stage(repo, f)) : null}
          {writable && f.group === 'staged' ? Act(kit, `unstage|${id}`, '−', t('tipUnstage'), () => void actions.unstage(repo, f)) : null}
        </Box>
        {StatusLetter(kit, model, `status|${id}`, f.status)}
      </Box>
      {content === undefined ? null : DiffBlock(kit, t, content, f.path)}
    </Box>
  )
}

export const GroupView = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot, group: FileGroup) => {
  const files = s.files.filter(f => f.group === group)
  if (files.length === 0) return null
  const { Box, Text, Button } = kit
  const { t } = model
  const repo = s.repo.path
  const moreKey = `more|${repo}|${group}`
  const shown = model.ui.open[moreKey] === true && model.fileCap === undefined ? files : files.slice(0, model.fileCap ?? SHOWN)
  const writable = canAct(kit)
  // A block like the sections: the chevron and the title (the whole row opens and closes it), then at the
  // right + or − for the whole group under the pointer, and the count. Open unless closed.
  const foldKey = `group|${repo}|${group}`
  const isOpen = model.ui.open[foldKey] !== false
  return (
    <Box key={`groupblock|${repo}|${group}`} flexDirection="column">
      {SectionHead(kit, t, foldKey, t(TITLE[group]), isOpen, () => void actions.toggle(foldKey, isOpen), {
        actions:
          writable && group === 'changes'
            ? Act(kit, `stageall|${repo}`, '+', t('tipStageAll'), () => void actions.stage(repo, 'all'))
            : writable && group === 'staged'
              ? Act(kit, `unstageall|${repo}`, '−', t('tipUnstageAll'), () => void actions.unstage(repo, 'all'))
              : null,
        end: Pill(kit, String(files.length), group === 'conflicts' ? C.red : GRAY, String(files.length)),
        columns: model.columns,
      })}
      {isOpen ? shown.map(f => (group === 'conflicts' ? ConflictRow(kit, model, actions, s, f) : FileRow(kit, model, actions, s, f))) : null}
      {isOpen && shown.length < files.length ? (
        <Box key={`morerow|${repo}|${group}`} paddingLeft={2} hover={{ backgroundColor: ROW_HOVER }}>
          <Button key={moreKey} plain dimColor label={t('moreFiles', { n: files.length - shown.length })} onPress={() => void actions.toggle(moreKey, false)} />
        </Box>
      ) : null}
    </Box>
  )
}
