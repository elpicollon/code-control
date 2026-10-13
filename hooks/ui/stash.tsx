import type { RepoSnapshot } from '../../types'
import { ago } from '../i18n'
import { DiffBlock } from './diff'
import { canAct, confirming, HOVER_ONLY, hoverOnly, type Actions, type Kit, type PaneModel } from './kit'
import { GRAY, stashIcon } from './icons'
import { Icon, Pill, SectionHead } from './marks'

// Collapsed to its title until opened, with the number of entries.
export const StashView = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  if (s.stashes.length === 0) return null
  const { Box, Text, Button } = kit
  const { t } = model
  const repo = s.repo.path
  const sectionKey = `section|${repo}|stash`
  const isOpen = model.ui.open[sectionKey] === true
  return (
    <Box key={`stashblock|${repo}`} flexDirection="column">
      {SectionHead(kit, t, sectionKey, t('stashSection'), isOpen, () => void actions.toggle(sectionKey, isOpen), {
        icon: Icon(kit, stashIcon, t('stashSection'), 16),
        end: Pill(kit, String(s.stashes.length), GRAY, String(s.stashes.length)),
        columns: model.columns,
      })}
      {isOpen ? (
        <Box flexDirection="column" paddingLeft={2}>
          {s.stashes.map(stash => {
            const id = `${repo}|${stash.hash}`
            const isConfirming = confirming(model, `drop|${id}`)
            const content = model.details.diffs[`stash|${id}`]
            return (
              <Box key={`stashrow|${id}`} flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Text dimColor>{stash.ref}</Text>
                  <Text wrap="truncate-end">{stash.message}</Text>
                  <Text dimColor>{ago(t, stash.time, model.now)}</Text>
                  <Box flexGrow={1} />
                  <Box flexDirection="row" gap={1} {...(hoverOnly(kit) && !isConfirming ? HOVER_ONLY : {})}>
                    {canAct(kit) ? <Button key={`apply|${id}`} plain label={t('apply')} onPress={() => void actions.stashApply(repo, stash)} /> : null}
                    {canAct(kit) ? <Button key={`pop|${id}`} plain label={t('pop')} onPress={() => void actions.stashPop(repo, stash)} /> : null}
                    <Button key={`stashdiff|${id}`} plain label={t('viewDiff')} onPress={() => void actions.toggleStashDiff(repo, stash)} />
                    {isConfirming ? <Text color="error">{t('confirm')}</Text> : null}
                    {canAct(kit) ? <Button key={`drop|${id}`} plain label={t('drop')} onPress={() => void actions.stashDrop(repo, stash)} /> : null}
                  </Box>
                </Box>
                {content === undefined ? null : DiffBlock(kit, t, content, stash.ref)}
              </Box>
            )
          })}
        </Box>
      ) : null}
    </Box>
  )
}
