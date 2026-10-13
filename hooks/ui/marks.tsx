import type { RenderChildren, RenderElement } from 'claude-code'
import type { T } from '../i18n'
import { basename } from '../paths'
import { C, chevron, pill, PILL_HEIGHT, pillWidth, TYPE_WIDTH, typeIcon } from './icons'
import { arrow, HOVER_ONLY, hoverOnly, type Kit } from './kit'

// The row backgrounds: the selected repository at rest and under the pointer, and any other row under
// the pointer.
export const SELECTED = `${C.blue}1f`
export const SELECTED_HOVER = `${C.blue}2e`
export const ROW_HOVER = '#8080801a'

// How tall a list row stands where Svg draws, in CSS pixels: a text line alone is about 19, which packs
// the rows together. A row's leading icon is drawn in a box this tall, its drawing centered in it, so the
// row opens to it.
export const ROW_PX = 24
// A repository's row in the list stands taller, so the list reads as a set of separate items.
export const REPO_ROW_PX = 32

// An icon where the surface draws Svg; nothing on the terminal.
export const Icon = (kit: Kit, source: string, alt: string, width: number, height = 16) => {
  const { Svg } = kit
  return Svg === undefined ? null : <Svg source={source} alt={alt} width={width} height={height} />
}

// A file's mark by its type: TS, { }, <>, # and so on, in the language's color.
export const FileIcon = (kit: Kit, t: T, path: string) => Icon(kit, typeIcon(basename(path)), t('altFile'), TYPE_WIDTH, ROW_PX)

// Open or closed: the chevron icon, or ▾ and ▸ on the terminal.
export const Chevron = (kit: Kit, t: T, isOpen: boolean, height = ROW_PX) => {
  const { Text, Svg } = kit
  if (Svg === undefined) return <Text dimColor>{arrow(isOpen)}</Text>
  return <Svg source={chevron(isOpen)} alt={t(isOpen ? 'altOpen' : 'altClosed')} width={12} height={height} />
}

// A count in a rounded chip of its color, a dot before it with `dot`; the text alone, in the color, on
// the terminal.
export const Pill = (kit: Kit, label: string, color: string, alt: string, dot = false) => {
  const { Text, Svg } = kit
  if (Svg === undefined) return <Text color={color}>{dot ? `●${label}` : label}</Text>
  return <Svg source={pill(label, color, dot)} alt={alt} width={pillWidth(label, dot)} height={PILL_HEIGHT} />
}

// Where a hint opens: above its control growing left, for one on the pane's right; above it growing
// right, for one on the left; beside it, to its left, for one with nothing above.
export type Place = 'up' | 'upRight' | 'left'
const PLACES = { up: { top: -1, right: 0 }, upRight: { top: -1, left: 0 }, left: { top: 0, right: 3 } } as const

// A hint for what a control does, shown while the pointer is over it. It opens over what is drawn
// before it, since a later element paints over it. Surfaces with no pointer get the control alone.
export const Tip = (kit: Kit, key: string, text: string, child: RenderChildren, place: Place = 'up') => {
  const { Box, Text } = kit
  if (!hoverOnly(kit)) return child
  return (
    <Box key={`tip|${key}`} position="relative" flexShrink={0}>
      {child}
      <Box position="absolute" {...PLACES[place]} width={text.length + 2} display="none" hover={{ display: 'flex' }} backgroundColor="text" paddingX={1}>
        <Text color="inverseText" wrap="truncate-end">
          {text}
        </Text>
      </Box>
    </Box>
  )
}

// A small action: its glyph, dim until the pointer reaches it, with its hint.
export const Act = (kit: Kit, key: string, glyph: string, tip: string, onPress: () => void, place: Place = 'up') => {
  const { Button } = kit
  return Tip(kit, key, tip, <Button key={key} plain dimColor label={glyph} onPress={() => onPress()} />, place)
}

// A label that draws nothing and is no whitespace, so no surface trims it away: the clear button over a
// row. It stops short of the row's end, where counts and actions sit: a label longer than the row is cut
// with an ellipsis the surface draws.
export const blank = (columns: number): string => '\u2800'.repeat(Math.max(8, columns - 18))

// A clear button over a whole row, so a press anywhere on it acts; drawn before what ends the row (its
// counts, actions and their hints), which a later positioned element keeps above it. The row needs
// `position="relative"`.
export const RowPress = (kit: Kit, key: string, columns: number, onPress: () => void) => {
  const { Box, Button } = kit
  return (
    <Box position="absolute" top={0} left={0} right={0} height={1} overflow="hidden">
      <Button key={key} plain label={blank(columns)} onPress={() => onPress()} />
    </Box>
  )
}

// `columns`, where the surface has a pointer: the whole row opens and closes the block.
export type HeadParts = { icon?: RenderElement | null; badge?: RenderElement | null; actions?: RenderChildren; end?: RenderChildren; columns?: number }

// A collapsible block's title row: the chevron, its icon, the title as the button that opens and
// closes it and its badge, then at the right the actions under the pointer and what always ends it
// (a count). The row's own key (`head|` and the button's) lets a test read the chevron.
export const SectionHead = (kit: Kit, t: T, key: string, label: string, isOpen: boolean, onPress: () => void, parts: HeadParts = {}) => {
  const { Box, Text, Button } = kit
  const overRow = hoverOnly(kit) && parts.columns !== undefined
  return (
    <Box key={`head|${key}`} position="relative" flexDirection="row" alignItems="center" gap={1} paddingRight={1} hover={{ backgroundColor: ROW_HOVER }}>
      {Chevron(kit, t, isOpen)}
      {parts.icon ?? null}
      {overRow ? <Text>{label}</Text> : <Button key={key} plain label={label} onPress={() => onPress()} />}
      {parts.badge ?? null}
      <Box flexGrow={1} />
      {overRow ? RowPress(kit, key, parts.columns ?? 0, onPress) : null}
      {parts.actions === undefined || parts.actions === null ? null : (
        <Box flexDirection="row" gap={1} {...(hoverOnly(kit) ? HOVER_ONLY : {})}>
          {parts.actions}
        </Box>
      )}
      {parts.end ?? null}
    </Box>
  )
}
