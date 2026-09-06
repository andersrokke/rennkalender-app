import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useRaces } from './useRaces'
import Filters, { initialFilter, applyFilter } from './Filters.jsx'
import RaceMap from './RaceMap.jsx'
import RaceList from './RaceList.jsx'
import { kmFromHome, DEFAULT_HOME, nok } from '../travel'

// Browse all races. Coaches add/remove races for the team; athletes add/remove races in their own plan.
export default function RaceBrowser({ profile, team, isCoach }) {
  const races = useRaces()
  const [f, setF] = useState(initialFilter)
  const [view, setView] = useState('norden')
  const [focus, setFocus] = useState(null)
  const [teamRaces, setTeamRaces] = useState(new Map())
  const [mine, setMine] = useState(new Map())

  const load = async () => {
    const [tr, ar] = await Promise.all([
      team ? supabase.from('team_races').select('id, race_id').eq('team_id', team.id) : Promise.resolve({ data: [] }),
      isCoach ? Promise.resolve({ data: [] }) : supabase.from('athlete_races').select('id, race_id').eq('athlete_id', profile.id)
    ])
    setTeamRaces(new Map((tr.data || []).map(t => [t.race_id, t.id])))
    setMine(new Map((ar.data || []).map(a => [a.race_id, a.id])))
  }
  useEffect(() => { load() }, [team?.id, isCoach, profile.id])

  async function toggleTeam(r) {
    if (teamRaces.has(r.id)) await supabase.from('team_races').delete().eq('id', teamRaces.get(r.id))
    else await supabase.from('team_races').insert({ team_id: team.id, race_id: r.id })
    load()
  }

  async function toggleMine(r) {
    if (mine.has(r.id)) await supabase.from('athlete_races').delete().eq('id', mine.get(r.id))
    else await supabase.from('athlete_races').upsert({
      athlete_id: profile.id, race_id: r.id, team_id: team?.id ?? null,
      status: team ? 'wish' : 'planned', updated_at: new Date().toISOString()
    }, { onConflict: 'athlete_id,race_id' })
    load()
  }

  // A coach without a team can browse, but has no team plan to add races to.
  const canEditTeam = isCoach && !!team
  const home = profile.home_city || DEFAULT_HOME
  const FromHome = ({ r }) => {
    const km = kmFromHome(r, home)
    return km == null ? null : <span className="muted">{nok(km)} km fra hjem</span>
  }
  const rows = applyFilter(races, f)
  return (
    <>
      <Filters f={f} setF={setF} view={view} setView={setView} />
      <div className="split">
        <RaceMap races={rows} focus={focus} view={view} />
        <RaceList races={rows} onSelect={setFocus} active={focus}
          selectedIds={new Set((isCoach ? teamRaces : mine).keys())}
          renderExtra={isCoach ? r => (
            <div className="row">
              {canEditTeam && <button className={`btn small ${teamRaces.has(r.id) ? '' : 'primary'}`} onClick={() => toggleTeam(r)}>
                {teamRaces.has(r.id) ? 'Fjern fra laget' : 'Legg til for laget'}
              </button>}
              <FromHome r={r} />
            </div>
          ) : r => (
            <div className="row">
              <button className={`btn small ${mine.has(r.id) ? '' : 'primary'}`} onClick={() => toggleMine(r)}>
                {mine.has(r.id) ? 'Fjern fra min plan' : 'Legg til i min plan'}
              </button>
              {teamRaces.has(r.id) && <span className="tag" style={{ marginLeft: 0, background: '#EEF6EE', color: '#1E5631' }}>På lagets plan</span>}
              <FromHome r={r} />
            </div>
          )}
        />
      </div>
    </>
  )
}
