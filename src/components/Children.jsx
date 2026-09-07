import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fmt } from '../util'
import MySeason from './MySeason.jsx'
import Development from './Development.jsx'

// Guardian view. Everything here is read-only: the RLS policies on
// athlete_races and team_races only allow writes by the athlete or their
// coach, so a parent could not change anything even if the UI let them.
export default function Children({ profile }) {
  const t = useT()
  const [kids, setKids] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)      // { child, view }
  const [child, setChild] = useState(null)    // the child's full profile row
  const [team, setTeam] = useState(null)
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('my_children')
    setKids(data || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // The child's own profile carries home_city and plan_settings, which the
  // travel cost view needs. RLS lets a guardian read it.
  async function openChild(kid, view) {
    setOpen({ kid, view }); setChild(null); setTeam(null)
    const { data: p } = await supabase.from('profiles').select('*').eq('id', kid.athlete_id).single()
    setChild(p || null)
    if (p?.team_id) {
      const { data: tm } = await supabase.from('teams').select('*').eq('id', p.team_id).single()
      setTeam(tm || null)
    }
  }

  async function link(e) {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.rpc('link_guardian', { code: code.trim().toLowerCase() })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setCode(''); setAdding(false); load()
  }
  async function unlink(kid) {
    if (!confirm(`${t('unlinkChild')}: ${kid.full_name}?`)) return
    await supabase.rpc('unlink_guardian', { child: kid.athlete_id })
    if (open?.kid.athlete_id === kid.athlete_id) setOpen(null)
    load()
  }

  if (open) {
    const { kid, view } = open
    return (
      <>
        <div className="controls">
          <button className="btn small" onClick={() => setOpen(null)}>← {t('children')}</button>
          <b>{kid.full_name}</b>
          <div className="group">
            {[['season', t('childSeason')], ['dev', t('childDev')]].map(([k, l]) => (
              <button key={k} className={`chip ${view === k ? 'on' : ''}`} onClick={() => setOpen({ kid, view: k })}>{l}</button>
            ))}
          </div>
          <span className="muted">{t('readOnly')}</span>
        </div>
        {!child ? <div className="page muted">{t('loading')}</div>
          : view === 'season' ? <MySeason profile={child} team={team} readOnly />
          : <Development profile={child} team={team} isCoach={false} readOnly />}
      </>
    )
  }

  return (
    <div className="page">
      {loading ? <p className="muted">{t('loading')}</p>
        : kids.length === 0 ? <div className="card"><p className="muted">{t('childrenNone')}</p></div> : null}

      {kids.map(k => (
        <div className="card child" key={k.athlete_id}>
          <div className="child-head">
            <h2>{k.full_name}</h2>
            <span className="muted">{k.team_name || t('noTeam2')}{k.club ? ` · ${k.club}` : ''}{k.fis_code ? ` · FIS ${k.fis_code}` : ''}</span>
          </div>
          <div className="kpis">
            <div className="kpi"><b>{k.races ?? 0}</b><span>{t('racesN2')}</span></div>
            <div className="kpi"><b>{k.race_days ?? 0}</b><span>{t('raceDaysN')}</span></div>
            <div className="kpi">
              <b>{k.next_race ? fmt({ start_date: k.next_race, end_date: k.next_race }) : '–'}</b>
              <span>{k.next_race ? `${t('nextRace')}${k.next_place ? ` · ${k.next_place}` : ''}` : t('noNextRace')}</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small primary" onClick={() => openChild(k, 'season')}>{t('childSeason')}</button>
            <button className="btn small" onClick={() => openChild(k, 'dev')}>{t('childDev')}</button>
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn small link" onClick={() => unlink(k)}>{t('unlinkChild')}</button>
          </div>
        </div>
      ))}

      <div className="card">
        {adding ? (
          <form onSubmit={link}>
            <label>{t('linkCode')}</label>
            <input required value={code} onChange={e => { setCode(e.target.value); setErr(null) }} placeholder="8 tegn" />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn small primary" disabled={busy}>{t('linkBtn')}</button>
              <button type="button" className="btn small" onClick={() => { setAdding(false); setErr(null) }}>{t('cancel')}</button>
            </div>
            {err && <div className="error">{err}</div>}
          </form>
        ) : <button className="btn primary" onClick={() => setAdding(true)}>{t('addChild')}</button>}
      </div>
    </div>
  )
}
