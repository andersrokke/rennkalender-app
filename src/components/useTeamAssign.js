import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

// team_race_athletes() gives one row per race x athlete for the coach's team,
// with the athlete's own status, whether the coach has assigned the race, and
// enough data (year, gender, FIS points) to drive the quick filters.
export function useTeamAssign(teamId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('team_race_athletes')
    setRows(data || []); setLoading(false)
  }, [teamId])
  useEffect(() => { load() }, [load])

  const byRace = {}
  const byAthlete = {}
  rows.forEach(r => {
    ;(byRace[r.race_id] = byRace[r.race_id] || []).push(r)
    ;(byAthlete[r.athlete_id] = byAthlete[r.athlete_id] || []).push(r)
  })

  // assign_race keeps 'unavailable' as it is, so a coach can never overwrite
  // an athlete who has said they cannot go.
  async function apply(raceId, add, remove) {
    if (add.length) await supabase.rpc('assign_race', { p_race_id: raceId, p_athletes: add })
    if (remove.length) await supabase.rpc('unassign_race', { p_race_id: raceId, p_athletes: remove })
    await load()
  }

  return { rows, byRace, byAthlete, loading, apply, reload: load }
}

// A chip is coloured by the athlete's own status, never by whether the coach
// has assigned the race. Assignment is a separate marker on the chip.
export function chipState(r) {
  if (!r || r.status == null) return 'none'
  return r.status          // wish | planned | entered | unavailable
}
// The coach's proposal alone is not an answer: a row created by assign_race
// sits at 'planned' with assigned = true until the athlete says something.
export const hasAnswered = r => !!r && r.status != null && !(r.assigned && r.status === 'planned')
// Who is actually going, however that came about.
export const GOING = ['planned', 'entered', 'wish']
export const isGoing = r => !!r && GOING.includes(r.status)

// Quick filters, built from the data the RPC returns. Only offered when they
// actually match somebody.
export function quickFilters(rows, t) {
  const out = [
    { key: 'born2008', label: t('fBorn2008'), test: r => r.birth_year != null && r.birth_year >= 2008 },
    { key: 'born2007', label: t('fBorn2007'), test: r => r.birth_year != null && r.birth_year <= 2007 },
    { key: 'gs60', label: t('fGsUnder60'), test: r => r.gs != null && Number(r.gs) < 60 },
    { key: 'sl60', label: t('fSlUnder60'), test: r => r.sl != null && Number(r.sl) < 60 },
    { key: 'women', label: t('fWomen'), test: r => r.gender === 'W' },
    { key: 'men', label: t('fMen'), test: r => r.gender === 'M' }
  ]
  return out.filter(f => {
    const n = rows.filter(f.test).length
    return n > 0 && n < rows.length      // useless if it picks everyone or no one
  })
}
