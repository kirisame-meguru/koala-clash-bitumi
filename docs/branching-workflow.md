# Branching workflow

How branches and commits work in this repo. **This is an instruction — follow it when doing any work here.**

## Branches

- **`main` — release-only.** It receives the version-bump commit and CI's own pushes (the `release` job's version commit, the moved `nightly` tag). A push to `main` that changes `package.json`'s `version` triggers the release build (see [release-guide.md](release-guide.md)). **Never push everyday work to `main`.**
- **`dev` — integration.** The default base for everyday work, and the source of nightly builds.
- **`feat/<slug>`, `fix/<slug>`** (also `chore/`, `docs/`, `refactor/`) — short-lived branches off `dev`, one per change.

## The flow

1. **Branch off `dev`:**
   ```powershell
   git switch dev
   git switch -c fix/tray-icon-flicker
   ```
2. **Do the work.**
3. **Commit immediately — do not ask "should I commit?"** Write the message yourself per [commit-messages.md](commit-messages.md), then commit:
   ```powershell
   git add -A
   git commit -m "fix(tray): stop icon flicker on theme switch"
   ```
4. **Then decide whether — and how — to push.** This depends on **who you are** (your role in this repo) and **whether the work is done**. First [detect your role](#detecting-your-role), then follow the matching row of the [push matrix](#the-push-matrix). **Never push or open a PR without asking first**, and for unfinished work the default is **don't push** unless a concrete reason applies.

## Detecting your role

Run this at step 4 — don't guess. The **canonical upstream** is **`kirisame-meguru/clashapp`** (it equals `updateRepo` in `branding.json`).

```powershell
git config user.name          # who is committing
git remote -v                 # is 'origin' the canonical repo or a fork? is there an 'upstream'?
```

Classify into exactly one role (first match wins):

| Role | How to recognise it |
|---|---|
| **[Maintainer](#role-maintainer-kirisame-meguru)** | `user.name` is `kirisame-meguru` **and** `origin` is the canonical repo. |
| **[External contributor](#role-external-contributor)** | `origin` is a **fork** (its owner is **not** `kirisame-meguru`). An `upstream` remote usually points at the canonical repo. No push access to canonical. |
| **[Developer](#role-developer)** | `origin` **is** the canonical repo, but `user.name` is **not** `kirisame-meguru`. Can push `feat/`/`fix/` branches, but `main` and `dev` are protected. |

Optional confirmation of access (when origin ownership is unclear, or a push is rejected):

```powershell
gh api repos/kirisame-meguru/clashapp/collaborators/$(git config user.name)/permission --jq .permission
# -> admin | maintain | write | read | none
```

**Fallbacks:**

- If a push to a canonical `feat/`/`fix/` branch is **rejected for lack of access**, you're really an external contributor — switch to the [fork + PR flow](#role-external-contributor).
- If the role is **genuinely ambiguous** (no clear `origin`, detached HEAD, conflicting signals), **don't assume — ask the user** which flow they want.

> **Downstream forks:** a fork whose `main` is machine-managed by the overlay sync (e.g. `bitumi-clash`) follows a different model — `main` is force-rebuilt, not landed on. This matrix targets the canonical `kirisame-meguru/clashapp` workflow; adapting it for such forks is out of scope here. See [upstream-sync/README.md](upstream-sync/README.md).

## The push matrix

Pick the row for your role, then the column for the work's state. `<branch>` is your `feat/<slug>` / `fix/<slug>`.

**"Done"** = complete and you intend it to land. **"In progress"** = work in progress; the default is **don't push** — only offer to push mid-stream when a concrete reason applies (**ask first** either way):

- you need to **test the real packaged app** but can't build locally (no IDE / can't run `pnpm build:win`) → also offer a [live build](#getting-a-live-build-without-building-locally);
- **backup** of WIP off your machine before a risky change;
- **share progress** / hand someone the branch / ask an early question;
- get **review, help, or `kirisame-meguru`'s mid-way input**;
- let **CI run** (typecheck / lint / build) on the branch.

### Role: external contributor

You work from your **fork** and land changes via a PR **to upstream**. `origin` is your fork; add `upstream` if missing (`git remote add upstream https://github.com/kirisame-meguru/clashapp.git`).

- **In progress →** if a reason above applies, ask **"Should I push `<branch>` to your fork?"** If none applies, don't push.
  ```powershell
  git push -u origin <branch>      # origin = your fork
  ```
  If the reason is **"I need to test a real build but can't build locally"**, *also* ask **"Should I trigger a build on your fork so you get a downloadable installer?"** — see [getting a live build](#getting-a-live-build-without-building-locally).
- **Done →** ask **"Should I push `<branch>` to your fork and open a pull-request upstream?"** The PR targets the canonical repo's `dev`:
  ```powershell
  git push -u origin <branch>
  gh pr create --repo kirisame-meguru/clashapp --base dev --head <your-fork-owner>:<branch> --fill
  ```

### Role: developer

You have push access to topic branches on the canonical repo, but **`main` and `dev` are protected** — you can't push to or merge into them, so finished work always goes through a PR. `origin` **is** the canonical repo.

- **In progress →** if a reason above applies (collaborating, help / review / mid-way input, backup, CI), ask **"Should I push `<branch>`?"** Else don't push.
  ```powershell
  git push -u origin <branch>
  ```
  If you need a **live build but can't build locally**, *also* ask **"Should I trigger a build so you get a downloadable installer?"** — see [getting a live build](#getting-a-live-build-without-building-locally).
- **Done →** ask **"Should I push `<branch>` and open a pull-request into `dev`?"**
  ```powershell
  git push -u origin <branch>
  gh pr create --base dev --fill
  ```

### Role: maintainer (`kirisame-meguru`)

You have access to every branch, including `main` and `dev`.

- **In progress →** if a reason above applies (collaborating, want review, backup, run CI), ask **"Should I push `<branch>`?"** Else keep it local.
  ```powershell
  git push -u origin <branch>
  ```
- **Done → judge the right landing from context; don't pick one mechanically.** Decide with:

  > **Is this a critical fix, a strong release candidate, or is `dev` already ready to ship?**
  >
  > - **Yes, ship it now →** go straight to a release — chain **(d)** below; you may skip the topic-branch dance entirely.
  > - **No — land it, ship later →** chain **(b)**, the [maintainer fast-path](#maintainer-fast-path-kirisame-meguru).
  > - **Not landing yet (back up / share) →** chain **(a)** below.

  Then ask the single question that matches that chain:

  **(a) Push the branch only** — back up or share, not landing yet:
  ```powershell
  git push -u origin <branch>
  ```

  **(b) Fast-path onto `dev`** — land it, ship later (the common case). Ask **"Should I push and merge into `dev`?"** → [Maintainer fast-path](#maintainer-fast-path-kirisame-meguru).

  **(c) Land on `dev`, then release** — fast-path onto `dev`, then if it's release-worthy, ship it. Bump the version + changelog on `dev`, then fast-forward `main` to it:
  ```powershell
  # 1. fast-path the change onto dev (see below). then bump the release on dev:
  #    edit package.json "version" (plain semver, no leading v) + add the changelog.md section
  git add package.json changelog.md
  git commit -m "chore(release): bump version to <x.y.z>"
  git push origin dev
  # 2. fast-forward main to dev's release commit:
  git switch main
  git merge --ff-only dev          # main and dev track together -> clean fast-forward
  git push origin main             # the version change on main triggers the release build
  ```
  The bump + changelog rules are owned by [release-guide.md](release-guide.md) — follow it. If `main` has diverged from `dev`, `--ff-only` fails; reconcile first.

  **(d) Release straight away** — critical fix / strong RC / `dev` already release-ready; skip the topic-branch dance. Land the change on `dev` (or it's already there), then bump + ship exactly as in **(c)**. The push to `main` with a changed `package.json` `version` is the only trigger needed.

  When in doubt between (b), (c) and (d), **ask the user** which they want.

## Getting a live build without building locally

The `Build` workflow lives in this repo, so it runs in the canonical repo **and in any fork**. To get a downloadable installer without building on your machine, run it with an **empty version** input — that publishes a rolling `pre-release` beta (named `<next>-beta-<hash>`) in **that repo's** Releases:

```powershell
gh workflow run build.yml                       # current branch
gh workflow run build.yml --ref <branch>        # a specific branch (must already be pushed)
```

Or via the UI: **Actions → Build → Run workflow**, leaving the version field empty.

- **External contributor:** runs on **your fork**; the beta appears under your fork's Releases. Enable **Actions on your fork first** (forks ship with Actions disabled). macOS betas are **unsigned** (the `APPLE_*` secrets don't exist on a fork).
- **Developer / maintainer:** runs on the canonical repo, overwriting its rolling `pre-release` assets.
- Typing a **version** instead cuts a real release — don't do that for testing. See [release-guide.md](release-guide.md) for the full dispatch/version matrix.

## Maintainer fast-path (kirisame-meguru)

The repo owner skips pull-requests and lands work on `dev` directly. After a **"Should I push and merge into `dev`?"** yes:

```powershell
git push -u origin fix/tray-icon-flicker    # keep a remote copy of the branch
git switch dev
git merge --ff-only fix/tray-icon-flicker   # dev hasn't moved -> clean fast-forward, one commit
git push origin dev
git branch -d fix/tray-icon-flicker
git push origin --delete fix/tray-icon-flicker
```

If `dev` advanced since you branched, `--ff-only` fails — rebase the branch onto `dev` first, or squash it in (`git merge --squash fix/... && git commit`) so `dev` stays one-commit-per-change. This path targets `dev` only; `main` stays release-only.

## Merging pull requests

**Always squash-merge.** Every PR lands on its base branch as a single commit, keeping `dev` and `main` history linear — one commit per change. Don't use merge commits or rebase-merge.

```powershell
gh pr merge --squash --delete-branch
```

Lock it in under GitHub → Settings → General → Pull Requests: enable **Allow squash merging** only, and disable merge commits + rebase merging so nothing else is possible.

## Releasing

Changes accumulate on `dev`. When ready to ship, bump the version on `main` — that's the only thing that goes directly onto `main`, and it triggers the release. See [release-guide.md](release-guide.md).
