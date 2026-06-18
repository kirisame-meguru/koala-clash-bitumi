import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import {
  TRACKED_SETTINGS,
  TRACKED_BY_ID,
  isChanged,
  currentValue,
  formatValue,
  type ChangeContext,
  type TrackSection,
  type TrackedSetting
} from '@renderer/utils/tracked-settings'

export interface ChangedSetting {
  id: string
  section: TrackSection
  route: string
  labelKey: string
  /** display string of the current (non-default) value */
  current: string
  /** display string of the default value */
  default: string
}

export interface TrackProps {
  highlight: boolean
  defaultHint?: string
  /** DOM id for deep-link scroll targeting */
  anchorId: string
}

export interface UseChangedSettings {
  count: number
  changed: ChangedSetting[]
  /** props to spread onto a SettingItem / EditableList for a given tracked id */
  track: (id: string) => TrackProps
}

export function useChangedSettings(): UseChangedSettings {
  const { t } = useTranslation()
  const { appConfig } = useAppConfig()
  const { controledMihomoConfig } = useControledMihomoConfig()
  const { profileConfig } = useProfileConfig()

  // The changed-settings warning is opt-in per profile: the subscription server
  // must send X-Clashapp-Unsupported-Cfg-Warn: true (stored as unsupportedCfgWarn).
  const trackingEnabled = useMemo(() => {
    const current = profileConfig?.items?.find((item) => item.id === profileConfig?.current)
    return current?.unsupportedCfgWarn === true
  }, [profileConfig])

  return useMemo(() => {
    if (!trackingEnabled || !appConfig || !controledMihomoConfig) {
      return { count: 0, changed: [], track: (id) => ({ highlight: false, anchorId: `setting-${id}` }) }
    }

    const ctx: ChangeContext = { app: appConfig, mihomo: controledMihomoConfig }

    const changedSet = new Set<string>()
    const changed: ChangedSetting[] = []
    for (const setting of TRACKED_SETTINGS) {
      if (!isChanged(setting, ctx)) continue
      changedSet.add(setting.id)
      changed.push({
        id: setting.id,
        section: setting.section,
        route: setting.route,
        labelKey: setting.labelKey,
        current: formatValue(setting, currentValue(setting, ctx), t),
        default: formatValue(setting, setting.default, t)
      })
    }

    const defaultHintFor = (setting: TrackedSetting): string =>
      t('pages.changedSettings.defaultLabel', { value: formatValue(setting, setting.default, t) })

    const track = (id: string): TrackProps => {
      const anchorId = `setting-${id}`
      const setting = TRACKED_BY_ID[id]
      if (!setting || !changedSet.has(id)) return { highlight: false, anchorId }
      return { highlight: true, defaultHint: defaultHintFor(setting), anchorId }
    }

    return { count: changed.length, changed, track }
  }, [trackingEnabled, appConfig, controledMihomoConfig, t])
}
