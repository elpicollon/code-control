import type { BranchRef, RepoSnapshot } from '../../types'
import { NEW_BRANCH, OTHER_BRANCHES, SELECT_LIMIT, type Actions, type Kit, type PaneModel } from './kit'

const FILTER_RESULTS = 10
const branchLabel = (b: BranchRef): string => (b.remote === null ? b.name : b.value)

export const BranchSelect = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  const { Text, Select } = kit
  const { t } = model
  const repo = s.repo.path
  const mark = kit.Svg === undefined ? '⎇ ' : ''
  if (Select === undefined)
    return (
      <Text dimColor wrap="truncate-end">
        {`${mark}${s.branch.head ?? t('detached')}`}
      </Text>
    )
  const fits = s.branches.length + 1 <= SELECT_LIMIT
  const options = [
    ...s.branches.slice(0, fits ? s.branches.length : SELECT_LIMIT - 2).map(b => ({ value: b.value, label: branchLabel(b) })),
    { value: NEW_BRANCH, label: t('newBranch') },
    ...(fits ? [] : [{ value: OTHER_BRANCHES, label: t('otherBranches') }]),
  ]
  return (
    <Select
      key={`branch|${repo}`}
      {...(mark === '' ? {} : { label: '⎇' })}
      options={options}
      {...(s.branch.head === null ? {} : { value: s.branch.head })}
      onSelect={value => void actions.switchBranch(repo, value)}
    />
  )
}

const BranchFilter = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  const { Box, Button, Text, Input } = kit
  if (Input === undefined) return null
  const { t, ui } = model
  const repo = s.repo.path
  const text = ui.branchFilters[repo] ?? ''
  const needle = text.trim().toLowerCase()
  const matches = s.branches.filter(b => b.name.toLowerCase().includes(needle)).slice(0, FILTER_RESULTS)
  return (
    <Box flexDirection="column">
      <Input
        key={`branchfilter|${repo}`}
        placeholder={t('branchFilterPlaceholder')}
        value={text}
        onInput={value => void actions.setBranchFilter(repo, value)}
        onSubmit={() => {
          const first = matches[0]
          if (first !== undefined) void actions.switchBranch(repo, first.value)
        }}
      />
      {matches.length === 0 ? <Text dimColor>{t('noBranchMatch')}</Text> : null}
      {matches.map(b => (
        <Button key={`pick|${repo}|${b.value}`} label={branchLabel(b)} onPress={() => void actions.switchBranch(repo, b.value)} />
      ))}
    </Box>
  )
}

export const BranchExtras = (kit: Kit, model: PaneModel, actions: Actions, s: RepoSnapshot) => {
  const { Box, Button, Input } = kit
  if (Input === undefined) return null
  const { t, ui } = model
  const repo = s.repo.path
  return (
    <Box flexDirection="column">
      {ui.blockedSwitch[repo] === undefined ? null : (
        <Button key={`stashswitch|${repo}`} label={t('stashAndSwitch')} onPress={() => void actions.stashAndSwitch(repo)} />
      )}
      {ui.open[`newbranch|${repo}`] === true ? (
        <Input
          key={`newbranch|${repo}`}
          label={t('newBranch')}
          placeholder={t('branchPlaceholder')}
          submitLabel={t('createBranch')}
          value={ui.branchDrafts[repo] ?? ''}
          onInput={value => void actions.setBranchDraft(repo, value)}
          onSubmit={() => void actions.createBranch(repo)}
        />
      ) : null}
      {ui.open[`branchfilter|${repo}`] === true ? BranchFilter(kit, model, actions, s) : null}
    </Box>
  )
}
