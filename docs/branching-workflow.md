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
4. **Then ask to push** — the wording depends on who's working (`git config user.name`):
   - **Maintainer (`kirisame-meguru`):** ask **"Should I push and merge into `dev`?"** → take the [maintainer fast-path](#maintainer-fast-path-kirisame-meguru) (no PR).
   - **Any other contributor:** ask **"Should I push and create a pull-request?"** → push and open a PR into `dev`:
     ```powershell
     git push -u origin fix/tray-icon-flicker
     gh pr create --base dev --fill
     ```

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
