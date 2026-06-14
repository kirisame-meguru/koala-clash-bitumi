import { platform } from '@renderer/utils/init'

// Lightweight translate signature so we don't depend on i18next types here.
export type TFn = (key: string, options?: Record<string, unknown>) => string

export type TrackSection = 'main' | 'tun' | 'sysproxy' | 'dns' | 'sniffer' | 'mihomo'

export type ValueKind = 'bool' | 'string' | 'number' | 'enum' | 'list' | 'numlist' | 'record'

export interface ChangeContext {
  app: AppConfig
  mihomo: Partial<MihomoConfig>
}

export interface TrackedSetting {
  id: string
  section: TrackSection
  route: string
  labelKey: string
  kind: ValueKind
  /** authoritative default value (matches a fresh install / template.ts) */
  default: unknown
  /** read the current raw value from the relevant config store */
  get: (ctx: ChangeContext) => unknown
  /** only evaluate this setting when the predicate passes (e.g. take-over enabled) */
  enabledWhen?: (ctx: ChangeContext) => boolean
  /** value -> i18n key, for enums whose options have localized labels */
  enumLabels?: Record<string, string>
  /** display-only inversion (e.g. "ICMP forwarding" toggle = !disable-icmp-forwarding) */
  invert?: boolean
}

// ---------------------------------------------------------------------------
// Section metadata (label + display order) used by the review page.
// ---------------------------------------------------------------------------
export const SECTION_ORDER: TrackSection[] = ['main', 'tun', 'sysproxy', 'dns', 'sniffer', 'mihomo']

export const SECTION_LABEL_KEYS: Record<TrackSection, string> = {
  main: 'pages.settings.title',
  tun: 'pages.tun.title',
  sysproxy: 'pages.sysproxy.proxyModeTitle',
  dns: 'pages.dns.title',
  sniffer: 'pages.sniffer.title',
  mihomo: 'pages.mihomo.title'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function getAtPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function appGet(path: string) {
  return (ctx: ChangeContext): unknown => getAtPath(ctx.app, path)
}
function mihomoGet(path: string) {
  return (ctx: ChangeContext): unknown => getAtPath(ctx.mihomo, path)
}

const gateControlTun = (ctx: ChangeContext): boolean => !!ctx.app?.controlTun
const gateControlDns = (ctx: ChangeContext): boolean => !!ctx.app?.controlDns
const gateControlSniff = (ctx: ChangeContext): boolean => !!ctx.app?.controlSniff
const gateController = (ctx: ChangeContext): boolean =>
  !!(getAtPath(ctx.mihomo, 'external-controller') as string)
const gateAllowLan = (ctx: ChangeContext): boolean => !!getAtPath(ctx.mihomo, 'allow-lan')

// Normalize a value to a canonical form for equality + display, by kind.
function coerce(kind: ValueKind, v: unknown): unknown {
  switch (kind) {
    case 'bool':
      return !!v
    case 'string':
    case 'enum':
      return v == null ? '' : String(v)
    case 'number':
      return v == null || v === '' ? undefined : Number(v)
    case 'numlist':
      return Array.isArray(v) ? v.map((x) => String(x)) : []
    case 'list':
      return Array.isArray(v) ? v : []
    case 'record':
      return v && typeof v === 'object' ? v : {}
    default:
      return v
  }
}

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The effective current value: missing/undefined means "still at default". */
export function currentValue(setting: TrackedSetting, ctx: ChangeContext): unknown {
  const raw = setting.get(ctx)
  return raw === undefined || raw === null ? setting.default : raw
}

export function isChanged(setting: TrackedSetting, ctx: ChangeContext): boolean {
  if (setting.enabledWhen && !setting.enabledWhen(ctx)) return false
  const cur = coerce(setting.kind, currentValue(setting, ctx))
  const def = coerce(setting.kind, setting.default)
  return !stableEqual(cur, def)
}

export function formatValue(setting: TrackedSetting, value: unknown, t: TFn): string {
  const { kind, invert, enumLabels } = setting
  switch (kind) {
    case 'bool': {
      const b = invert ? !value : !!value
      return t(b ? 'pages.changedSettings.on' : 'pages.changedSettings.off')
    }
    case 'enum': {
      const key = value == null ? '' : String(value)
      if (enumLabels && enumLabels[key]) return t(enumLabels[key])
      return key === '' ? t('pages.changedSettings.empty') : key
    }
    case 'string': {
      const s = value == null ? '' : String(value)
      return s === '' ? t('pages.changedSettings.empty') : s
    }
    case 'number':
      return value == null ? t('pages.changedSettings.empty') : String(value)
    case 'list':
    case 'numlist': {
      const arr = Array.isArray(value) ? value : []
      if (arr.length === 0) return t('pages.changedSettings.empty')
      const shown = arr.slice(0, 3).map((x) => String(x)).join(', ')
      return arr.length > 3 ? `${shown}, …` : shown
    }
    case 'record': {
      const n = value && typeof value === 'object' ? Object.keys(value).length : 0
      return n === 0 ? t('pages.changedSettings.empty') : t('pages.changedSettings.entries', { count: n })
    }
    default:
      return String(value ?? '')
  }
}

// ---------------------------------------------------------------------------
// Platform-specific defaults (mirrored from main/utils/template.ts and the
// per-page default constants — template.ts is authoritative for fresh installs).
// ---------------------------------------------------------------------------
const TUN_ROUTE_EXCLUDE_DEFAULT = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/3',
  '::/127',
  'fc00::/7',
  'fe80::/10',
  'ff00::/8'
]

