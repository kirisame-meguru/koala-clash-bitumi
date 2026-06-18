# ClashApp build and release guide

⚠️ This guide has not been verified since the ClashApp fork ⚠️

This procedure is intended for Windows and the `kirisame-meguru/clashapp` repository.

## 1. Prepare the code

```powershell
git status
git pull origin main
```

Before a release, update:

- `package.json` -> `version`
- `changelog.md` -> add a section with the same version, for example `## 1.2.1`

The version must be a plain semver version without the letter `v`: `1.2.1`, `1.3.0`, `2.0.0`.

## 2. Install dependencies from scratch

```powershell
$env:SKIP_PREPARE='1'
npx --yes pnpm@10.33.0 install
Remove-Item Env:\SKIP_PREPARE
npx --yes pnpm@10.33.0 prepare --x64
```

`prepare --x64` downloads the sidecar files for Windows x64. For arm64, use `prepare --arm64`.

## 3. Check the project

```powershell
npx --yes pnpm@10.33.0 run typecheck
```

If the types pass, you can build.

## 4. Build the Windows version locally

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx --yes pnpm@10.33.0 run build:win -- --x64
```

The built files will be in `dist/`:

- `ClashApp_x64-setup.exe` - installer
- `ClashApp_x64-portable.7z` - portable archive

Test the installer with a clean install over the previous version. User data lives in `app.getPath('userData')`, so updating via the installer should not remove subscriptions and settings.

## 5. Push the changes to GitHub

```powershell
git status
git add package.json changelog.md src scripts .github docs README.md build
git commit -m "release 1.2.1"
git push origin main
```

Replace `1.2.1` with the current version.

## 6. Option A: publish a release via GitHub Actions

1. Open GitHub -> `Actions` -> `Build`.
2. Click `Run workflow`.
3. In the `Tag version to release` field, enter the version without `v`, for example `1.2.1`.
4. Run the workflow and wait for it to finish.

The workflow builds the artifacts, creates a GitHub Release, and uploads the files to the release. On its next launch, the app checks `releases/latest`, sees the new version, and prompts the user to download the update.

## 7. Option B: manual release without GitHub Actions

If GitHub Actions is blocked by billing, you can publish a release manually:

```powershell
npx --yes pnpm@10.33.0 updater
```

After that, open GitHub -> `Releases` -> `Draft a new release`:

- `Tag`: the version without `v`, for example `1.2.1`
- `Target`: `main`
- `Title`: `1.2.1`
- `Description`: the contents of `changelog.md`
- `Assets`: upload `latest.yml`, `dist/ClashApp_x64-setup.exe`, `dist/ClashApp_x64-portable.7z`

Publish the release. The app will see the new version through the GitHub Releases API and prompt the user to download the installer.

## 8. What matters for safe updates

- Do not change `appId` in `electron-builder.yml`, otherwise Windows will treat the app as a different product.
- Do not change `productName` unless necessary, otherwise the installer names and install path may differ.
- Do not remove migrations or the current `userData` folder; it stores users' subscriptions and settings.
- Publish releases only to `kirisame-meguru/clashapp`, because the update check looks specifically there.
- For a public release, use a plain version like `1.2.1`, not `1.2.1-beta`.
