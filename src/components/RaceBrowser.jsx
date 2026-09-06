import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useRaces } from './useRaces'
import Filters, { initialFilter, applyFilter } from './Filters.jsx'
import RaceMap from './RaceMap.jsx'
import RaceList from './RaceList.jsx'
import { kmFromHome, DEFAULT_HOME, nok } from '../travel'
import { useSignups, heatColor, daysUntil } from './useSignups'
import { fmt } from '../util'

// Browse all races. Coaches add/remove races for the team; athletes add/remove races in their own plan.
export default function RaceBrowser({ profile, team, isCoach }) {
  const races = useRaces()
  const [f, setF] = useState(initialFilter)
  const [view, setView] = useState('norden')
  const [focus, setFocus] = useState(null)
  const [teamRaces, setTeamRaces] = useState(new Map())
  const [mine, setMine] = useState(new Map())
  const [heat, setHeat] = useState(false)
  const { byRace, countedAt, max, has } = useSignups()

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

  // "87 påmeldte · +12 siste 7 d · frist 12. jan (4 d)" — deadline turns amber under a week.
  const Signups = ({ r }) => {
    const sg = byRace[r.id]
    if (!sg) return <div className="signup none">Ingen tall ennå</div>
    const dd = daysUntil(r.signup_deadline)
    const soon = dd != null && dd >= 0 && dd <= 7
    return (
      <div className="signup">
        <span className="bar"><i style={{ width: `${Math.round(100 * (sg.participants || 0) / max)}%`, background: heatColor(sg.participants, max) }} /></span>
        <span>{sg.participants} påmeldte{r.max_attendees ? ` av ${r.max_attendees}` : ''}</span>
        {sg.delta_7d != null && <span className={sg.delta_7d < 0 ? 'neg' : ''}>{sg.delta_7d >= 0 ? '+' : ''}{sg.delta_7d} siste 7 d</span>}
        {r.signup_deadline && <span className={soon ? 'soon' : ''}>
          frist {fmt({ start_date: r.signup_deadline, end_date: r.signup_deadline })}{dd != null && dd >= 0 && dd <= 14 ? ` (${dd} d)` : ''}
        </span>}
      </div>
    )
  }
  const rows = applyFilter(races, f)
  return (
    <>
      <Filters f={f} setF={setF} view={view} setView={setView} extra={
        <div className="group"><span>Påmeldte</span>
          <button className={`chip ${heat ? 'on' : ''}`} onClick={() => setHeat(h => !h)}>Heatmap</button>
          <span className="muted src">{has ? `iSonen · oppdatert ${countedAt ? fmt({ start_date: countedAt.slice(0, 10), end_date: countedAt.slice(0, 10) }) : '–'}` : 'ingen data ennå'}</span>
        </div>
      } />
      <div className="split">
        <RaceMap races={rows} focus={focus} view={view} heat={heat} signups={byRace} maxSignups={max} />
        <RaceList races={rows} onSelect={setFocus} active={focus}
          selectedIds={new Set((isCoach ? teamRaces : mine).keys())}
          renderExtra={isCoach ? r => (
            <div className="row">
              {canEditTeam && <button className={`btn small ${teamRaces.has(r.id) ? '' : 'primary'}`} onClick={() => toggleTeam(r)}>
                {teamRaces.has(r.id) ? 'Fjern fra laget' : 'Legg til for laget'}
              </button>}
              <FromHome r={r} />
              <Signups r={r} />
            </div>
          ) : r => (
            <div className="row">
              <button className={`btn small ${mine.has(r.id) ? '' : 'primary'}`} onClick={() => toggleMine(r)}>
                {mine.has(r.id) ? 'Fjern fra min plan' : 'Legg til i min plan'}
              </button>
              {teamRaces.has(r.id) && <span className="tag" style={{ marginLeft: 0, background: '#EEF6EE', color: '#1E5631' }}>På lagets plan</span>}
              <FromHome r={r} />
              <Signups r={r} />
            </div>
          )}
        />
      </div>
    </>
  )
}
