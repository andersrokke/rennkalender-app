import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fmt, fisUrl } from '../util'
import { fisPoints } from '../format'
import { DISC_COLOR } from './useDevelopment'
import { berik, FORSTE_SESONG } from '../resultater'
import { godeSteder } from '../anbefalt'

const GRENER = ['SL', 'GS', 'SG', 'DH']
const farge = g => DISC_COLOR[g] || '#B08CFF'

// Kommende renn på steder der løperen har kjørt før, rangert etter hvor godt
// det gikk der - målt mot løperens eget snitt samme sesong, så et gammelt
// resultat ikke taper bare fordi poengene var høyere den gangen.
export default function GoodVenues({ fisCode, gender, name }) {
  const t = useT()
  const p1 = v => fisPoints(v, t.lang)
  const [res, setRes] = useState(null)
  const [renn, setRenn] = useState([])
  const [gren, setGren] = useState([])          // valgte grener; tom = alle
  const [apen, setApen] = useState(null)
  const idag = useMemo(() => new Date().toISOString().slice(0, 10), [])

  useEffect(() => {
    if (!fisCode) { setRes([]); return }
    let av = false
    setRes(null)
    Promise.all([
      supabase.from('fis_results')
        .select('fis_race_id, race_date, place, nation, discipline, category, position, fis_points')
        .eq('fis_code', fisCode).gte('race_date', `${FORSTE_SESONG}-07-01`),
      supabase.from('races')
        .select('id, fis_event_id, place, host_nation, start_date, end_date, events, category, gender')
        .gte('end_date', idag).order('start_date')
    ]).then(([r, k]) => { if (!av) { setRes(berik(r.data)); setRenn(k.data || []) } })
    return () => { av = true }
  }, [fisCode, idag])

  const { rader, utenHistorikk } = useMemo(
    () => godeSteder(res || [], renn, { idag, kjonn: gender || null }), [res, renn, idag, gender])
  const vist = rader.filter(x => !gren.length || x.grener.some(g => gren.includes(g)))
  const vipp = g => setGren(v => v.includes(g) ? v.filter(x => x !== g) : [...v, g])
  const dato = d => new Date(d + 'T12:00:00Z').toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO',
    { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

  if (res === null) return <div className="page muted">{t('loading')}</div>

  return (
    <div className="page">
      <div className="card">
        <h2>{t('gvTitle')}{name ? ` – ${name}` : ''}</h2>
        <p className="muted">{t('gvSub')}</p>
        {!fisCode ? <p className="muted">{t('gvNoCode')}</p>
          : res.length === 0 ? <p className="muted">{t('rhEmpty')}</p> : (
          <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
            <button className={`chip ${!gren.length ? 'on' : ''}`} aria-pressed={!gren.length} onClick={() => setGren([])}>{t('rhAllDisc')}</button>
            {GRENER.map(g => <button key={g} className={`chip ${gren.includes(g) ? 'on' : ''}`} aria-pressed={gren.includes(g)} onClick={() => vipp(g)}>{g}</button>)}
          </div>
        )}
      </div>

      {res.length > 0 && vist.length === 0 && <div className="card"><p className="muted">{t('gvNone')}</p></div>}

      {vist.map(x => {
        const r = x.renn, k = r.id
        return (
          <div className={`card gv ${x.dom}`} key={k}>
            <div className="gv-hode">
              <div>
                <div className="gv-dato">{fmt(r)}</div>
                <h3>{r.place} <span className="muted">{r.host_nation}</span></h3>
                <div className="muted">{r.category} · {r.events}</div>
              </div>
              <span className={`gv-dom ${x.dom}`}>{t('gvDom_' + x.dom)}</span>
            </div>

            {x.motSnitt != null && x.dom !== 'ingen' && (
              <p className="gv-mot">
                <b>{p1(Math.abs(x.motSnitt))} p {x.motSnitt <= 0 ? t('gvBetter') : t('gvWorse')}</b> {t('gvThanAvg')}
                {x.tyntGrunnlag && <span className="muted"> · {t('gvThin')}</span>}
              </p>
            )}
            {x.dom === 'ingen' && <p className="gv-mot">{t('gvNeverFinished')}</p>}

            <div className="kpis">
              <div className="kpi"><b>{x.starter}</b><span>{t('gvStartsHere')}</span></div>
              <div className="kpi"><b>{x.prosent} %</b><span>{t('finished')}</span></div>
              <div className="kpi"><b>{x.bestePlass ?? '–'}</b><span>{t('rhBestPos')}</span></div>
              <div className="kpi"><b>{p1(x.bestePoeng)}</b><span>{t('rhBestPts')}</span></div>
              <div className="kpi"><b>{p1(x.snittPoeng)}</b><span>{t('rhAvgPts')}</span></div>
            </div>

            <div className="row" style={{ gap: 12, marginTop: 6 }}>
              <button className="btn small link" aria-expanded={apen === k} onClick={() => setApen(apen === k ? null : k)}>
                {apen === k ? t('gvHide') : `${t('gvShow')} (${x.historikk.length})`}
              </button>
              {fisUrl(r) && <a href={fisUrl(r)} target="_blank" rel="noreferrer">FIS-side ↗</a>}
            </div>
            {apen === k && (
              <div className="ad-scroll">
                <table className="ad-table rh-tabell">
                  <thead><tr><th>{t('rhDate')}</th><th>{t('rhCat')}</th><th>{t('rhDisc')}</th>
                    <th className="tall">{t('rhPos')}</th><th className="tall">{t('rhPts')}</th></tr></thead>
                  <tbody>{x.historikk.map(h => (
                    <tr key={h.fis_race_id}>
                      <td className="nobr">{dato(h.race_date)}</td><td>{h.category || '–'}</td>
                      <td><b style={{ color: farge(h.gren) }}>{h.gren}</b></td>
                      <td className="tall">{h.plass ?? <span className="muted">{h.position || '–'}</span>}</td>
                      <td className="tall">{p1(h.poeng)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {res.length > 0 && utenHistorikk > 0 && (
        <p className="muted" style={{ padding: '0 4px' }}>{utenHistorikk} {t('gvNewPlaces')}</p>
      )}
    </div>
  )
}
