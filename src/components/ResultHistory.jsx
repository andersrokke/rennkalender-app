import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useT } from '../i18n'
import { fisPoints } from '../format'
import { DISC_COLOR } from './useDevelopment'
import {
  berik, filtrer, sorter, nokkeltall, perSesongOgGren, poengOverTid, sesongGraf, sesongNavn, FORSTE_SESONG
} from '../resultater'

const GRENER = ['SL', 'GS', 'SG', 'DH', 'AC']
const farge = g => DISC_COLOR[g] || '#B08CFF'
const KOLONNER = [['dato', 'rhDate'], ['sted', 'rhPlace'], ['kategori', 'rhCat'], ['gren', 'rhDisc'], ['plass', 'rhPos'], ['poeng', 'rhPts']]
const TIPS = { background: 'var(--snow)', border: '1px solid var(--line)', color: 'var(--slate)' }

// Alle FIS-renn løperen har stått på startlista i siden 2023/24: nøkkeltall,
// utvikling i grafer, oppsummering per sesong og gren, og hele lista - alt
// styrt av de samme filtrene. Henter sine egne rader for én løper om gangen,
// så et stort lag ikke støter mot radgrensen i API-et.
export default function ResultHistory({ fisCode, name, nonce = 0, grenUtenfra = null }) {
  const t = useT()
  const p1 = v => fisPoints(v, t.lang)
  const [raa, setRaa] = useState(null)
  const [sesong, setSesong] = useState('alle')
  const [gren, setGren] = useState([])            // valgte grener; tom = alle
  const [kategori, setKategori] = useState('alle')
  // Grenvelgeren øverst på siden styrer også her. Brikkene under virker
  // fortsatt, så man kan se en annen gren i historikken uten å bytte for alt.
  useEffect(() => { if (grenUtenfra) setGren(grenUtenfra) }, [grenUtenfra])
  const medGren = g => !gren.length || gren.includes(g)
  const vipp = g => setGren(v => v.includes(g) ? v.filter(x => x !== g) : [...v, g])
  const [bareFullfort, setBareFullfort] = useState(false)
  const [kol, setKol] = useState('dato')
  const [retning, setRetning] = useState('ned')
  const [yAkse, setYAkse] = useState('poeng')     // poeng | plass
  const [mal, setMal] = useState('beste')         // beste | snitt

  useEffect(() => {
    let av = false
    setRaa(null)
    supabase.from('fis_results')
      .select('fis_race_id, race_date, place, nation, discipline, category, category_name, position, fis_points')
      .eq('fis_code', fisCode).gte('race_date', `${FORSTE_SESONG}-07-01`).order('race_date', { ascending: false })
      .then(({ data }) => { if (!av) setRaa(data || []) })
    return () => { av = true }
  }, [fisCode, nonce])

  const alle = useMemo(() => berik(raa), [raa])
  const sesonger = useMemo(() => [...new Set(alle.map(r => r.sesong))].sort((a, b) => b - a), [alle])
  const grener = useMemo(() => GRENER.filter(g => alle.some(r => r.gren === g)), [alle])
  const kategorier = useMemo(() => [...new Set(alle.map(r => r.category).filter(Boolean))].sort(), [alle])

  const utvalg = useMemo(() => filtrer(alle, { sesong, gren, kategori, bareFullfort }), [alle, sesong, gren, kategori, bareFullfort])
  const n = useMemo(() => nokkeltall(utvalg), [utvalg])
  const liste = useMemo(() => sorter(utvalg, kol, retning), [utvalg, kol, retning])
  const tid = useMemo(() => poengOverTid(utvalg), [utvalg])
  // Sesonggrafen sammenligner sesonger, så den ser bort fra sesongfilteret.
  const perSesong = useMemo(() => sesongGraf(filtrer(alle, { gren, kategori })), [alle, gren, kategori])
  const oppsummert = useMemo(() => perSesongOgGren(utvalg), [utvalg])
  const grenerIUtvalg = grener.filter(g => utvalg.some(r => r.gren === g))

  const sorterPa = k => {
    if (k === kol) setRetning(r => r === 'opp' ? 'ned' : 'opp')
    // Dato er mest nyttig nyeste først; plass og poeng beste først.
    else { setKol(k); setRetning(k === 'dato' ? 'ned' : 'opp') }
  }
  const dato = d => new Date(d + 'T12:00:00Z').toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO',
    { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
  const kortDato = ms => new Date(ms).toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  const Brikke = ({ pa, onClick, children }) =>
    <button type="button" className={`chip ${pa ? 'on' : ''}`} aria-pressed={pa} onClick={onClick}>{children}</button>

  if (raa === null) return <div className="card"><h2>{t('rhTitle')}</h2><p className="muted">{t('loading')}</p></div>
  if (alle.length === 0) return (
    <div className="card"><h2>{t('rhTitle')}{name ? ` – ${name}` : ''}</h2><p className="muted">{t('rhEmpty')}</p></div>
  )

  return (
    <div className="card rh">
      <h2>{t('rhTitle')}{name ? ` – ${name}` : ''}</h2>
      <p className="muted">{t('rhSub')}</p>

      <div className="rh-filter">
        <div className="row" style={{ gap: 4 }}>
          <Brikke pa={sesong === 'alle'} onClick={() => setSesong('alle')}>{t('rhAllSeasons')}</Brikke>
          {sesonger.map(s => <Brikke key={s} pa={sesong === s} onClick={() => setSesong(s)}>{sesongNavn(s)}</Brikke>)}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <Brikke pa={!gren.length} onClick={() => setGren([])}>{t('rhAllDisc')}</Brikke>
          {grener.map(g => <Brikke key={g} pa={gren.includes(g)} onClick={() => vipp(g)}>{g}</Brikke>)}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <select style={{ width: 'auto' }} value={kategori} aria-label={t('rhCat')} onChange={e => setKategori(e.target.value)}>
            <option value="alle">{t('rhAllCat')}</option>
            {kategorier.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <label className="rh-kryss"><input type="checkbox" checked={bareFullfort} onChange={e => setBareFullfort(e.target.checked)} /> {t('rhOnlyFinished')}</label>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{n.starter}</b><span>{t('startsL')}</span></div>
        <div className="kpi"><b>{n.fullfort}</b><span>{t('finished')}</span></div>
        <div className="kpi"><b>{n.ute}</b><span>{t('dnf')}</span></div>
        <div className="kpi"><b>{n.seire}</b><span>{t('winsN')}</span></div>
        <div className="kpi"><b>{n.pall}</b><span>{t('podiumN')}</span></div>
        <div className="kpi"><b>{n.topp10}</b><span>{t('top10N')}</span></div>
        <div className="kpi"><b>{n.bestePlass ?? '–'}</b><span>{t('rhBestPos')}</span></div>
        <div className="kpi"><b>{p1(n.bestePoeng)}</b><span>{t('rhBestPts')}</span></div>
        <div className="kpi"><b>{p1(n.snittPoeng)}</b><span>{t('rhAvgPts')}</span></div>
      </div>

      {utvalg.length === 0 ? <p className="muted">{t('rhNoMatch')}</p> : (<>
        <div className="rh-grafhode">
          <h3>{t('rhChartRaces')}</h3>
          <div className="row" style={{ gap: 4 }}>
            <Brikke pa={yAkse === 'poeng'} onClick={() => setYAkse('poeng')}>{t('rhPts')}</Brikke>
            <Brikke pa={yAkse === 'plass'} onClick={() => setYAkse('plass')}>{t('rhPos')}</Brikke>
          </div>
        </div>
        {tid.length < 2 ? <p className="muted">{t('rhTooFew')}</p> : (
          <div className="chart">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={tid} margin={{ top: 10, right: 16, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']}
                  tick={{ fontSize: 11, fill: 'var(--mute)' }} tickFormatter={kortDato} />
                {/* lavere er bedre for både poeng og plass, så aksen er snudd */}
                <YAxis reversed allowDecimals={yAkse === 'poeng'} domain={yAkse === 'poeng' ? ['auto', 'auto'] : [1, 'auto']} tick={{ fontSize: 11, fill: 'var(--mute)' }}
                  tickFormatter={v => yAkse === 'poeng' ? p1(v) : v} />
                <Tooltip contentStyle={TIPS}
                  labelFormatter={(ms, pl) => { const r = pl?.[0]?.payload; return r ? `${dato(r.dato)} · ${r.sted || ''}` : '' }}
                  formatter={(v, navn, x) => yAkse === 'poeng'
                    ? [`${p1(v)} p · ${t('pos')} ${x.payload.plass}`, navn]
                    : [`${t('pos')} ${v}${x.payload[x.payload.gren] != null ? ` · ${p1(x.payload[x.payload.gren])} p` : ''}`, navn]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {grenerIUtvalg.map(g => (
                  <Line key={g} type="linear" dataKey={yAkse === 'poeng' ? g : 'plass_' + g} name={g} stroke={farge(g)}
                    strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="rh-grafhode">
          <h3>{t('rhChartSeasons')}</h3>
          <div className="row" style={{ gap: 4 }}>
            <Brikke pa={mal === 'beste'} onClick={() => setMal('beste')}>{t('rhBest')}</Brikke>
            <Brikke pa={mal === 'snitt'} onClick={() => setMal('snitt')}>{t('rhAvg')}</Brikke>
          </div>
        </div>
        {perSesong.length === 0 ? <p className="muted">{t('rhTooFew')}</p> : (
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={perSesong} margin={{ top: 10, right: 16, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="navn" tick={{ fontSize: 11, fill: 'var(--mute)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--mute)' }} tickFormatter={p1} />
                <Tooltip contentStyle={TIPS} cursor={{ fill: 'var(--ice)' }} formatter={v => `${p1(v)} p`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {grener.filter(medGren).map(g => (
                  <Bar key={g} dataKey={`${mal}_${g}`} name={g} fill={farge(g)} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <p className="muted rh-note">{t('rhLowerBetter')}</p>
          </div>
        )}

        <h3>{t('rhBySeason')}</h3>
        <div className="ad-scroll">
          <table className="ad-table rh-tabell">
            <thead><tr>
              <th>{t('rhSeason')}</th><th>{t('rhDisc')}</th><th className="tall">{t('startsL')}</th><th className="tall">{t('finished')}</th>
              <th className="tall">{t('rhBestPos')}</th><th className="tall">{t('rhBestPts')}</th><th className="tall">{t('rhAvgPts')}</th>
            </tr></thead>
            <tbody>{oppsummert.map(x => (
              <tr key={x.sesong + x.gren}>
                <td>{sesongNavn(x.sesong)}</td>
                <td><b style={{ color: farge(x.gren) }}>{x.gren}</b></td>
                <td className="tall">{x.starter}</td><td className="tall">{x.fullfort}</td>
                <td className="tall">{x.bestePlass ?? '–'}</td><td className="tall">{p1(x.bestePoeng)}</td><td className="tall">{p1(x.snittPoeng)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <h3>{t('rhAllRaces')} <span className="muted">({liste.length})</span></h3>
        <div className="ad-scroll">
          <table className="ad-table rh-tabell">
            <thead><tr>
              {KOLONNER.map(([k, etikett]) => (
                <th key={k} className={k === 'plass' || k === 'poeng' ? 'tall' : ''}
                  aria-sort={kol === k ? (retning === 'opp' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="rh-sort" onClick={() => sorterPa(k)}>
                    {t(etikett)}<span aria-hidden="true">{kol === k ? (retning === 'opp' ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr></thead>
            <tbody>{liste.map(r => (
              <tr key={r.fis_race_id}>
                <td className="nobr">{dato(r.race_date)}</td>
                <td>
                  <a href={`https://www.fis-ski.com/DB/general/results.html?sectorcode=AL&raceid=${r.fis_race_id}`}
                    target="_blank" rel="noreferrer">{r.place || '–'}</a>
                  {r.nation && <span className="muted"> {r.nation}</span>}
                </td>
                <td title={r.category_name || ''}>{r.category || '–'}</td>
                <td><b style={{ color: farge(r.gren) }}>{r.gren}</b></td>
                <td className="tall">{r.plass ?? <span className="muted">{r.position || '–'}</span>}</td>
                <td className="tall">{p1(r.poeng)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>)}
    </div>
  )
}
