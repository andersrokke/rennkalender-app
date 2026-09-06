import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import RaceMap from './RaceMap.jsx'
import RaceList from './RaceList.jsx'
import { STATUS_COLOR } from '../util'
import { useT } from '../i18n'

// Athlete season. With a team: the coach's plan, where the athlete answers wish / unavailable.
// Without a team (solo): the athlete's own picks from athlete_races, with full control of status.
export default function MySeason({ profile, team }) {
  const t = useT()
  const solo = !team
  const [rows, setRows] = useState([])
  const [mine, setMine] = useState([])
  const [focus, setFocus] = useState(null)
  const [noteFor, setNoteFor] = useState(null)

  async function load() {
    if (solo) {
      const { data } = await supabase.from('athlete_races')
        .select('*, race:races(*, venue:venues(*))').eq('athlete_id', profile.id)
      const list = (data || []).filter(a => a.race)
      setRows(list.map(a => ({ ...a.race, tr: null })).sort((x, y) => x.start_date.localeCompare(y.start_date)))
      setMine(list.map(({ race, ...a }) => a))
      return
    }
    const [{ data: tr }, { data: s }] = await Promise.all([
      supabase.from('team_races').select('*, race:races(*, venue:venues(*))').eq('team_id', team.id),
      supabase.from('athlete_races').select('*').eq('athlete_id', profile.id)
    ])
    setRows((tr || []).map(t => ({ ...t.race, tr: t })).sort((x, y) => x.start_date.localeCompare(y.start_date)))
    setMine(s || [])
  }
  useEffect(() => { load() }, [team?.id, solo])

  const get = rid => mine.find(s => s.race_id === rid)
  async function setStatus(rid, status) {
    await supabase.from('athlete_races').upsert({ athlete_id: profile.id, race_id: rid, team_id: team?.id ?? null, status, updated_at: new Date().toISOString() }, { onConflict: 'athlete_id,race_id' })
    load()
  }
  async function removeRace(rid) {
    const s = get(rid)
    if (s) await supabase.from('athlete_races').delete().eq('id', s.id)
    load()
  }
  async function saveNote(rid, note) {
    const s = get(rid)
    if (s) await supabase.from('athlete_races').update({ athlete_note: note }).eq('id', s.id)
    else await supabase.from('athlete_races').insert({ athlete_id: profile.id, race_id: rid, team_id: team?.id ?? null, status: solo ? 'planned' : 'wish', athlete_note: note })
    setNoteFor(null); load()
  }

  const going = rows.filter(r => ['planned', 'entered'].includes(get(r.id)?.status))
  return (
    <>
      <div className="controls"><span className="muted">
        <b>{going.length}</b> {t('inMyPlan')}{solo ? ` · ${rows.length} ${t('chosen')}` : ` · ${rows.length} ${t('teamPlanN')}`}
      </span></div>
      <div className="split">
        <RaceMap races={rows} focus={focus} />
        {rows.length === 0 ? <div className="list"><div className="empty">
          {solo ? t('soloEmpty') : t('teamEmpty')}
        </div></div> :
          <RaceList races={rows} onSelect={setFocus} active={focus} renderExtra={r => {
            const s = get(r.id), tr = r.tr
            // Solo athletes own their plan; in a team the coach sets planned & entered.
            const ownChoice = solo ? ['planned', 'entered', 'unavailable'] : ['wish', 'unavailable']
            return (
              <div>
                {tr && (tr.coach_note || tr.entry_deadline || tr.travel_info) && <div className="muted">{tr.entry_deadline && <>Frist {tr.entry_deadline} · </>}{tr.coach_note}{tr.travel_info && <> · {tr.travel_info}</>}</div>}
                <div className="row" style={{ marginTop: 4 }}>
                  {s && <span className="status-pill" style={{ background: STATUS_COLOR[s.status] }}>{t('st_' + s.status)}</span>}
                  <div className="status-btns">
                    {ownChoice.map(k => <button key={k} className={s?.status === k ? 'on' : ''} style={s?.status === k ? { background: STATUS_COLOR[k] } : {}} onClick={() => setStatus(r.id, k)}>{t('st_' + k)}</button>)}
                    <button onClick={() => setNoteFor(noteFor === r.id ? null : r.id)}>{s?.athlete_note ? t('editNote') : t('note')}</button>
                    {solo && <button onClick={() => removeRace(r.id)}>{t('removeMine')}</button>}
                  </div>
                </div>
                {s?.athlete_note && noteFor !== r.id && <div className="muted">«{s.athlete_note}»</div>}
                {s?.coach_note && <div className="muted">{t('coachSays')} {s.coach_note}</div>}
                {noteFor === r.id && (
                  <form onSubmit={e => { e.preventDefault(); saveNote(r.id, new FormData(e.target).get('n')) }}>
                    <textarea name="n" defaultValue={s?.athlete_note || ''} placeholder="f.eks. reiser med familien, kan ikke fredag" />
                    <div className="row" style={{ marginTop: 6 }}><button className="btn small primary">{t('save')}</button><button type="button" className="btn small" onClick={() => setNoteFor(null)}>{t('cancel')}</button></div>
                  </form>
                )}
              </div>
            )
          }} />}
      </div>
    </>
  )
}
