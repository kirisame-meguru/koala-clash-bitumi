import { exePath, homeDir } from '../utils/dirs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'
import path from 'path'
import { packageName, productName } from '../../shared/branding'

const appSlug = packageName
const windowsStartupShortcutName = `${productName}.lnk`
const windowsStartupApprovedShortcutKey =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'
const windowsStartupApprovedRunKey =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
const windowsRunKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const windowsRunValueName = productName

function windowsStartupShortcutPath(): string {
  return path.join(
    homeDir,
    'AppData',
    'Roaming',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    windowsStartupShortcutName
  )
}

export async function checkAutoRun(): Promise<boolean> {
  if (process.platform === 'win32') {
    return existsSync(windowsStartupShortcutPath())
  }

  if (process.platform === 'darwin') {
    const execFilePromise = promisify(execFile)
    const { stdout } = await execFilePromise('osascript', [
      '-e',
      `tell application "System Events" to get the name of every login item`
    ])
    return stdout.includes(exePath().split('.app')[0].replace('/Applications/', ''))
  }

  if (process.platform === 'linux') {
    return existsSync(path.join(homeDir, '.config', 'autostart', `${appSlug}.desktop`))
  }
  return false
}

export async function enableAutoRun(): Promise<void> {
  if (process.platform === 'win32') {
    const execFilePromise = promisify(execFile)
    const startupShortcutPath = windowsStartupShortcutPath()
    const shortcutScript = [
      `$shortcutPath = '${startupShortcutPath.replace(/'/g, "''")}'`,
      `$targetPath = '${exePath().replace(/'/g, "''")}'`,
      `$shell = New-Object -ComObject WScript.Shell`,
      `$shortcut = $shell.CreateShortcut($shortcutPath)`,
      `$shortcut.TargetPath = $targetPath`,
      `$shortcut.WorkingDirectory = Split-Path -Parent $targetPath`,
      `$shortcut.IconLocation = "$targetPath,0"`,
      `$shortcut.Save()`
    ].join('; ')
    await execFilePromise('reg.exe', [
      'delete',
      windowsRunKey,
      '/v',
      windowsRunValueName,
      '/f'
    ]).catch(() => undefined)
    await execFilePromise('reg.exe', [
      'delete',
      windowsStartupApprovedRunKey,
      '/v',
      windowsRunValueName,
      '/f'
    ]).catch(() => undefined)
    await execFilePromise('reg.exe', [
      'delete',
      windowsStartupApprovedShortcutKey,
      '/v',
      windowsStartupShortcutName,
      '/f'
    ]).catch(() => undefined)
    await execFilePromise('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      shortcutScript
    ])
    try {
      await execFilePromise('schtasks.exe', ['/delete', '/tn', appSlug, '/f'])
    } catch {
      // ignore stale scheduler cleanup failures
    }
  }
  if (process.platform === 'darwin') {
    const execFilePromise = promisify(execFile)
    await execFilePromise('osascript', [
      '-e',
      `tell application "System Events" to make login item at end with properties {path:"${exePath().split('.app')[0]}.app", hidden:false}`
    ])
  }
  if (process.platform === 'linux') {
    let desktop = `
[Desktop Entry]
Name=${productName}
Exec=${exePath()} %U
Terminal=false
Type=Application
Icon=${appSlug}
StartupWMClass=${appSlug}
Comment=${productName}
Categories=Utility;
`

    if (existsSync(`/usr/share/applications/${appSlug}.desktop`)) {
      desktop = await readFile(`/usr/share/applications/${appSlug}.desktop`, 'utf8')
    }
    const autostartDir = path.join(homeDir, '.config', 'autostart')
    if (!existsSync(autostartDir)) {
      await mkdir(autostartDir, { recursive: true })
    }
    const desktopFilePath = path.join(autostartDir, `${appSlug}.desktop`)
    await writeFile(desktopFilePath, desktop)
  }
}

export async function disableAutoRun(): Promise<void> {
  if (process.platform === 'win32') {
    const execFilePromise = promisify(execFile)
    await rm(windowsStartupShortcutPath(), { force: true })
    try {
      await execFilePromise('reg.exe', [
        'delete',
        windowsRunKey,
        '/v',
        windowsRunValueName,
        '/f'
      ])
    } catch {
      // ignore missing registry values
    }
    try {
      await execFilePromise('reg.exe', [
        'delete',
        windowsStartupApprovedShortcutKey,
        '/v',
        windowsStartupShortcutName,
        '/f'
      ])
    } catch {
      // ignore missing startup approval values
    }
    try {
      await execFilePromise('reg.exe', [
        'delete',
        windowsStartupApprovedRunKey,
        '/v',
        windowsRunValueName,
        '/f'
      ])
    } catch {
      // ignore missing startup approval values
    }
    try {
      await execFilePromise('schtasks.exe', ['/delete', '/tn', appSlug, '/f'])
    } catch {
      // ignore stale scheduler cleanup failures
    }
  }
  if (process.platform === 'darwin') {
    const execFilePromise = promisify(execFile)
    await execFilePromise('osascript', [
      '-e',
      `tell application "System Events" to delete login item "${exePath().split('.app')[0].replace('/Applications/', '')}"`
    ])
  }
  if (process.platform === 'linux') {
    const desktopFilePath = path.join(homeDir, '.config', 'autostart', `${appSlug}.desktop`)
    await rm(desktopFilePath)
  }
}
