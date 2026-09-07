import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Cup names in Norwegian. The RPC returns the FIS codes.
export const CUP_NAME = {
  WC: 'Verdenscup', EC: 'Europacup', ANC: 'Australia New Zealand Cup',
  NAC: 'Nor-Am Cup', FEC: 'Far East Cup', SAC: 'Sør-Amerika Cup'
}
export const cupName = c => CUP_NAME[c] || c

// Standings for the athlete and everyone they follow, refreshed by cron each
// morning — there is nothing to fetch on demand here.
// Rows come back ordered with discipline 'ALL' (the overall standing) first.
export function useCupStandings() {
  const [byCode, setByCode] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('my_cup_standings').then(({ data }) => {
      if (cancelled) return
      setByCode(groupStandings(data || []))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  return { byCode, loading }
}

// fis_code -> [{ cup, season, name, overall, disciplines[], updated }]
export function groupStandings(rows) {
  const out = {}
  rows.forEach(r => {
    const list = out[r.fis_code] || (out[r.fis_code] = [])
    let g = list.find(x => x.cup === r.cup && x.season === r.season)
    if (!g) { g = { cup: r.cup, season: r.season, name: r.name, overall: null, disciplines: [], updated: null }; list.push(g) }
    if (r.discipline === 'ALL') g.overall = r
    else g.disciplines.push(r)
    if (!g.updated || (r.updated && r.updated > g.updated)) g.updated = r.updated
  })
  return out
}
