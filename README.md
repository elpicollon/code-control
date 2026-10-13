<div align="center">

# code-control

**A source control pane for Claude Code.**<br>
Every git repository in your session, at a glance: what changed, what to pull, what to push, and what's in conflict. Commit, branch, stash, pull and resolve without leaving the conversation.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)
![Surfaces](https://img.shields.io/badge/surfaces-desktop%20%C2%B7%20terminal%20%C2%B7%20VS%20Code-555)
![Languages](https://img.shields.io/badge/UI-English%20%C2%B7%20Portugu%C3%AAs-555)

[Leia em português](README.pt-BR.md)

</div>

---

Claude edits your files; code-control shows you, live, what that means for git. It sits beside the conversation like VS Code's Source Control view, but it watches **every** repository in the folders your session can reach, sorts them by what needs you, and keeps a one-line summary right above the prompt.

```
 ⌄ Repositories (12)                                   5 min ago   ↻   ⋯
   ▣ api-server       ⑂ feature/login               ● 14   ↓ 3   ↑ 2
   ▣ docs             ⑂ main                        !      ● 1
   ▣ web-app          ⑂ main                                ↓ 120
   › 9 more · 7 up to date

 ▣ api-server   ⑂ feature/login ⌄                               ↓3   ↑2
 [ Commit message        ]  ✦   ✓ Commit   ⋯

 ⌄ Staged Changes                                                     2
     TS  session.ts           src/auth                                M
 ⌄ Changes                                                           12
     {}  package.json                                                 M
     #   login.css            src/styles                              U
 › ⤓ Incoming                                                         3
 › ▤ Stash                                                            1
 › ⑂ Graph
```

<sub>A sketch of the layout. The desktop app draws real icons, colored chips and hover hints where this shows characters; the terminal draws characters much like these.</sub>

## Highlights

- **Every repository, sorted by what needs you.** Conflicts and changes first, then what's behind or ahead, then the ones in sync, folded into one line. Each row says it with colored chips: `!` trouble, `●` changes, `↓` to pull, `↑` to push.
- **A status row above the prompt.** The selected repository, its branch and its chips stay in view while you talk to Claude. One click opens the pane.
- **Commit the way you would in an editor.** Stage, unstage and discard per file or all at once, read the diff inline, write the message yourself or let **✦** write it in your repository's own style. Amend, undo the last commit or stash from the **⋯** menu.
- **Branches and sync.** Switch, track a remote branch, create one, or stash and switch when your changes are in the way. Pull fast-forward, and choose merge or rebase when the branches diverged. Push, or publish a branch with no upstream.
- **Conflicts, handled.** A banner for the merge, rebase or cherry-pick in progress; keep mine, keep theirs, mark resolved, or hand the file to Claude to resolve; then continue or abort.
- **History you can follow.** Incoming commits with their files, and a graph of your branch and its upstream. Every commit hash links to its page on Azure DevOps, GitHub, GitLab or Bitbucket.
- **Always current.** Status every 30 seconds and right after Claude edits a file; a quiet fetch every 5 minutes.
- **Careful by design.** Nothing commits, pulls or pushes on its own. Destructive actions ask twice. Scripts are revealed, never run.

## Install

From a terminal:

```bash
claude plugin install code-control --marketplace elpicollon/code-control
```

This adds the marketplace and installs the plugin for your user, so it loads in every project, in the terminal and in the desktop app's Code tab. Start a new session afterwards.

Already in a Claude Code terminal session? The same in two steps:

```
/plugin marketplace add elpicollon/code-control
/plugin install code-control@code-control
```

> In the desktop app, `/plugin` opens the app's own plugin catalog, which doesn't list code-control. Install from a terminal as above; the Code tab picks it up.

To update later, run `claude plugin update code-control@code-control`; to remove it, `claude plugin uninstall code-control@code-control`.

**Requirements**

- Claude Code with mods enabled. code-control is a *mod*, a plugin of function hooks. Mods are rolling out gradually: where they are turned off, the plugin installs but does not load. Built and tested on Claude Code 2.1.293 and 2.1.295.
- `git` on your `PATH`.

## Quick start

1. Type `/code-control`. The pane opens beside the conversation.
2. Pick a repository in the list. Its detail opens below: branch, sync, commit and files.
3. Work with Claude as usual. The pane and the status row above the prompt follow every change.

## A tour of the pane

### Repositories

Repositories are found in your session's working folder, its project root and any additional directories you've allowed, up to three levels down. `node_modules`, build output and hidden folders are skipped.

| Chip | Means |
|---|---|
| `!` red | A merge, rebase or cherry-pick in progress, a conflict, or an error |
| `● 14` amber | Files changed |
| `↓ 3` blue | Commits to pull |
| `↑ 2` green | Commits to push |

Hover the chips to read the same in words. Click anywhere on a row to select it. The header folds the list away, `↻` fetches every repository now, and `⋯` holds the pane's settings.

### The selected repository

- **Branch picker.** Switch to a local branch or track a remote one, or create a new branch. When there are more branches than the list can hold, *Other branches…* opens a filter. If your changes would be overwritten, *Stash and switch* does both.
- **`↓3` `↑2`.** Pull and push. Pull is fast-forward only; if the branches diverged, you choose **Merge** or **Rebase**. A branch with no upstream gets **Publish branch** (`push -u`).
- **Commit row.** Type the message and press Enter or **✓ Commit**. With nothing staged, Commit stages everything first (not during a merge, rebase or cherry-pick). **✦** writes the message with Claude, following the style and language of your last ten commit subjects. **⋯** holds *Amend last commit*, *Undo last commit* (a soft reset, so your changes stay) and *Stash changes*. Amend and undo refuse a commit that was already pushed.

### Changes

Files are grouped into **Conflicts**, **Staged Changes** and **Changes**, each with its count, each collapsible. Every file shows a colored mark for its type, its folder and its status letter: `M` modified, `A` added, `U` untracked, `D` deleted, `R` renamed.

- Click a file's name to see its diff inline.
- Hover a row for `↗` open, `↶` discard (asks twice), `+` stage, `−` unstage. Hover a group's title to stage or unstage all of it.
- `↗` opens a file in its default app. A script, an executable or a file with no extension is revealed in Finder or Explorer instead, so it never runs.

### Conflicts

While a merge, rebase or cherry-pick is in progress, a banner says so and counts the conflicts. For each file you can view the conflict, **keep mine** or **keep theirs** (each asks twice), open it, **mark it resolved**, or **resolve with Claude**: Claude gets the file and what each side is, merges it by hand and tells you what it kept. When nothing is left in conflict, **Continue** finishes the operation; **Abort** undoes it (asks twice).

A conflict left by `stash apply` has no operation behind it; keep mine, keep theirs and resolve with Claude still work.

### Incoming, Graph and Stash

- **Incoming** lists the commits you'd pull, with the files each one touches.
- **Graph** draws your branch and its upstream, 20 commits at first and more on demand.
- Click a commit's **hash** to open it on your remote's site; click its **subject** to see its files right in the pane.
- **Stash** lists your stashes: apply, apply and drop, view the diff, or delete (asks twice).

Commit links are built from the remote your branch tracks:

| Host | Commit page |
|---|---|
| Azure DevOps (`dev.azure.com`, `*.visualstudio.com`) | `…/_git/repo/commit/<hash>` |
| GitHub, GitHub Enterprise, Gitea | `…/commit/<hash>` |
| GitLab | `…/-/commit/<hash>` |
| Bitbucket Cloud | `…/commits/<hash>` |
| Bitbucket Server / Data Center | `…/projects/KEY/repos/repo/commits/<hash>` |

HTTPS and SSH remotes both work, including aliases from `~/.ssh/config` (resolved with `ssh -G`, which only reads the config). A remote on plain `http://` or a local path gets no link.

## Staying current

| When | What |
|---|---|
| Every 30 seconds | `git status` for every repository |
| 1 second after Claude edits a file | `git status` again (after `Edit`, `Write`, `NotebookEdit` or `Bash`) |
| Every 5 minutes | `git fetch --prune`, quietly, with credential prompts turned off |
| `↻` | Find new repositories and fetch now |

With the status row on, this runs from the start of the session; with it off, only while the pane is open.

## Settings

Change them with `/config` in a Claude Code terminal. The status row can also be switched from the pane's `⋯` menu.

| Setting | Default | |
|---|---|---|
| `showStatusRow` | `true` | The row above the prompt. Off, repositories are read only while the pane is open. |
| `fetchIntervalMinutes` | `5` | Minutes between automatic fetches, at least 1. `0` turns automatic fetching off; `↻` still fetches. |
| `language` | `auto` | `en` or `pt-BR`. `auto` picks Portuguese when Claude Code's `language` setting, `LANG` or your system locale says so, English otherwise. |
| `commitMessageModel` | `sonnet` | The model alias or id ✦ uses. |

## Safety and privacy

- **Nothing happens on its own** except fetch. Commit, pull, push, discard and stash run only when you press them.
- **Destructive actions ask twice:** discard, delete a stash, keep mine, keep theirs, abort.
- **Git runs carefully.** Paths are always literal (`--literal-pathspecs`), so a file named `[ab].txt` is that file and never a pattern. Status reads take no index lock (`--no-optional-locks`), so they never get in the way of Claude's own git commands. A commit is refused while conflicts remain.
- **The automatic fetch never prompts.** It turns off git's own credential prompt (`GIT_TERMINAL_PROMPT=0`) and Git Credential Manager's (`GCM_INTERACTIVE=never`). It can't turn off an SSH passphrase or host-key prompt, or an askpass helper.
- **Repository hooks don't run.** Mods run git with hooks off. If your project relies on a pre-commit hook, make that commit from the terminal.
- **What leaves your machine:** only what ✦ sends, which is the diff (up to 60,000 characters), the names of new files and your last ten commit subjects, through your own Claude Code session. *Resolve with Claude* asks in your conversation. Nothing else is sent anywhere.

## Good to know

- **The message field is narrow** in the desktop app: Claude Code draws a mod's text field at a fixed width. A message longer than the field shows whole right below it.
- **Very full panes draw lighter.** Claude Code won't draw a pane past a certain size. Near it, code-control closes open diffs and shows fewer commits and files, and tells you, instead of going blank.
- **The first click on a pane you weren't using** only gives it the keyboard focus. Rows, group titles and commit subjects act on that click anyway; other buttons may need a second one.
- **On a phone** the pane is read-only: the mobile app draws no text fields yet.

## How it works

code-control is one hooks module for Claude Code's mod engine. It draws the pane and the status row from state it keeps in the session, and talks to git through the engine's process runner, with a queue per repository and a separate one for the network. See [docs/architecture.md](docs/architecture.md) for the module map and the design decisions behind it.

## Develop

```bash
claude plugin validate --strict .
claude plugin test .
npx -p typescript@5.6.3 tsc -p .
```

To try a change live, start Claude Code with `--plugin-dir .`, or link the folder into your session's mod folder and let Claude Code hot-reload it.

The tests load the real module against a scripted git and mount the pane on every surface (desktop, terminal, VS Code and mobile), so layout, behavior and the engine's own checks are covered without touching a real repository.

## License

[MIT](LICENSE) © Rodrigo Picolo
