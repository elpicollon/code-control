import { BLUE, branchIcon, GRAY, repoIcon } from './icons'
import { hoverOnly, type Kit, type PaneModel } from './kit'
import { Icon, ROW_HOVER, ROW_PX, RowPress } from './marks'
import { isInSync, orderRepos, RepoState, selectedOf } from './pane'

export const BAND_PRESS = 'band|open'

// The row above the prompt: the selected repository, its branch and state, and how many others have
// something to do; pressing it opens the pane (a `ui.press` hook does, as the press is the person's
// asking). Nothing with no repository. The band clips what is drawn above its row, so no hint opens.
export const BandView = (kit: Kit, model: PaneModel) => {
  const { Box, Text, Button } = kit
  const { t, ui } = model
  const ordered = orderRepos(model.repos)
  const s = selectedOf(ordered, ui)
  if (s === undefined) return null
  const others = ordered.filter(r => r !== s && !isInSync(r)).length
  const overRow = hoverOnly(kit)
  return (
    <Box key="band" position="relative" flexDirection="row" alignItems="center" gap={1} paddingX={1} hover={{ backgroundColor: ROW_HOVER }}>
      {Icon(kit, repoIcon(BLUE), t('altRepo'), 16, ROW_PX)}
      <Box flexShrink={0}>{overRow ? <Text bold>{s.repo.label}</Text> : <Button key={BAND_PRESS} plain label={s.repo.label} onPress={() => undefined} />}</Box>
      <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        {Icon(kit, branchIcon(GRAY), t('altBranch'), 14)}
        <Text dimColor wrap="truncate-end">
          {s.branch.head ?? t('detached')}
        </Text>
      </Box>
      {overRow ? RowPress(kit, BAND_PRESS, model.columns, () => undefined) : null}
      {RepoState(kit, model, s, false)}
      {others > 0 ? <Text dimColor>{t('bandMore', { n: others })}</Text> : null}
    </Box>
  )
}
