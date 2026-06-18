import { getAppConfig } from '../config'
import { version } from '../../../package.json'
import { userAgentProduct } from '../../shared/branding'

export async function getUserAgent(): Promise<string> {
  const { userAgent } = await getAppConfig()
  if (userAgent) {
    return userAgent
  }

  // Subscription gateways often choose the output format from the client User-Agent.
  return `${userAgentProduct}/${version}`
}
