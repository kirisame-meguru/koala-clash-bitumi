import React, { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Switch } from '@renderer/components/ui/switch'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useChangedSettings } from '@renderer/hooks/use-changed-settings'
import { patchMihomoConfig } from '@renderer/utils/ipc'
import { LogsIcon } from '@renderer/components/icons/sidebar-icons'
import { ArrowUpDown, CalendarClock, ChevronRight, Globe, PieChart } from 'lucide-react'

const TabSwitches: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { track } = useChangedSettings()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { profileConfig } = useProfileConfig()
  const {
    enableLogsTab = false,
    showTrafficUsage = true,
    showTrafficLeftExpires = true,
    hideTrafficLeftExpiresWhenUnlimited = true,
    globalModeToggle = false
  } = appConfig || {}

  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])
  const globalModeAllowed = currentProfile?.globalMode !== false

  return (
    <>
      <SettingCard>
        <SettingItem
          title={
            <span className="inline-flex items-center">
              <Trans
                i18nKey="settings.subscription.showTrafficUsage"
                components={{ usage: <ArrowUpDown className="size-4 mx-1.5 shrink-0" /> }}
              />
            </span>
          }
        >
          <Switch
            checked={showTrafficUsage}
            onCheckedChange={(value) => patchAppConfig({ showTrafficUsage: value })}
          />
        </SettingItem>
        <SettingItem
          title={
            <span className="inline-flex items-center">
              <Trans
                i18nKey="settings.subscription.showTrafficLeftExpires"
                components={{
                  remaining: <PieChart className="size-4 mx-1.5 shrink-0" />,
                  expiry: <CalendarClock className="size-4 mx-1.5 shrink-0" />
                }}
              />
            </span>
          }
        >
          <Switch
            checked={showTrafficLeftExpires}
            disabled={!showTrafficUsage}
            onCheckedChange={(value) => patchAppConfig({ showTrafficLeftExpires: value })}
          />
        </SettingItem>
        <SettingItem
          title={t('settings.subscription.hideTrafficLeftExpiresUnlimited')}
          indent={1}
          divider
        >
          <Switch
            checked={hideTrafficLeftExpiresWhenUnlimited}
            disabled={!showTrafficUsage || !showTrafficLeftExpires}
            onCheckedChange={(value) =>
              patchAppConfig({ hideTrafficLeftExpiresWhenUnlimited: value })
            }
          />
        </SettingItem>
        <SettingItem
          title={
            <span className="inline-flex items-center">
              <Trans
                i18nKey="settings.advanced.globalMode"
                components={{ icon: <Globe className="size-4 mx-1.5 shrink-0" /> }}
              />
            </span>
          }
          {...track('globalModeToggle')}
        >
          <Switch
            checked={globalModeToggle}
            disabled={!globalModeAllowed}
            onCheckedChange={async (enable: boolean) => {
              await patchAppConfig({ globalModeToggle: enable })
              // Disabling the toggle must take effect immediately: if the proxy is
              // currently in global mode, drop back to rule mode (mirrors the
              // startup enforcement in main/utils/init.ts).
              if (!enable && controledMihomoConfig?.mode === 'global') {
                await patchControledMihomoConfig({ mode: 'rule' })
                await patchMihomoConfig({ mode: 'rule' })
                window.electron.ipcRenderer.send('updateTrayMenu')
              }
            }}
          />
        </SettingItem>
      </SettingCard>
      <SettingCard>
        <SettingItem
          title={
            <span className="inline-flex items-center">
              <Trans
                i18nKey="settings.tabs.enableLogs"
                components={{ icon: <LogsIcon className="size-4 mx-1.5 shrink-0" /> }}
              />
            </span>
          }
          divider
        >
          <Switch
            checked={enableLogsTab}
            onCheckedChange={(enable: boolean) => {
              patchAppConfig({ enableLogsTab: enable })
            }}
          />
        </SettingItem>
        <button type="button" className="w-full" onClick={() => navigate('/settings/tabs')}>
          <SettingItem title={t('settings.tabs.moreTabs')}>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </SettingItem>
        </button>
      </SettingCard>
    </>
  )
}

export default TabSwitches
