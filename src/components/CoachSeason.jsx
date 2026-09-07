import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import RaceMap from './RaceMap.jsx'
import RaceList from './RaceList.jsx'
import { STATUS_COLOR, overlaps } from '../util'
import { useT } from '../i18n'
import AssignRow from './AssignRow.jsx'
import { useTeamAssign, hasAnswered } from './useTeamAssign'

// Team season: races the coach has selected, with per-race athlete overview and notes.
export default function CoachSeason({ team }) {
  const t = useT()
  const [rows, setRows] = useState([])
  const [athletes, setAthletes] = useState([])
  const [statuses, setStatuses] = useState([])
  const [focus, setFocus] = useState(null)
  const [editing, setEditing] = useState(null)
  const { byRace, apply, reload } = useTeamAssign(team.id)

  async function load() {
    const [{ data: tr }, { data: a }, { data: s }] = await Promise.all([
      supabase.from('team_races').select('*, race:races(*, venue:venues(*))').eq('team_id', team.id),
      supabase.from('profiles').select('id, full_name, gender, birth_year').eq('team_id', team.id).eq('role', 'athlete').order('full_name'),
      supabase.from('athlete_races').select('*').eq('team_id', team.id)
    ])
    setRows((tr || []).map(t => ({ ...t.race, tr: t })).sort((x, y) => x.start_date.localeCompare(y.start_date)))
    setAthletes(a || []); setStatuses(s || [])
  }
  useEffect(() => { load() }, [team.id])

  async function saveNote(tr, fields) {
    await supabase.from('team_races').update(fields).eq('id', tr.id); setEditing(null); load()
  }
  async function remove(tr) { if (confirm('Fjerne rennet fra lagets plan?')) { await supabase.from('team_races').delete().eq('id', tr.id); load() } }

  const stat = (raceId) => athletes.map(a => ({ a, s: statuses.find(s => s.athlete_id === a.id && s.race_id === raceId) }))
  const clashes = r => rows.filter(o => o.id !== r.id && overlaps(o, r)).map(o => o.place)

  return (
    <div className="split">
      <RaceMap races={rows} focus={focus} />
      {rows.length === 0 ? <div className="list"><div className="empty">{t('coachEmpty')}</div></div> :
        <RaceList races={rows} onSelect={setFocus} active={focus} renderExtra={r => {
          const st = stat(r.id), going = st.filter(x => ['planned', 'entered'].includes(x.s?.status)).length
          const cl = clashes(r)
          const tr = r.tr
          return (
            <div>
              <div className="row" style={{ fontSize: 13 }}>
                {cl.length > 0 && <span className="tag warn">Overlapper: {cl.join(', ')}</span>}
              </div>
              <AssignRow raceId={r.id} rows={byRace[r.id] || []}
                onApply={async (rid, add, rem) => { await apply(rid, add, rem); load() }} />
              {(tr.coach_note || tr.entry_deadline || tr.travel_info) && editing !== tr.id && (
                <div className="muted" style={{ marginTop: 4 }}>
                  {tr.entry_deadline && <>Frist {tr.entry_deadline} · </>}{tr.coach_note}{tr.travel_info && <> · {tr.travel_info}</>}
                </div>
              )}
              {editing === tr.id ? (
                <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target); saveNote(tr, { coach_note: fd.get('n') || null, entry_deadline: fd.get('d') || null, travel_info: fd.get('t') || null }) }}>
                  <label>Notat til laget</label><input name="n" defaultValue={tr.coach_note || ''} />
                  <div className="row">
                    <div style={{ flex: 1 }}><label>Påmeldingsfrist</label><input type="date" name="d" defaultValue={tr.entry_deadline || ''} /></div>
                    <div style={{ flex: 2 }}><label>Reise/overnatting</label><input name="t" defaultValue={tr.travel_info || ''} /></div>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}><button className="btn small primary">Lagre</button><button type="button" className="btn small" onClick={() => setEditing(null)}>Avbryt</button></div>
                </form>
              ) : (
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn small" onClick={() => setEditing(tr.id)}>Rediger notat</button>
                  <button className="btn small danger" onClick={() => remove(tr)}>Fjern</button>
                </div>
              )}
            </div>
          )
        }} />}
    </div>
  )
}
