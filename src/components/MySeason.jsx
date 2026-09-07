import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import RaceMap from './RaceMap.jsx'
import RaceList from './RaceList.jsx'
import TripPlan from './TripPlan.jsx'
import { STATUS_COLOR } from '../util'
import { useT } from '../i18n'

// The athlete's whole season in one place: races the coach put on the team
// plan and races the athlete added themselves, in one list by date, with the
// travel and cost for all of them underneath.
// The athlete answers wish / planned / unavailable; 'entered' is set by the
// coach and only shown as a badge.
const CHOICES = ['wish', 'planned', 'unavailable']

export default function MySeason({ profile, team, readOnly = false }) {
  const t = useT()
  const [mine, setMine] = useState([])
  const [teamRows, setTeamRows] = useState([])
  const [focus, setFocus] = useState(null)
  const [noteFor, setNoteFor] = useState(null)
  const [routes, setRoutes] = useState([])
  const [homePt, setHomePt] = useState(null)

  async function load() {
    const [{ data: own }, { data: tr }] = await Promise.all([
      supabase.from('athlete_races').select('*, race:races(*, venue:venues(*))').eq('athlete_id', profile.id),
      team
        ? supabase.from('team_races').select('*, race:races(*, venue:venues(*))').eq('team_id', team.id)
        : Promise.resolve({ data: [] })
    ])
    setMine((own || []).filter(a => a.race))
    setTeamRows((tr || []).filter(x => x.race))
  }
  useEffect(() => { load() }, [profile.id, team?.id])

  // One row per race: the coach's races first, then the athlete's own, merged
  // so a race on both sides appears once.
  const merged = useMemo(() => {
    const m = new Map()
    teamRows.forEach(tr => m.set(tr.race.id, { race: tr.race, tr, fromTeam: true }))
    mine.forEach(a => {
      const ex = m.get(a.race.id)
      if (ex) ex.mine = a
      else m.set(a.race.id, { race: a.race, mine: a, fromTeam: false })
    })
    return [...m.values()].sort((x, y) => x.race.start_date.localeCompare(y.race.start_date))
  }, [mine, teamRows])

  const byId = useMemo(() => Object.fromEntries(merged.map(x => [x.race.id, x])), [merged])
  const races = merged.map(x => x.race)
  // Everything you have not ruled out costs money to plan for — a race you
  // wish for is planned for just like one you have committed to.
  const planned = merged.filter(x => x.mine?.status !== 'unavailable').map(x => x.race)

  const counts = {
    total: merged.length,
    wish: merged.filter(x => x.mine?.status === 'wish').length,
    entered: merged.filter(x => x.mine?.status === 'entered').length
  }

  async function setStatus(rid, status) {
    await supabase.from('athlete_races').upsert(
      { athlete_id: profile.id, race_id: rid, team_id: team?.id ?? null, status, updated_at: new Date().toISOString() },
      { onConflict: 'athlete_id,race_id' })
    load()
  }
  async function saveNote(rid, note) {
    const s = byId[rid]?.mine
    if (s) await supabase.from('athlete_races').update({ athlete_note: note }).eq('id', s.id)
    else await supabase.from('athlete_races').insert({ athlete_id: profile.id, race_id: rid, team_id: team?.id ?? null, status: 'wish', athlete_note: note })
    setNoteFor(null); load()
  }

  return (
    <>
      <div className="controls"><span className="muted">
        <b>{counts.total}</b> {t('seasonCount')} · {counts.wish} {t('wishedN')} · {counts.entered} {t('enteredN')}
      </span></div>
      <div className="split">
        <RaceMap races={races} focus={focus} routes={routes} home={homePt} />
        <div className="list">
          {merged.length === 0 ? (
            <div className="empty">{team ? t('teamEmpty') : t('soloEmpty')}</div>
          ) : (
            <RaceList races={races} onSelect={setFocus} active={focus} renderExtra={r => {
              const row = byId[r.id]
              const status = row?.mine?.status
              const tr = row?.tr
              return (
                <div>
                  <div className="race-badges">
                    {row?.mine?.assigned_by
                      ? <span className="tag assigned">{t('assignedBadge')}</span>
                      : row?.fromTeam && <span className="tag team">{t('teamPlanBadge')}</span>}
                    {status === 'entered' && <span className="tag entered">{t('st_entered')}</span>}
                  </div>
                  {tr && (tr.coach_note || tr.entry_deadline || tr.travel_info) &&
                    <div className="muted">{tr.entry_deadline && <>{t('deadline')} {tr.entry_deadline} · </>}{tr.coach_note}{tr.travel_info && <> · {tr.travel_info}</>}</div>}
                  {readOnly ? (
                    status && <div className="muted">{t('st_' + status)}</div>
                  ) : (
                    <div className="status-btns">
                      {CHOICES.map(k => (
                        <button key={k} className={status === k ? 'on' : ''}
                          style={status === k ? { background: STATUS_COLOR[k], color: '#fff', borderColor: STATUS_COLOR[k] } : {}}
                          onClick={() => setStatus(r.id, k)}>{t('st_' + k)}</button>
                      ))}
                      <button onClick={() => setNoteFor(noteFor === r.id ? null : r.id)}>
                        {row?.mine?.athlete_note ? t('editNote') : t('note')}
                      </button>
                    </div>
                  )}
                  {row?.mine?.athlete_note && noteFor !== r.id && <div className="muted">«{row.mine.athlete_note}»</div>}
                  {row?.mine?.coach_note && <div className="muted">{t('coachSays')} {row.mine.coach_note}</div>}
                  {!readOnly && noteFor === r.id && (
                    <form onSubmit={e => { e.preventDefault(); saveNote(r.id, new FormData(e.target).get('n')) }}>
                      <textarea name="n" defaultValue={row?.mine?.athlete_note || ''} />
                      <div className="row" style={{ marginTop: 6 }}>
                        <button className="btn small primary">{t('save')}</button>
                        <button type="button" className="btn small" onClick={() => setNoteFor(null)}>{t('cancel')}</button>
                      </div>
                    </form>
                  )}
                </div>
              )
            }} />
          )}
          <TripPlan profile={profile} races={planned} readOnly={readOnly}
            onRoutes={setRoutes} onHome={setHomePt} />
        </div>
      </div>
    </>
  )
}
