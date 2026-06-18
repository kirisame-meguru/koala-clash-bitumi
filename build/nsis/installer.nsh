; APP_TASK_NAME / APP_TASK_RUNNER_NAME come from branding.json via
; electron-builder.config.cjs (generated build/nsis/branding.nsh).
; PRODUCT_NAME / PRODUCT_FILENAME are provided by electron-builder.
!include "${BUILD_RESOURCES_DIR}\nsis\branding.nsh"

!macro customInit
  ; --- Optional profile migration from old Koala Clash app ---

  ; Force current user context to resolve $APPDATA correctly
  ; (perMachine installers may default to all-users context)
  SetShellVarContext current

  ; Check if old profiles.yaml exists and back it up
  ; Try Roaming AppData first, then Local AppData as fallback
  IfFileExists "$APPDATA\io.github.koala-clash\profiles.yaml" 0 check_localappdata
    CopyFiles /SILENT "$APPDATA\io.github.koala-clash\profiles.yaml" "$TEMP\koala-clash-migration-profiles.yaml"
    Goto backup_done
  check_localappdata:
  IfFileExists "$LOCALAPPDATA\io.github.koala-clash\profiles.yaml" 0 backup_done
    CopyFiles /SILENT "$LOCALAPPDATA\io.github.koala-clash\profiles.yaml" "$TEMP\koala-clash-migration-profiles.yaml"
  backup_done:

  ; Restore context for the rest of the installer
  SetShellVarContext all
!macroend

!macro customInstall
  ; Remove stale elevated runner tasks from dev/old builds before the app recreates them.
  ExecWait '"$SYSDIR\schtasks.exe" /Delete /TN "${APP_TASK_NAME}" /F'
  ExecWait '"$SYSDIR\schtasks.exe" /Delete /TN "${APP_TASK_RUNNER_NAME}" /F'
  ExecWait '"$SYSDIR\schtasks.exe" /Delete /TN "koala-clash-run" /F'

  ; Register default Windows autostart in a place visible in Task Manager.
  SetShellVarContext current
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCT_NAME}"
  Delete "$SMSTARTUP\${PRODUCT_NAME}.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder" "${PRODUCT_NAME}.lnk"
  CreateShortCut "$SMSTARTUP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0

  ; --- Copy migration file to new app data directory ---
  IfFileExists "$TEMP\koala-clash-migration-profiles.yaml" 0 no_migration_file
    CreateDirectory "$APPDATA\${PRODUCT_NAME}"
    CopyFiles /SILENT "$TEMP\koala-clash-migration-profiles.yaml" "$APPDATA\${PRODUCT_NAME}\.migration-profiles.yaml"
    Delete "$TEMP\koala-clash-migration-profiles.yaml"
  no_migration_file:
  SetShellVarContext all
!macroend

!macro customUnInstall
  ; Clean up elevated runner tasks so future installs cannot launch an old exe path.
  SetShellVarContext current
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCT_NAME}"
  Delete "$SMSTARTUP\${PRODUCT_NAME}.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder" "${PRODUCT_NAME}.lnk"
  SetShellVarContext all
  ExecWait '"$SYSDIR\schtasks.exe" /Delete /TN "${APP_TASK_NAME}" /F'
  ExecWait '"$SYSDIR\schtasks.exe" /Delete /TN "${APP_TASK_RUNNER_NAME}" /F'
  ExecWait '"$SYSDIR\schtasks.exe" /Delete /TN "koala-clash-run" /F'
!macroend