const DNS_FAKE_IP_FILTER_DEFAULT = [
  '*',
  '+.lan',
  '+.local',
  'time.*.com',
  'ntp.*.com',
  '+.market.xiaomi.com'
]

const SNIFF_SKIP_DST_DEFAULT = [
  '91.105.192.0/23',
  '91.108.4.0/22',
  '91.108.8.0/21',
  '91.108.16.0/21',
  '91.108.56.0/22',
  '95.161.64.0/20',
  '149.154.160.0/20',
  '185.76.151.0/24',
  '2001:67c:4e8::/48',
  '2001:b28:f23c::/47',
  '2001:b28:f23f::/48',
  '2a0a:f280:203::/48'
]

const SYSPROXY_BYPASS_DEFAULT: string[] =
  platform === 'linux'
    ? ['localhost', '.local', '127.0.0.1/8', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '::1']
    : platform === 'darwin'
      ? [
          '127.0.0.1/8',
          '192.168.0.0/16',
          '10.0.0.0/8',
          '172.16.0.0/12',
          'localhost',
          '*.local',
          '*.crashlytics.com',
          '<local>'
        ]
      : [
          'localhost',
          '127.*',
          '192.168.*',
          '10.*',
          '172.16.*',
          '172.17.*',
          '172.18.*',
          '172.19.*',
          '172.20.*',
          '172.21.*',
          '172.22.*',
          '172.23.*',
          '172.24.*',
          '172.25.*',
          '172.26.*',
          '172.27.*',
          '172.28.*',
          '172.29.*',
          '172.30.*',
          '172.31.*',
          '<local>'
        ]

const SYSPROXY_PAC_DEFAULT = `
function FindProxyForURL(url, host) {
  return "PROXY 127.0.0.1:%mixed-port%; SOCKS5 127.0.0.1:%mixed-port%; DIRECT;";
}
`

const PRIORITY_LABELS: Record<string, string> = {
  PRIORITY_HIGHEST: 'settings.advanced.realtime',
  PRIORITY_HIGH: 'settings.advanced.high',
  PRIORITY_ABOVE_NORMAL: 'settings.advanced.aboveNormal',
  PRIORITY_NORMAL: 'settings.advanced.normal',
  PRIORITY_BELOW_NORMAL: 'settings.advanced.belowNormal',
  PRIORITY_LOW: 'settings.advanced.low'
}

