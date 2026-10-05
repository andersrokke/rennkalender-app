import { useEffect, useMemo, useState } from 'react'
import { avtaleFraRad } from '../avtale'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import RaceList from './RaceList.jsx'
import GoodVenues from './GoodVenues.jsx'
import { fisPoints } from '../format'
import { berik, sesongNavn, FORSTE_SESONG } from '../resultater'

// Rennene barna skal være med på - og bare dem. «Alle renn» er hele
// kalenderen; denne er svaret på «hvor skal barnet mitt, og når». Alt leses
// med foresattes vanlige leserett, så det er ingenting å endre her.
export default function ChildRaces() {
  const t = useT()
  const [kids, setKids] = useState(null)
  const [rader, setRader] = useState({})     // athlete_id -> [{ race, mine, tr }]
  // «Tidligere» er det barnet faktisk har kjørt: resultatene fra FIS, ikke
  // planen. Planen i appen går bare så langt tilbake som appen har vært i bruk.
  const [kjort, setKjort] = useState({})     // athlete_id -> berikede fis_results
  const [tidligere, setTidligere] = useState(false)
  const [gode, setGode] = useState(false)

  useEffect(() => {
    let av = false
    ;(async () => {
      const { data: barn } = await supabase.rpc('my_children')
      const ut = {}, res = {}
      await Promise.all((barn || []).map(async k => {
        const [{ data: own }, { data: tr }, { data: fr }] = await Promise.all([
          supabase.from('athlete_races').select('*, race:races(*, venue:venues(*))').eq('athlete_id', k.athlete_id),
          k.team_id
            ? supabase.from('team_races').select('*, race:races(*, venue:venues(*))').eq('team_id', k.team_id)
            : Promise.resolve({ data: [] }),
          k.fis_code
            ? supabase.from('fis_results')
                .select('fis_race_id, race_date, place, nation, discipline, category, position, fis_points')
                .eq('fis_code', k.fis_code).gte('race_date', `${FORSTE_SESONG}-07-01`).order('race_date', { ascending: false })
            : Promise.resolve({ data: [] })
        ])
        res[k.athlete_id] = berik(fr)
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
      if (!av) { setKids(barn || []); setRader(ut); setKjort(res) }
    })()
    return () => { av = true }
  }, [])

  const idag = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const dato = d => new Date(d + 'T12:00:00Z').toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO',
    { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

  if (!kids) return <div className="page muted">{t('loading')}</div>
  if (kids.length === 0) return <div className="page"><div className="card"><p className="muted">{t('childrenNone')}</p></div></div>

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className={`chip ${!tidligere && !gode ? 'on' : ''}`} aria-pressed={!tidligere && !gode} onClick={() => { setTidligere(false); setGode(false) }}>{t('krUpcoming')}</button>
        <button className={`chip ${tidligere ? 'on' : ''}`} aria-pressed={tidligere} onClick={() => { setTidligere(true); setGode(false) }}>{t('krPast')}</button>
      </div>
      {gode && <div className="gv-inni">{kids.map(k =>
        <GoodVenues key={k.athlete_id} fisCode={k.fis_code} gender={k.gender?.trim() || null} name={k.full_name} />)}</div>}
      {!gode && kids.map(k => {
        if (tidligere) {
          const res = kjort[k.athlete_id] || []
          const sesonger = [...new Set(res.map(r => r.sesong))]
          return (
            <div className="card" key={k.athlete_id}>
              <h2>{k.full_name}</h2>
              <p className="muted">{k.team_name || t('noTeam2')} · {res.length} {t('krCount')}</p>
              {res.length === 0 ? <p className="muted">{k.fis_code ? t('krNonePast') : t('krNoFis')}</p> : sesonger.map(s => (
                <div key={s}>
                  <h3>{sesongNavn(s)}</h3>
                  <div className="ad-scroll">
                    <table className="ad-table rh-tabell">
                      <thead><tr>
                        <th>{t('rhDate')}</th><th>{t('rhPlace')}</th><th>{t('rhCat')}</th><th>{t('rhDisc')}</th>
                        <th className="tall">{t('rhPos')}</th><th className="tall">{t('rhPts')}</th>
                      </tr></thead>
                      <tbody>{res.filter(r => r.sesong === s).map(r => (
                        <tr key={r.fis_race_id}>
                          <td className="nobr">{dato(r.race_date)}</td>
                          <td>
                            <a href={`https://www.fis-ski.com/DB/general/results.html?sectorcode=AL&raceid=${r.fis_race_id}`}
                              target="_blank" rel="noreferrer">{r.place || '–'}</a>
                            {r.nation && <span className="muted"> {r.nation}</span>}
                          </td>
                          <td>{r.category || '–'}</td>
                          <td><b>{r.gren}</b></td>
                          <td className="tall">{r.plass ?? <span className="muted">{r.position || '–'}</span>}</td>
                          <td className="tall">{fisPoints(r.poeng, t.lang)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        }
        const vis = (rader[k.athlete_id] || []).filter(x => x.race.end_date >= idag)
        const byId = Object.fromEntries(vis.map(x => [x.race.id, x]))
        return (
          <div className="card" key={k.athlete_id}>
            <h2>{k.full_name}</h2>
            <p className="muted">{k.team_name || t('noTeam2')} · {vis.length} {t('krCount')}</p>
            {vis.length === 0 ? <p className="muted">{t('krNone')}</p> : (
              <RaceList races={vis.map(x => x.race)} onSelect={() => {}} active={null} renderExtra={r => {
                const { mine, tr } = byId[r.id]
                return (
                  <div>
                    <div className="race-badges">
                      {avtaleFraRad(mine) !== 'ingen'
                        ? <span className={`tag av ${avtaleFraRad(mine)}`}>{t(`av_${avtaleFraRad(mine)}_f`)}</span>
                        : <span className="tag team">{t('teamPlanBadge')}</span>}
                    </div>
                    {tr && (tr.entry_deadline || tr.coach_note || tr.travel_info) &&
                      <div className="muted">{tr.entry_deadline && <>{t('deadline')} {tr.entry_deadline} · </>}{tr.coach_note}{tr.travel_info && <> · {tr.travel_info}</>}</div>}
                    {mine?.athlete_note && <div className="muted">«{mine.athlete_note}»</div>}
                    {mine?.coach_note && <div className="muted">{t('coachSays')} {mine.coach_note}</div>}
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
