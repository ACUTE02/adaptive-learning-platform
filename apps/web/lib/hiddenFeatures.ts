// Inherited LearnHouse features that this fork cannot run.
//
// The fork deleted LearnHouse's course modules (courses, chapters, activities,
// certifications, collections), but parts of the backend that these features
// depend on still reference them and fail with a NameError at runtime
// (see docs: production audit, KNOWN_ISSUES). They are hidden from the UI so
// nobody lands on a page that crashes. Remove an entry here once its backend
// has been repaired.
//
// The adaptive learning features (Campaign Mode, Assignments, Analytics,
// the AI tutor) do not depend on any of these.
export const HIDDEN_FEATURES = [
  'communities',
  'podcasts',
  'playgrounds',
  'payments',
  'collections',
] as const

export function isFeatureHidden(feature: string): boolean {
  return (HIDDEN_FEATURES as readonly string[]).includes(feature)
}

// Dashboard and public URL prefixes that belong to hidden features, plus the
// organization "Usage" settings page, whose backend endpoint also fails.
// Used by the middleware to send direct visits back to the dashboard.
export const HIDDEN_ROUTE_PREFIXES = [
  '/dash/communities',
  '/dash/podcasts',
  '/dash/playgrounds',
  '/dash/payments',
  '/dash/org/settings/usage',
  '/communities',
  '/community',
  '/podcasts',
  '/podcast',
  '/playgrounds',
  '/playground',
  '/collections',
  '/collection',
] as const

export function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}
