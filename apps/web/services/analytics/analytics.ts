import { getAPIUrl } from '@services/config/config'

// lgtm[js/hardcoded-credentials] -- not a secret, just a sessionStorage key name
const SESSION_KEY = 'lh_analytics_session_id'

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export async function trackEvent(
  eventName: string,
  orgId: number,
  properties: Record<string, unknown>,
  accessToken: string
): Promise<void> {
  try {
    const url = `${getAPIUrl()}analytics/events`
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        event_name: eventName,
        org_id: orgId,
        session_id: getSessionId(),
        properties,
      }),
      keepalive: true,
    })
  } catch {
    // Silently swallow — analytics should never break the app
  }
}

export async function getAnalyticsOverview(accessToken: string, campaignId?: number): Promise<any> {
  let url = `${getAPIUrl()}analytics/overview`
  if (campaignId) {
    url += `?campaign_id=${campaignId}`
  }
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error('Failed to fetch analytics overview')
  return res.json()
}

export async function getChartData(accessToken: string): Promise<any> {
  const url = `${getAPIUrl()}analytics/chart-data`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error('Failed to fetch chart data')
  return res.json()
}