// ---------------------------------------------------------------------------
// The registry.
// ---------------------------------------------------------------------------
export const TRACKED_SETTINGS: TrackedSetting[] = [
  // ----- Main settings page -----
  {
    id: 'mainSwitchMode',
    section: 'main',
    route: '/settings',
    labelKey: 'settings.advanced.mainSwitch',
    kind: 'enum',
    default: 'tun',
    get: appGet('mainSwitchMode'),
    enumLabels: {
      tun: 'settings.advanced.mainSwitchTun',
      sysproxy: 'settings.advanced.mainSwitchProxyMode'
    }
  },
  {
    id: 'proxyMode',
    section: 'main',
    route: '/settings',
    labelKey: 'sider.proxyMode',
    kind: 'bool',
    default: false,
    get: appGet('proxyMode')
  },
  {
    id: 'globalModeToggle',
    section: 'main',
    route: '/settings',
    labelKey: 'settings.advanced.globalMode',
    kind: 'bool',
    default: false,
    get: appGet('globalModeToggle')
  },
  {
    id: 'mihomoCpuPriority',
    section: 'main',
    route: '/settings',
    labelKey: 'settings.advanced.corePriority',
    kind: 'enum',
    default: 'PRIORITY_NORMAL',
    get: appGet('mihomoCpuPriority'),
    enumLabels: PRIORITY_LABELS
  },
  {
    id: 'controlDns',
    section: 'main',
    route: '/settings',
    labelKey: 'settings.advanced.takeOverDNS',
    kind: 'bool',
    default: false,
    get: appGet('controlDns')
  },
  {
    id: 'controlSniff',
    section: 'main',
    route: '/settings',
    labelKey: 'settings.advanced.takeOverSniffer',
    kind: 'bool',
    default: false,
    get: appGet('controlSniff')
  },
  {
    id: 'networkDetection',
    section: 'main',
    route: '/settings',
    labelKey: 'settings.advanced.stopCoreOnDisconnect',
    kind: 'bool',
    default: false,
    get: appGet('networkDetection')
  },
  {
    id: 'pauseSSID',
    section: 'main',
    route: '/settings',
    labelKey: 'settings.advanced.directOnSpecificWifi',
    kind: 'list',
    default: [],
    get: appGet('pauseSSID')
  },

  // ----- Virtual interface (TUN) -----
  {
    id: 'controlTun',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.takeOverTun',
    kind: 'bool',
    default: false,
    get: appGet('controlTun')
  },
  {
    id: 'tun.stack',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.tunModeStack',
    kind: 'enum',
    default: 'mixed',
    get: mihomoGet('tun.stack'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.device',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.tunCardName',
    kind: 'string',
    default: platform === 'darwin' ? '' : 'mihomo',
    get: mihomoGet('tun.device'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.strict-route',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.strictRoute',
    kind: 'bool',
    default: false,
    get: mihomoGet('tun.strict-route'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.auto-route',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.autoSetRouteRules',
    kind: 'bool',
    default: true,
    get: mihomoGet('tun.auto-route'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.auto-redirect',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.autoSetTCPRedirect',
    kind: 'bool',
    default: false,
    get: mihomoGet('tun.auto-redirect'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.auto-detect-interface',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.autoSelectTrafficExit',
    kind: 'bool',
    default: true,
    get: mihomoGet('tun.auto-detect-interface'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.disable-icmp-forwarding',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.icmpForwarding',
    kind: 'bool',
    default: false,
    invert: true,
    get: mihomoGet('tun.disable-icmp-forwarding'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.mtu',
    section: 'tun',
    route: '/tun',
    labelKey: 'MTU',
    kind: 'number',
    default: 1500,
    get: mihomoGet('tun.mtu'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.dns-hijack',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.dnsHijack',
    kind: 'list',
    default: ['any:53'],
    get: mihomoGet('tun.dns-hijack'),
    enabledWhen: gateControlTun
  },
  {
    id: 'tun.route-exclude-address',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.excludeCustomNetworks',
    kind: 'list',
    default: TUN_ROUTE_EXCLUDE_DEFAULT,
    get: mihomoGet('tun.route-exclude-address'),
    enabledWhen: gateControlTun
  },
  {
    id: 'autoSetDNSMode',
    section: 'tun',
    route: '/tun',
    labelKey: 'pages.tun.autoSetSystemDNS',
    kind: 'enum',
    default: 'exec',
    get: appGet('autoSetDNSMode'),
    enabledWhen: () => platform === 'darwin',
    enumLabels: {
      none: 'pages.tun.noAutoSet',
      exec: 'pages.tun.execCommand',
      service: 'pages.tun.serviceMode'
    }
  },

  // ----- Proxy mode (system proxy) -----
  {
    id: 'sysProxy.enable',
    section: 'sysproxy',
    route: '/sysproxy',
    labelKey: 'pages.sysproxy.systemProxyToggle',
    kind: 'bool',
    default: true,
    get: appGet('sysProxy.enable')
  },
  {
    id: 'sysProxy.host',
    section: 'sysproxy',
    route: '/sysproxy',
    labelKey: 'pages.sysproxy.proxyHost',
    kind: 'string',
    default: '',
    get: appGet('sysProxy.host')
  },
  {
    id: 'sysProxy.mode',
    section: 'sysproxy',
    route: '/sysproxy',
    labelKey: 'pages.sysproxy.proxyMode',
    kind: 'enum',
    default: 'manual',
    get: appGet('sysProxy.mode'),
    enumLabels: { manual: 'pages.sysproxy.manual', auto: 'pages.sysproxy.auto' }
  },
  {
    id: 'sysProxy.bypass',
    section: 'sysproxy',
    route: '/sysproxy',
    labelKey: 'pages.sysproxy.proxyBypassList',
    kind: 'list',
    default: SYSPROXY_BYPASS_DEFAULT,
    get: appGet('sysProxy.bypass')
  },
  {
    id: 'sysProxy.pacScript',
    section: 'sysproxy',
    route: '/sysproxy',
    labelKey: 'pages.sysproxy.editPACScript',
    kind: 'string',
    default: SYSPROXY_PAC_DEFAULT,
    get: appGet('sysProxy.pacScript')
  },
  {
    id: 'sysProxy.settingMode',
    section: 'sysproxy',
    route: '/sysproxy',
    labelKey: 'pages.sysproxy.settingMethod',
    kind: 'enum',
    default: 'exec',
    get: appGet('sysProxy.settingMode'),
    enabledWhen: () => platform === 'darwin',
    enumLabels: { exec: 'pages.sysproxy.execCommand', service: 'pages.sysproxy.serviceMode' }
  },
  {
    id: 'onlyActiveDevice',
    section: 'sysproxy',
    route: '/sysproxy',
    labelKey: 'pages.sysproxy.onlyActiveInterface',
    kind: 'bool',
    default: false,
    get: appGet('onlyActiveDevice'),
    enabledWhen: () => platform === 'darwin'
  },

  // ----- DNS -----
  {
    id: 'dns.ipv6',
    section: 'dns',
    route: '/dns',
    labelKey: 'pages.dns.ipv6',
    kind: 'bool',
    default: true,
    get: mihomoGet('dns.ipv6'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.enhanced-mode',
    section: 'dns',
    route: '/dns',
    labelKey: 'pages.dns.domainMappingMode',
    kind: 'enum',
    default: 'fake-ip',
    get: mihomoGet('dns.enhanced-mode'),
    enabledWhen: gateControlDns,
    enumLabels: {
      'fake-ip': 'pages.dns.fakeIP',
      'redir-host': 'pages.dns.realIP',
      normal: 'pages.dns.cancelMapping'
    }
  },
  {
    id: 'dns.fake-ip-range',
    section: 'dns',
    route: '/dns',
    labelKey: 'pages.dns.fakeIPRangeIPv4',
    kind: 'string',
    default: '198.18.0.1/16',
    get: mihomoGet('dns.fake-ip-range'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.fake-ip-range6',
    section: 'dns',
    route: '/dns',
    labelKey: 'pages.dns.fakeIPRangeIPv6',
    kind: 'string',
    default: '',
    get: mihomoGet('dns.fake-ip-range6'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.fake-ip-filter',
    section: 'dns',
    route: '/dns',
    labelKey: 'pages.dns.fakeIPFilter',
    kind: 'list',
    default: DNS_FAKE_IP_FILTER_DEFAULT,
    get: mihomoGet('dns.fake-ip-filter'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.default-nameserver',
    section: 'dns',
    route: '/dns',
    labelKey: 'pages.dns.baseServer',
    kind: 'list',
    default: ['tls://1.1.1.1'],
    get: mihomoGet('dns.default-nameserver'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.nameserver',
    section: 'dns',
    route: '/dns',
    labelKey: 'pages.dns.defaultResolver',
    kind: 'list',
    default: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
    get: mihomoGet('dns.nameserver'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.respect-rules',
    section: 'dns',
    route: '/dns',
    labelKey: 'dns.connectionRespectRules',
    kind: 'bool',
    default: false,
    get: mihomoGet('dns.respect-rules'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.direct-nameserver',
    section: 'dns',
    route: '/dns',
    labelKey: 'dns.directResolver',
    kind: 'list',
    default: [],
    get: mihomoGet('dns.direct-nameserver'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.proxy-server-nameserver',
    section: 'dns',
    route: '/dns',
    labelKey: 'dns.proxyNodeResolver',
    kind: 'list',
    default: [],
    get: mihomoGet('dns.proxy-server-nameserver'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.nameserver-policy',
    section: 'dns',
    route: '/dns',
    labelKey: 'dns.domainResolutionPolicy',
    kind: 'record',
    default: {},
    get: mihomoGet('dns.nameserver-policy'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.use-system-hosts',
    section: 'dns',
    route: '/dns',
    labelKey: 'dns.useSystemHosts',
    kind: 'bool',
    default: false,
    get: mihomoGet('dns.use-system-hosts'),
    enabledWhen: gateControlDns
  },
  {
    id: 'dns.use-hosts',
    section: 'dns',
    route: '/dns',
    labelKey: 'dns.customHosts',
    kind: 'bool',
    default: false,
    get: mihomoGet('dns.use-hosts'),
    enabledWhen: gateControlDns
  },
  {
    id: 'hosts',
    section: 'dns',
    route: '/dns',
    labelKey: 'dns.customHosts',
    kind: 'list',
    default: [],
    get: appGet('hosts'),
    enabledWhen: (ctx) => gateControlDns(ctx) && !!getAtPath(ctx.mihomo, 'dns.use-hosts')
  },

  // ----- Sniffer -----
  {
    id: 'sniffer.override-destination',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.overrideConnectionAddress',
    kind: 'bool',
    default: false,
    get: mihomoGet('sniffer.override-destination'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.force-dns-mapping',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.sniffRealIPMapping',
    kind: 'bool',
    default: true,
    get: mihomoGet('sniffer.force-dns-mapping'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.parse-pure-ip',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.sniffUnmappedIP',
    kind: 'bool',
    default: true,
    get: mihomoGet('sniffer.parse-pure-ip'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.sniff.HTTP.ports',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.httpPortSniffer',
    kind: 'numlist',
    default: [80, 443],
    get: mihomoGet('sniffer.sniff.HTTP.ports'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.sniff.TLS.ports',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.tlsPortSniffer',
    kind: 'numlist',
    default: [443],
    get: mihomoGet('sniffer.sniff.TLS.ports'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.sniff.QUIC.ports',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.quicPortSniffer',
    kind: 'numlist',
    default: [],
    get: mihomoGet('sniffer.sniff.QUIC.ports'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.skip-domain',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.skipDomainSniffing',
    kind: 'list',
    default: ['+.push.apple.com'],
    get: mihomoGet('sniffer.skip-domain'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.force-domain',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.forceDomainSniffing',
    kind: 'list',
    default: [],
    get: mihomoGet('sniffer.force-domain'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.skip-dst-address',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.skipDestAddressSniffing',
    kind: 'list',
    default: SNIFF_SKIP_DST_DEFAULT,
    get: mihomoGet('sniffer.skip-dst-address'),
    enabledWhen: gateControlSniff
  },
  {
    id: 'sniffer.skip-src-address',
    section: 'sniffer',
    route: '/sniffer',
    labelKey: 'pages.sniffer.skipSourceAddressSniffing',
    kind: 'list',
    default: [],
    get: mihomoGet('sniffer.skip-src-address'),
    enabledWhen: gateControlSniff
  },

  // ----- Mihomo core -----
  {
    id: 'core',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'pages.mihomo.coreVersion',
    kind: 'enum',
    default: 'mihomo',
    get: appGet('core'),
    enumLabels: {
      mihomo: 'pages.mihomo.builtinStable',
      'mihomo-alpha': 'pages.mihomo.builtinPreview',
      system: 'pages.mihomo.useSystemCore'
    }
  },
  {
    id: 'corePermissionMode',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'pages.mihomo.runningMode',
    kind: 'enum',
    default: 'elevated',
    get: appGet('corePermissionMode'),
    enumLabels: {
      elevated: 'pages.mihomo.authorizedRun',
      service: 'pages.mihomo.systemService'
    }
  },
  {
    id: 'ipv6',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'IPv6',
    kind: 'bool',
    default: false,
    get: mihomoGet('ipv6')
  },
  {
    id: 'maxLogDays',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'pages.mihomo.logRetentionDays',
    kind: 'number',
    default: 7,
    get: appGet('maxLogDays')
  },
  {
    id: 'log-level',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'pages.mihomo.logLevel',
    kind: 'enum',
    default: 'info',
    get: mihomoGet('log-level'),
    enumLabels: {
      silent: 'pages.mihomo.silent',
      error: 'pages.mihomo.error',
      warning: 'pages.mihomo.warning',
      info: 'pages.mihomo.info',
      debug: 'pages.mihomo.debug'
    }
  },

  // ----- Mihomo: ports -----
  {
    id: 'mixed-port',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.mixedPort',
    kind: 'number',
    default: 7897,
    get: mihomoGet('mixed-port')
  },
  {
    id: 'socks-port',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.socksPort',
    kind: 'number',
    default: 0,
    get: mihomoGet('socks-port')
  },
  {
    id: 'port',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.httpPort',
    kind: 'number',
    default: 0,
    get: mihomoGet('port')
  },
  {
    id: 'redir-port',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.redirPort',
    kind: 'number',
    default: 0,
    get: mihomoGet('redir-port'),
    enabledWhen: () => platform !== 'win32'
  },
  {
    id: 'tproxy-port',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.tproxyPort',
    kind: 'number',
    default: 0,
    get: mihomoGet('tproxy-port'),
    enabledWhen: () => platform === 'linux'
  },
  {
    id: 'allow-lan',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.allowLan',
    kind: 'bool',
    default: false,
    get: mihomoGet('allow-lan')
  },
  {
    id: 'lan-allowed-ips',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.allowedIpRanges',
    kind: 'list',
    default: ['0.0.0.0/0', '::/0'],
    get: mihomoGet('lan-allowed-ips'),
    enabledWhen: gateAllowLan
  },
  {
    id: 'lan-disallowed-ips',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.deniedIpRanges',
    kind: 'list',
    default: [],
    get: mihomoGet('lan-disallowed-ips'),
    enabledWhen: gateAllowLan
  },
  {
    id: 'authentication',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.authentication',
    kind: 'list',
    default: [],
    get: mihomoGet('authentication')
  },
  {
    id: 'skip-auth-prefixes',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.portSettings.skipAuthIpRanges',
    kind: 'list',
    default: ['127.0.0.1/32'],
    get: mihomoGet('skip-auth-prefixes')
  },

  // ----- Mihomo: external controller -----
  {
    id: 'external-controller',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.controllerSettings.listenAddress',
    kind: 'string',
    default: '',
    get: mihomoGet('external-controller')
  },
  {
    id: 'secret',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.controllerSettings.accessSecret',
    kind: 'string',
    default: '',
    get: mihomoGet('secret'),
    enabledWhen: gateController
  },
  {
    id: 'external-ui',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.controllerSettings.enableControllerPanel',
    kind: 'bool',
    default: false,
    get: (ctx) => getAtPath(ctx.mihomo, 'external-ui') === 'ui',
    enabledWhen: gateController
  },
  {
    id: 'external-ui-url',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.controllerSettings.controllerPanel',
    kind: 'string',
    default: 'https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip',
    get: mihomoGet('external-ui-url'),
    enabledWhen: (ctx) => gateController(ctx) && getAtPath(ctx.mihomo, 'external-ui') === 'ui'
  },
  {
    id: 'external-controller-cors.allow-private-network',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.controllerSettings.allowPrivateNetwork',
    kind: 'bool',
    default: false,
    get: mihomoGet('external-controller-cors.allow-private-network'),
    enabledWhen: gateController
  },
  {
    id: 'external-controller-cors.allow-origins',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.controllerSettings.allowedOrigins',
    kind: 'list',
    default: ['https://metacubex.github.io', 'https://board.zash.run.place'],
    get: mihomoGet('external-controller-cors.allow-origins'),
    enabledWhen: gateController
  },

  // ----- Mihomo: environment -----
  {
    id: 'disableSystemCA',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.envSettings.disableSystemCA',
    kind: 'bool',
    default: false,
    get: appGet('disableSystemCA')
  },
  {
    id: 'disableEmbedCA',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.envSettings.disableBuiltinCA',
    kind: 'bool',
    default: false,
    get: appGet('disableEmbedCA')
  },
  {
    id: 'disableLoopbackDetector',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.envSettings.disableLoopbackDetection',
    kind: 'bool',
    default: false,
    get: appGet('disableLoopbackDetector')
  },
  {
    id: 'disableNftables',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.envSettings.disableNftables',
    kind: 'bool',
    default: false,
    get: appGet('disableNftables'),
    enabledWhen: () => platform === 'linux'
  },
  {
    id: 'safePaths',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.envSettings.trustedPath',
    kind: 'list',
    default: [],
    get: appGet('safePaths')
  },

  // ----- Mihomo: advanced -----
  {
    id: 'find-process-mode',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.findProcess',
    kind: 'enum',
    default: 'always',
    get: mihomoGet('find-process-mode'),
    enumLabels: {
      strict: 'mihomo.advancedSettings.auto',
      off: 'common.close',
      always: 'mihomo.advancedSettings.enable'
    }
  },
  {
    id: 'profile.store-selected',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.storeSelected',
    kind: 'bool',
    default: true,
    get: mihomoGet('profile.store-selected')
  },
  {
    id: 'profile.store-fake-ip',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.storeFakeIP',
    kind: 'bool',
    default: true,
    get: mihomoGet('profile.store-fake-ip')
  },
  {
    id: 'unified-delay',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.unifiedDelay',
    kind: 'bool',
    default: false,
    get: mihomoGet('unified-delay')
  },
  {
    id: 'tcp-concurrent',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.tcpConcurrent',
    kind: 'bool',
    default: false,
    get: mihomoGet('tcp-concurrent')
  },
  {
    id: 'disable-keep-alive',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.disableTCPKeepAlive',
    kind: 'bool',
    default: false,
    get: mihomoGet('disable-keep-alive')
  },
  {
    id: 'keep-alive-interval',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.tcpKeepAliveInterval',
    kind: 'number',
    default: 0,
    get: mihomoGet('keep-alive-interval')
  },
  {
    id: 'keep-alive-idle',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.tcpKeepAliveIdle',
    kind: 'number',
    default: 0,
    get: mihomoGet('keep-alive-idle')
  },
  {
    id: 'global-client-fingerprint',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.utlsFingerprint',
    kind: 'string',
    default: '',
    get: mihomoGet('global-client-fingerprint')
  },
  {
    id: 'interface-name',
    section: 'mihomo',
    route: '/mihomo',
    labelKey: 'mihomo.advancedSettings.outboundInterface',
    kind: 'string',
    default: '',
    get: mihomoGet('interface-name')
  }
]

export const TRACKED_BY_ID: Record<string, TrackedSetting> = Object.fromEntries(
  TRACKED_SETTINGS.map((s) => [s.id, s])
)

// ---------------------------------------------------------------------------
// Accordion ("card") membership. Some tracked settings live inside collapsible
// SettingCards. When deep-linking from the review page we must expand the right
// card so the setting is visible. `CARD_OF_SETTING[id]` -> the card id; the host
// component compares it against `useFocusedCard()` to decide `defaultOpen`.
// Settings not listed here live in always-visible (plain) cards.
// ---------------------------------------------------------------------------
export type SettingCardId =
  | 'settings-advanced'
  | 'mihomo-ports'
  | 'mihomo-controller'
  | 'mihomo-env'
  | 'mihomo-advanced'
  | 'dns-advanced'

const CARD_MEMBERS: Record<SettingCardId, string[]> = {
  'settings-advanced': [
    'mihomoCpuPriority',
    'controlDns',
    'controlSniff',
    'networkDetection',
    'pauseSSID'
  ],
  'mihomo-ports': [
    'mixed-port',
    'socks-port',
    'port',
    'redir-port',
    'tproxy-port',
    'allow-lan',
    'lan-allowed-ips',
    'lan-disallowed-ips',
    'authentication',
    'skip-auth-prefixes'
  ],
  'mihomo-controller': [
    'external-controller',
    'secret',
    'external-ui',
    'external-ui-url',
    'external-controller-cors.allow-private-network',
    'external-controller-cors.allow-origins'
  ],
  'mihomo-env': [
    'disableSystemCA',
    'disableEmbedCA',
    'disableLoopbackDetector',
    'disableNftables',
    'safePaths'
  ],
  'mihomo-advanced': [
    'find-process-mode',
    'profile.store-selected',
    'profile.store-fake-ip',
    'unified-delay',
    'tcp-concurrent',
    'disable-keep-alive',
    'keep-alive-interval',
    'keep-alive-idle',
    'global-client-fingerprint',
    'interface-name'
  ],
  'dns-advanced': [
    'dns.respect-rules',
    'dns.direct-nameserver',
    'dns.proxy-server-nameserver',
    'dns.nameserver-policy',
    'dns.use-system-hosts',
    'dns.use-hosts',
    'hosts'
  ]
}

export const CARD_OF_SETTING: Record<string, SettingCardId> = Object.fromEntries(
  Object.entries(CARD_MEMBERS).flatMap(([card, ids]) =>
    ids.map((id) => [id, card as SettingCardId])
  )
)
