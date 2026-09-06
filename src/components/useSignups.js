import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Sign-up counts from the race_signup_latest view (fed from iSonen).
// The view is empty until the races appear in iSonen, so every consumer
// has to cope with "no numbers yet".
export function useSignups() {
  const [byRace, setByRace] = useState({})
  const [countedAt, setCountedAt] = useState(null)

  useEffect(() => {
    supabase.from('race_signup_latest').select('race_id, participants, counted_at, participants_7d, delta_7d')
      .then(({ data }) => {
        const m = {}
        let latest = null
        ;(data || []).forEach(r => {
          m[r.race_id] = r
          if (r.counted_at && (!latest || r.counted_at > latest)) latest = r.counted_at
        })
        setByRace(m); setCountedAt(latest)
      })
  }, [])

  const values = Object.values(byRace).map(s => s.participants || 0)
  const max = Math.max(1, ...values)
  return { byRace, countedAt, max, has: values.length > 0 }
}

// Blue -> yellow -> orange -> red, scaled against the busiest race.
const STOPS = [[125, 166, 255], [247, 227, 107], [255, 140, 66], [255, 59, 92]]
export function heatColor(n, max) {
  const t = Math.min(1, (n || 0) / Math.max(1, max))
  const i = Math.min(2, Math.floor(t * 3)), f = t * 3 - i
  const a = STOPS[i], b = STOPS[i + 1]
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`
}

export const daysUntil = d => d ? Math.round((new Date(d) - new Date()) / 864e5) : null
