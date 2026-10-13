# How code-control works

code-control is a Claude Code *mod*: one hooks module that the mod engine loads, plus a few dozen plain TypeScript modules it imports. This page maps the code and explains the decisions that shaped it, most of them answers to what the engine allows.

## The shape

```
hooks/
  register.tsx        the only module that touches `$`: hooks, timers, the drawing
  host.ts             Host: the few engine calls the rest needs, as plain closures
  controller.ts       every action and refresh, over Host and three state stores
  schedule.ts         timer helpers (a tick never throws, never piles up)
  i18n.ts paths.ts errors.ts
  git/
    run.ts            the git runner: flags, environment, queues, timeouts
    status.ts discover.ts log.ts refs.ts lanes.ts actions.ts
  ai/
    commit-message.ts conflict-prompt.ts
  ui/
    kit.ts            the element table per surface, the pane's model and actions
    marks.tsx         shared marks: icons, chips, hints, block heads, the clear row button
    icons.ts          SVG sources: icons, language marks, count chips
    pane.tsx          the pane: repositories, the selected repository, the commit row
    band.tsx          the status row above the prompt
    files.tsx conflict.tsx branch.tsx stash.tsx log.tsx diff.tsx graph.ts
types/index.d.ts      the state contract the engine checks every `$.state` key against
tests/                the module under the engine's test kit
```

**Only `register.tsx` uses `$`.** The engine refuses to let `$` cross an import, so everything else receives what it needs as closures (`Host` for processes, files and the model; small `read`/`update` stores for state). That also makes the controller and the git code testable with plain fakes.

## State

Three session atoms hold everything the drawing reads:

| Atom | Holds |
|---|---|
| `repos` | One snapshot per repository: branch, ahead and behind, files, the operation in progress, incoming commits, stashes, branches, remotes and the remote's web page |
| `ui` | What is open or closed, message drafts, busy and error marks per repository, the selection, a pending second-click confirmation, the last fetch |
| `details` | Loaded on demand: diffs, the history page, a commit's files |

**Drawing is pure.** A render hook reads state and returns a tree; the engine refuses any state write while it draws. Every change comes from an action (a press, an input, a pick) or a timer.

## Git

Every git call goes through `git/run.ts`:

- `git --literal-pathspecs --no-optional-locks -c core.quotepath=off`, with `LC_ALL=C` and `LANGUAGE=C` so the English matchers read what git wrote.
- **One queue per repository**, so two actions never race in one working tree, and **a separate pool for the network**, so a slow fetch never holds up a status read.
- **Timeouts:** 90 seconds for the automatic fetch, 300 for an action that changes the repository.
- The automatic fetch runs with `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never`, so it can never stop to ask for a password.
- A stash is addressed by its hash, checked before it is dropped, so a list that moved in between never drops the wrong one.

## Staying current

- Status for every repository every 30 seconds.
- One second after Claude's `Edit`, `Write`, `NotebookEdit` or `Bash`, a `tool.call` hook reads status again.
- Fetch every `fetchIntervalMinutes` (5 by default), skipped while the previous one still runs.
- With the status row on, all of this starts with the session; otherwise with the pane.

## Decisions the engine shaped

**Only a `Button` takes a press.** A `Box` cannot, and a `Button` takes a text label alone. To make a whole row clickable, `RowPress` lays a clear button over it: absolutely positioned, its label a run of U+2800 (a blank that is not whitespace, so no surface trims it), cut short of the row's end so the surface draws no ellipsis. Elements drawn after it that are themselves positioned (the chips, the hover actions, their hints) paint above it and keep their own clicks.

**The first click on a pane without the keys only focuses.** The surface lands its focus ring on the element under the pointer and presses nothing. So the focus landing itself acts where acting is safe: on a repository row it selects (as a list's selection follows its focus), and on a block's toggle or a commit's subject it opens or closes, but only when that landing is the click that gave the pane the keys, so walking the pane with Tab flips nothing.

**A `Select` keeps the person's pick** until its hook draws a different value. The `⋯` menus are selects whose resting option is `⋯` under a value that changes with every pick, so each pick draws them at rest again.

**A `Select` with more than 64 options is refused**, and a refused element takes the whole pane with it. The branch picker lists what fits and opens a filter for the rest.

**A pane's drawing has a size bound.** Past it the desktop draws nothing: a tree of 305,000 serialized characters left the pane blank, while the same pane a little lighter drew. The pane measures its own tree and, over 240,000 characters, draws lighter step by step: without open diffs, then with 10 commits and 15 files per group, then with the heavy blocks closed, and says so.

**An `Input` takes no size.** The desktop draws it at a fixed width, so a message longer than the field is shown whole beneath it.

**Hints are drawn by hand.** A `Button` has no tooltip. A hint is an absolutely positioned box, hidden until its row is hovered, that opens above its control (or beside it, where nothing is above), growing away from the nearer edge. A site clips what lies outside it, so the one-row status band draws no hints at all.

**Icons are SVG with exact pixel sizes**, so a language mark sits as tall as the text beside it and a row's leading icon sets the row's height (24 pixels, 32 for a repository). The terminal draws no SVG; every icon there falls back to characters.

**Surfaces differ.** The element table is resolved per surface: no `Svg` on the terminal, no `Input` or `Select` on mobile (the pane is read-only there). Hints and hover reveals exist only where a pointer does.

## Tests

`claude plugin test .` loads the real module in the engine's test kit, scripts every git call, and mounts the pane and the status row on the desktop, terminal, VS Code and mobile surfaces. The engine validates every drawn tree there as it would live, so a refused element fails a test. Pure parts (the git parsers, the graph lanes, the remote-to-web mapping, the schedule) have tests of their own.
