import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import RaceList from './RaceList.jsx'

// Rennene barna skal være med på - og bare dem. «Alle renn» er hele
// kalenderen; denne er svaret på «hvor skal barnet mitt, og når». Alt leses
// med foresattes vanlige leserett, så det er ingenting å endre her.
export default function ChildRaces() {
  const t = useT()
  const [kids, setKids] = useState(null)
  const [rader, setRader] = useState({})     // athlete_id -> [{ race, mine, tr }]
  const [tidligere, setTidligere] = useState(false)

  useEffect(() => {
    let av = false
    ;(async () => {
      const { data: barn } = await supabase.rpc('my_children')
      const ut = {}
      await Promise.all((barn || []).map(async k => {
        const [{ data: own }, { data: tr }] = await Promise.all([
          supabase.from('athlete_races').select('*, race:races(*, venue:venues(*))').eq('athlete_id', k.athlete_id),
          k.team_id
            ? supabase.from('team_races').select('*, race:races(*, venue:venues(*))').eq('team_id', k.team_id)
            : Promise.resolve({ data: [] })
        ])
        const m = new Map()
        ;(tr || []).filter(x => x.race).forEach(x => m.set(x.race.id, { race: x.race, tr: x }))
        ;(own || []).filter(x => x.race).forEach(a => {
          const ex = m.get(a.race.id)
          if (ex) ex.mine = a; else m.set(a.race.id, { race: a.race, mine: a })
        })
        // «Kan ikke» er ikke et renn barnet skal på.
        ut[k.athlete_id] = [...m.values()].filter(x => x.mine?.status !== 'unavailable')
          .sort((x, y) => x.race.start_date.localeCompare(y.race.start_date))
      }))
      if (!av) { setKids(barn || []); setRader(ut) }
    })()
    return () => { av = true }
  }, [])

  const idag = useMemo(() => new Date().toISOString().slice(0, 10), [])

  if (!kids) return <div className="page muted">{t('loading')}</div>
  if (kids.length === 0) return <div className="page"><div className="card"><p className="muted">{t('childrenNone')}</p></div></div>

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={`chip ${!tidligere ? 'on' : ''}`} aria-pressed={!tidligere} onClick={() => setTidligere(false)}>{t('krUpcoming')}</button>
        <button className={`chip ${tidligere ? 'on' : ''}`} aria-pressed={tidligere} onClick={() => setTidligere(true)}>{t('krPast')}</button>
      </div>
      {kids.map(k => {
        const alle = rader[k.athlete_id] || []
        const vis = alle.filter(x => tidligere ? x.race.end_date < idag : x.race.end_date >= idag)
        const byId = Object.fromEntries(vis.map(x => [x.race.id, x]))
        return (
          <div className="card" key={k.athlete_id}>
            <h2>{k.full_name}</h2>
            <p className="muted">{k.team_name || t('noTeam2')} · {vis.length} {t('krCount')}</p>
            {vis.length === 0 ? <p className="muted">{tidligere ? t('krNonePast') : t('krNone')}</p> : (
              <RaceList races={vis.map(x => x.race)} onSelect={() => {}} active={null} renderExtra={r => {
                const { mine, tr } = byId[r.id]
                return (
                  <div>
                    <div className="race-badges">
                      {mine?.status
                        ? <span className={`tag ${mine.status === 'entered' ? 'entered' : 'team'}`}>{t('st_' + mine.status)}</span>
                        : <span className="tag team">{t('teamPlanBadge')}</span>}
                    </div>
                    {tr && (tr.entry_deadline || tr.coach_note || tr.travel_info) &&
                      <div className="muted">{tr.entry_deadline && <>{t('deadline')} {tr.entry_deadline} · </>}{tr.coach_note}{tr.travel_info && <> · {tr.travel_info}</>}</div>}
                    {mine?.athlete_note && <div className="muted">{mine.athlete_note}</div>}
                  </div>
                )
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
