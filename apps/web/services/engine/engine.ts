// Client for the adaptive engine API (/api/v1/engine/*).
//
// The server identifies the student from the session; never send a user id.
// Requests go through the same-origin Next.js proxy, so the session cookie is
// included, and the bearer token is added when the client has one.

export function engineFetch(
  path: string,
  accessToken?: string | null,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`/api/v1/engine/${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
}

// Turns a failed engine response into a message that can be shown to the student.
export async function engineErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  if (res.status === 401) return 'Your session has expired. Please sign in again.'
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail) && typeof data.detail[0]?.msg === 'string') {
      return data.detail[0].msg
    }
  } catch {
    // body was not JSON
  }
  return fallback
}
