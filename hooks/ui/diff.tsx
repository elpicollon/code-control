import type { DiffContent } from '../../types'
import type { T } from '../i18n'
import type { Kit } from './kit'

export const DiffBlock = (kit: Kit, t: T, content: DiffContent, path: string) => {
  const { Box, Text, Code } = kit
  if (content.kind === 'binary') return <Text dimColor>{t('binary')}</Text>
  return (
    <Box flexDirection="column" marginLeft={2}>
      {content.kind === 'diff' ? <Code source={content.text} path={path} format="diff" /> : <Code source={content.text} path={path} />}
      {content.isCut ? <Text dimColor>{t('bigDiff')}</Text> : null}
    </Box>
  )
}
