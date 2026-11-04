import type { DiffContent } from '../../types'
import { across, type Kit, type PaneModel } from './kit'
import { FitNote } from './marks'

// An open diff; a line saying it is hidden where the drawing must stay small.
export const DiffBlock = (kit: Kit, model: PaneModel, content: DiffContent, path: string) => {
  const { Box, Text, Code } = kit
  const { t } = model
  if (model.hidesDiffs === true) return <Box marginLeft={across(kit, 2)}>{FitNote(kit, t('cutDiff'))}</Box>
  if (content.kind === 'binary') return <Text dimColor>{t('binary')}</Text>
  return (
    <Box flexDirection="column" marginLeft={across(kit, 2)}>
      {content.kind === 'diff' ? <Code source={content.text} path={path} format="diff" /> : <Code source={content.text} path={path} />}
      {content.isCut ? <Text dimColor>{t('bigDiff')}</Text> : null}
    </Box>
  )
}
