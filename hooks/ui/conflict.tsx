import type { FileChange, RepoSnapshot } from '../../types'
import { opLabel } from '../i18n'
import { basename, dirname } from '../paths'
import { DiffBlock } from './diff'
import { C } from './icons'
import { canAct, confirming, type Actions, type Kit, type PaneModel } from './kit'
import { FileIcon, ROW_HOVER } from './marks'

export const ConflictBanner = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  if (s.operation === null) return null
  const { Box, Text, Button } = kit
  const { t } = model
  const repo = s.repo.path
  const n = s.files.filter(f => f.group === 'conflicts').length
  const op = opLabel(t, s.operation)
  return (
    <Box flexDirection="row" gap={1} borderStyle="round" borderColor="error" paddingX={1}>
      <Text color="error" bold>
        {t(n === 1 ? 'inProgress1' : 'inProgressN', { op, n })}
      </Text>
      <Box flexGrow={1} />
      {canAct(kit) && n === 0 ? <Button key={`conclude|${repo}`} label={t('conclude')} variant="primary" onPress={() => void actions.conclude(repo)} /> : null}
      {confirming(model, `abort|${repo}`) ? <Text color="error">{t('confirm')}</Text> : null}
      {canAct(kit) ? <Button key={`abort|${repo}`} label={t('abort')} onPress={() => void actions.abort(repo)} /> : null}
    </Box>
  )
}

export const ConflictRow = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot, f: FileChange) => {
  const { Box, Text, Button } = kit
  const { t } = model
  const repo = s.repo.path
  const id = `${repo}|conflicts|${f.path}`
  const excerpt = model.details.diffs[`conflict|${repo}|${f.path}`]
  const confirmMine = confirming(model, `keep|${repo}|${f.path}|mine`)
  const confirmTheirs = confirming(model, `keep|${repo}|${f.path}|theirs`)
  // The line of a file row (icon, name in red, folder, ! last), its buttons on the line under it.
  return (
    <Box key={`row|${id}`} flexDirection="column">
      <Box key={`line|${id}`} flexDirection="row" alignItems="center" gap={1} paddingLeft={2} paddingRight={1} hover={{ backgroundColor: ROW_HOVER }}>
        {FileIcon(kit, t, f.path)}
        <Box flexShrink={0}>
          <Text color={C.red}>{basename(f.path)}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Text dimColor wrap="truncate-start">
            {dirname(f.path)}
          </Text>
        </Box>
        <Box width={2} flexDirection="row" justifyContent="flex-end">
          <Text color={C.red} bold>
            !
          </Text>
        </Box>
      </Box>
      <Box flexDirection="row" gap={1} flexWrap="wrap" marginLeft={5}>
        <Button key={`view|${id}`} plain label={t('viewConflict')} onPress={() => void actions.toggleConflict(repo, f.path)} />
        {canAct(kit) ? (
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {confirmMine ? <Text color="error">{t('confirm')}</Text> : null}
            <Button key={`mine|${id}`} plain label={t('keepMine')} onPress={() => void actions.keep(repo, f.path, 'mine')} />
            {confirmTheirs ? <Text color="error">{t('confirm')}</Text> : null}
            <Button key={`theirs|${id}`} plain label={t('keepTheirs')} onPress={() => void actions.keep(repo, f.path, 'theirs')} />
            <Button key={`open|${id}`} plain label="↗" onPress={() => void actions.openFile(repo, f.path)} />
            <Button key={`resolved|${id}`} plain label={t('markResolved')} onPress={() => void actions.markResolved(repo, f.path)} />
            <Button key={`claude|${id}`} plain label={t('resolveWithClaude')} onPress={() => void actions.resolveWithClaude(repo, f.path)} />
          </Box>
        ) : null}
      </Box>
      {excerpt === undefined ? null : DiffBlock(kit, t, excerpt, f.path)}
    </Box>
  )
}
