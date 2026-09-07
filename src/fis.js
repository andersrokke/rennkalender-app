import { supabase } from './supabase'

// Calls the fis-athlete Edge Function, which scrapes the athlete's public FIS
// biography and upserts fis_athletes / fis_points / fis_results.
//
// The function answers 200 even when it fails, with { error } in the body, so
// a failed lookup shows up as data.error rather than as a transport error.
// Resolves either { athlete } or { error } and never throws.
export async function fetchFromFis(code) {
  const fiscode = String(code || '').trim()
  if (!fiscode) return { error: 'no code' }
  try {
    const { data, error } = await supabase.functions.invoke('fis-athlete', { body: { fiscode } })
    if (error) return { error: error.message || String(error) }
    if (!data) return { error: 'Tomt svar fra FIS-tjenesten' }
    if (data.error) return { error: data.error }
    return { athlete: data }
  } catch (e) {
    return { error: e?.message || String(e) }
  }
}

// Fire-and-forget refresh used after saving a FIS code or following someone.
// Failures are deliberately swallowed: this only warms the cache, and the
// nightly job will pick it up anyway.
export function fetchFromFisInBackground(code, onDone) {
  fetchFromFis(code).then(res => { try { onDone?.(res) } catch { /* caller gone */ } })
}

// "Fant Lukas Thulin ROEKKE, Ingierkollen Rustad Slalomklubb – 66 punktlister og 50 resultater hentet"
export function fisSummary(a, t) {
  const who = [a.name, a.club].filter(Boolean).join(', ')
  return `${t('fisFound')} ${who || a.fis_code} – ${a.lists || 0} ${t('fisLists')} ${t('and')} ${a.results || 0} ${t('fisResultsFetched')}`
}
