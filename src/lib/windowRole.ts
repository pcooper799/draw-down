export type WindowRole = 'combined' | 'stage' | 'operator'

/** Which UI this renderer should show (?window=stage|operator, default combined). */
export function getWindowRole(): WindowRole {
  if (typeof window === 'undefined') return 'combined'
  const raw = new URLSearchParams(window.location.search).get('window')
  if (raw === 'stage' || raw === 'operator') return raw
  return 'combined'
}

export function urlForRole(role: WindowRole) {
  const url = new URL(window.location.href)
  if (role === 'combined') url.searchParams.delete('window')
  else url.searchParams.set('window', role)
  return url.toString()
}
