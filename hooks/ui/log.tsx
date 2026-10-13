import type { CommitFile, RepoSnapshot } from '../../types'
import { computeLanes } from '../git/lanes'
import { PAGE } from '../git/log'
import { commitUrlOf } from '../git/refs'
import { ago } from '../i18n'
import { basename, dirname } from '../paths'
import { DiffBlock } from './diff'
import { ROW, STEP, rowSvg, rowText } from './graph'
import { type Actions, type Kit, type PaneModel } from './kit'
import { GRAY, graphIcon, incomingIcon } from './icons'
import { Icon, Pill, ROW_HOVER, SectionHead } from './marks'

// One line a file: the status, the name to press for its diff, the folder dim and cut at its start.
const FileList = (kit: Kit, model: PaneModel, actions: Actions, scope: 'in' | 'hist', repo: string, hash: string, files: readonly CommitFile[]) => {
  const { Box, Text, Button } = kit
  return (
    <Box flexDirection="column" marginLeft={2}>
      {files.map(f => {
        const key = `cfile|${repo}|${hash}|${f.path}`
        const content = model.details.diffs[key]
        return (
          <Box key={`${scope}:cfilerow|${repo}|${hash}|${f.path}`} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text dimColor>{f.status}</Text>
              <Button key={`${scope}:${key}`} plain label={basename(f.path)} onPress={() => void actions.toggleCommitFile(repo, hash, f.path)} />
              <Text dimColor wrap="truncate-start">
                {dirname(f.path)}
              </Text>
            </Box>
            {content === undefined ? null : DiffBlock(kit, model.t, content, f.path)}
          </Box>
        )
      })}
    </Box>
  )
}

// A commit's short hash, as a link to its page on the remote repository's site where the remote has one
// (Azure DevOps, GitHub, GitLab, Bitbucket and the like), dim text otherwise.
const CommitLink = (kit: Kit, s: RepoSnapshot, hash: string, short: string) => {
  const { Box, Text, Link } = kit
  return (
    <Box flexShrink={0}>{s.webUrl === null ? <Text dimColor>{short}</Text> : <Link href={commitUrlOf(s.webUrl, hash)} label={short} />}</Box>
  )
}

// A commit's subject, cut at its end, the button that shows the files it changed under it.
const Subject = (kit: Kit, key: string, subject: string, onPress: () => void) => {
  const { Box, Button } = kit
  return (
    <Box flexShrink={1} minWidth={0} overflow="hidden">
      <Button key={key} plain label={subject} onPress={() => onPress()} />
    </Box>
  )
}

const INCOMING_SHOWN = 10
const HISTORY_SHOWN = 20

// Collapsed to its title until opened, with the count to pull. A row is one line: the short hash
// (pressed for the files), the subject cut at its end and the short date; no author.
export const IncomingView = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  if (s.branch.behind === 0) return null
  const { Box, Text, Button } = kit
  const { t } = model
  const repo = s.repo.path
  const sectionKey = `section|${repo}|incoming`
  const isOpen = model.ui.open[sectionKey] === true
  const moreKey = `inmore|${repo}`
  const expanded = model.ui.open[moreKey] === true
  const loaded = s.incoming.length
  const shown = expanded && model.listCap === undefined ? s.incoming : s.incoming.slice(0, Math.min(INCOMING_SHOWN, model.listCap ?? INCOMING_SHOWN))
  return (
    <Box key={`inblock|${repo}`} flexDirection="column">
      {SectionHead(kit, t, sectionKey, t('incomingSection'), isOpen, () => void actions.toggle(sectionKey, isOpen), {
        icon: Icon(kit, incomingIcon, t('incomingSection'), 16),
        end: Pill(kit, String(s.branch.behind), GRAY, t('stateBehind', { n: s.branch.behind })),
        columns: model.columns,
      })}
      {isOpen ? (
        <Box flexDirection="column" paddingLeft={2}>
          {shown.map(c => {
            const key = `in|${repo}|${c.hash}`
            const filesOpen = model.ui.open[key] === true
            return (
              <Box key={`inrow|${key}`} flexDirection="column">
                <Box key={`inline|${key}`} flexDirection="row" alignItems="center" gap={1} hover={{ backgroundColor: ROW_HOVER }}>
                  {CommitLink(kit, s, c.hash, c.short)}
                  {Subject(kit, key, c.subject, () => void actions.toggle(key, filesOpen))}
                  <Box flexGrow={1} />
                  <Box flexShrink={0}>
                    <Text dimColor>{ago(t, c.time, model.now)}</Text>
                  </Box>
                </Box>
                {filesOpen ? FileList(kit, model, actions, 'in', repo, c.hash, c.files) : null}
              </Box>
            )
          })}
          {loaded > INCOMING_SHOWN ? <Button key={moreKey} plain label={t('moreCommits', { n: loaded - INCOMING_SHOWN })} onPress={() => void actions.toggle(moreKey, expanded)} /> : null}
          {expanded && s.branch.behind > loaded ? <Text dimColor>{t('showingOf', { shown: loaded, total: s.branch.behind })}</Text> : null}
        </Box>
      ) : null}
    </Box>
  )
}

