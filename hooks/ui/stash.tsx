import type { RepoSnapshot } from '../../types'
import { ago } from '../i18n'
import { DiffBlock } from './diff'
import { across, canAct, confirming, down, type Actions, type Kit, type PaneModel } from './kit'
import { GRAY, stashIcon } from './icons'
import { Icon, Pill, SectionHead, TextAct } from './marks'

// Collapsed to its title until opened, with the number of entries. An entry is its ref, its message
// whole and its age, with its actions always shown on the line under it and space below them.
export const StashView = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  if (s.stashes.length === 0) return null
  const { Box, Text } = kit
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
        <Box flexDirection="column" paddingLeft={across(kit, 2)}>
          {s.stashes.map(stash => {
            const id = `${repo}|${stash.hash}`
            const isConfirming = confirming(model, `drop|${id}`)
            const content = model.details.diffs[`stash|${id}`]
            return (
              <Box key={`stashrow|${id}`} flexDirection="column" marginBottom={down(kit, 1)}>
                <Box flexDirection="row" gap={across(kit, 1)}>
                  <Box flexShrink={0}>
                    <Text dimColor>{stash.ref}</Text>
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text wrap="wrap">{stash.message}</Text>
                  </Box>
                  <Box flexShrink={0}>
                    <Text dimColor>{ago(t, stash.time, model.now)}</Text>
                  </Box>
                </Box>
                <Box flexDirection="row" columnGap={across(kit, 1)} rowGap={down(kit, 1)} flexWrap="wrap">
                  {canAct(kit) ? TextAct(kit, `apply|${id}`, t('apply'), () => void actions.stashApply(repo, stash)) : null}
                  {canAct(kit) ? TextAct(kit, `pop|${id}`, t('pop'), () => void actions.stashPop(repo, stash)) : null}
                  {TextAct(kit, `stashdiff|${id}`, t('viewDiff'), () => void actions.toggleStashDiff(repo, stash))}
                  {isConfirming ? <Text color="error">{t('confirm')}</Text> : null}
                  {canAct(kit) ? TextAct(kit, `drop|${id}`, t('drop'), () => void actions.stashDrop(repo, stash)) : null}
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