// Collapsed to its title until opened; only for a repository with a commit. A row is the graph, the
// short hash (pressed for the files), the refs and subject cut at their end, the short date.
export const HistoryView = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  if (s.branch.oid === null) return null
  const { Box, Text, Button, Svg } = kit
  const { t } = model
  const repo = s.repo.path
  const key = `history|${repo}`
  const isOpen = model.ui.open[key] === true
  const commits = isOpen ? (model.details.history[repo] ?? []) : []
  // The lanes need every commit read; the first rows show, the rest behind their own button, as each row
  // weighs on a drawing the surface bounds.
  const rows = computeLanes(commits)
  const moreKey = `histmore|${repo}`
  const expanded = model.ui.open[moreKey] === true
  const shownRows = expanded && model.listCap === undefined ? rows : rows.slice(0, Math.min(HISTORY_SHOWN, model.listCap ?? HISTORY_SHOWN))
  return (
    <Box key={`histblock|${repo}`} flexDirection="column">
      {SectionHead(kit, t, key, t('historySection'), isOpen, () => void actions.toggleHistory(repo), { icon: Icon(kit, graphIcon, t('historySection'), 16), columns: model.columns })}
      {isOpen ? (
        <Box flexDirection="column" paddingLeft={2}>
          {shownRows.map((row, i) => {
            const c = commits[i]
            if (c === undefined) return null
            const filesKey = `commit|${repo}|${c.hash}`
            const files = model.ui.open[filesKey] === true ? model.details.commitFiles[filesKey] : undefined
            return (
              <Box key={`hist|${filesKey}`} flexDirection="column">
                <Box key={`histline|${filesKey}`} flexDirection="row" alignItems="center" gap={1} hover={{ backgroundColor: ROW_HOVER }}>
                  {Svg === undefined ? <Text color="subtle">{rowText(row)}</Text> : <Svg source={rowSvg(row)} alt={c.short} width={row.width * STEP} height={ROW} />}
                  {CommitLink(kit, s, c.hash, c.short)}
                  {c.refs.length > 0 ? (
                    <Text bold color="suggestion" wrap="truncate-end">
                      {`[${c.refs.join(', ')}]`}
                    </Text>
                  ) : null}
                  {Subject(kit, filesKey, c.subject, () => void actions.toggleCommit(repo, c.hash))}
                  <Box flexGrow={1} />
                  <Box flexShrink={0}>
                    <Text dimColor>{ago(t, c.time, model.now)}</Text>
                  </Box>
                </Box>
                {files === undefined ? null : FileList(kit, model, actions, 'hist', repo, c.hash, files)}
              </Box>
            )
          })}
          {shownRows.length < rows.length ? (
            <Button key={moreKey} plain label={t('moreCommits', { n: rows.length - shownRows.length })} onPress={() => void actions.toggle(moreKey, expanded)} />
          ) : commits.length > 0 && commits.length % PAGE === 0 ? (
            <Button key={`loadmore|${repo}`} plain label={t('loadMore')} onPress={() => void actions.loadMore(repo)} />
          ) : null}
        </Box>
      ) : null}
    </Box>
  )
}
