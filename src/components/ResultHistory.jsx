import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts'
import { useT } from '../i18n'
import { AKSE, Y_AKSE, RUTENETT, SESONG_ETIKETT, GrafTips, GrafForklaring, punkt, aktivtPunkt, StabelStolpe, FULLFORT, UTE } from './Graf.jsx'
import { fisPoints } from '../format'
import { DISC_COLOR } from './useDevelopment'
import {
  berik, filtrer, sorter, sorterOppsummering, perManed, nokkeltall, perSesongOgGren, poengOverTid, sesongGraf, sesongFelt, sesongNavn, FORSTE_SESONG
} from '../resultater'

const GRENER = ['SL', 'GS', 'SG', 'DH', 'AC']
const farge = g => DISC_COLOR[g] || '#B08CFF'
const KOLONNER = [['dato', 'rhDate'], ['sted', 'rhPlace'], ['kategori', 'rhCat'], ['gren', 'rhDisc'], ['plass', 'rhPos'], ['poeng', 'rhPts']]
// Aksemerke med to linjer: måneden, og andelen fullført rett under - i farge,
// så man ser med ett blikk hvilke måneder det ryker.
const PST_FARGE = p => p >= 75 ? 'var(--good)' : p >= 50 ? '#B7791F' : 'var(--danger)'
function MndTick({ x, y, payload, rader }) {
  const r = rader.find(m => m.nokkel === payload.value)
  if (!r) return null
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fontSize={11} fill="var(--mute)" fontFamily="var(--mono, inherit)" dy={14}>{r.navn.split(' ')[0]}</text>
      <text textAnchor="middle" fontSize={11} fontWeight={800} fill={PST_FARGE(r.prosent)} dy={30}>{r.prosent}%</text>
    </g>
  )
}

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
  const [oppKol, setOppKol] = useState('sesong')
  const [oppRetning, setOppRetning] = useState('ned')

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

  // Tallene og grafene regnes alltid av alle starter i utvalget. «Bare
  // fullførte» gjelder bare rennlista: brukt på tallene ville den gitt
  // 100 % fullført, som ikke sier noe.
  const utvalg = useMemo(() => filtrer(alle, { sesong, gren, kategori }), [alle, sesong, gren, kategori])
  const n = useMemo(() => nokkeltall(utvalg), [utvalg])
  const liste = useMemo(() => sorter(bareFullfort ? utvalg.filter(r => r.plass != null) : utvalg, kol, retning), [utvalg, bareFullfort, kol, retning])
  const tid = useMemo(() => poengOverTid(utvalg), [utvalg])
  const felt = useMemo(() => sesongFelt(tid), [tid])
  // Sesonggrafen sammenligner sesonger, så den ser bort fra sesongfilteret.
  const perSesong = useMemo(() => sesongGraf(filtrer(alle, { gren, kategori })), [alle, gren, kategori])
  const oppsummert = useMemo(() => sorterOppsummering(perSesongOgGren(utvalg), oppKol, oppRetning), [utvalg, oppKol, oppRetning])
  const maneder = useMemo(() => perManed(utvalg), [utvalg])
  const sorterOpp = k => {
    if (k === oppKol) setOppRetning(r => r === 'opp' ? 'ned' : 'opp')
    // Plass og poeng er best lavest; resten er mest nyttig høyest først.
    else { setOppKol(k); setOppRetning(['gren', 'bestePlass', 'bestePoeng', 'snittPoeng'].includes(k) ? 'opp' : 'ned') }
  }
  const pstKlasse = p => p == null ? '' : p >= 75 ? 'bra' : p >= 50 ? 'middels' : 'svak'
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
        </div>
      </div>

      <div className={`rh-andel ${pstKlasse(n.prosent)}`}>
        <b>{n.prosent == null ? '–' : `${n.prosent} %`}</b>
        <span>{t('rhPctLong')}<br /><em>{n.fullfort} {t('ofN')} {n.starter} {t('startsL')} · {n.ute} {t('rhOut')}</em></span>
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
              <LineChart data={tid} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid {...RUTENETT} />
                {/* Ett felt per sesong med navnet øverst, annenhver skygget, og
                    en tydelig strek der en ny sesong starter. */}
                {felt.map(f => (
                  <ReferenceArea key={'f' + f.sesong} x1={f.fra} x2={f.til} fill="var(--slate)" fillOpacity={f.skygge ? 0.045 : 0}
                    stroke="none" ifOverflow="hidden"
                    label={{ value: f.navn, position: 'insideTop', ...SESONG_ETIKETT }} />
                ))}
                {felt.filter(f => f.skille).map(f => (
                  <ReferenceLine key={'s' + f.sesong} x={f.skille} stroke="var(--faint)" strokeWidth={1} strokeDasharray="4 4" />
                ))}
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} {...AKSE} tickFormatter={kortDato} minTickGap={36} />
                {/* lavere er bedre for både poeng og plass, så aksen er snudd */}
                <YAxis reversed allowDecimals={yAkse === 'poeng'} domain={yAkse === 'poeng' ? ['auto', 'auto'] : [1, 'auto']} {...Y_AKSE}
                  tickFormatter={v => yAkse === 'poeng' ? p1(v) : v} />
                <Tooltip cursor={{ stroke: 'var(--faint)', strokeDasharray: '3 3' }}
                  content={<GrafTips
                    tittel={(ms, pl) => { const r = pl?.[0]?.payload; return r ? `${dato(r.dato)} · ${r.sted || ''}` : '' }}
                    verdi={p => yAkse === 'poeng'
                      ? `${p1(p.value)} p · ${t('pos')} ${p.payload.plass}`
                      : `${t('pos')} ${p.value}${p.payload[p.payload.gren] != null ? ` · ${p1(p.payload[p.payload.gren])} p` : ''}`} />} />
                <Legend content={<GrafForklaring />} />
                {grenerIUtvalg.map(g => (
                  <Line key={g} type="linear" dataKey={yAkse === 'poeng' ? g : 'plass_' + g} name={g} stroke={farge(g)}
                    strokeWidth={2.5} dot={punkt(farge(g))} activeDot={aktivtPunkt(farge(g))} connectNulls isAnimationActive={false} />
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
              <BarChart data={perSesong} margin={{ top: 10, right: 16, left: 0, bottom: 4 }} barGap={4} barCategoryGap="22%">
                <CartesianGrid {...RUTENETT} />
                <XAxis dataKey="navn" {...AKSE} />
                <YAxis {...Y_AKSE} tickFormatter={p1} />
                <Tooltip cursor={{ fill: 'var(--panel-2)' }} content={<GrafTips verdi={p => `${p1(p.value)} p`} />} />
                <Legend content={<GrafForklaring />} />
                {grener.filter(medGren).map(g => (
                  <Bar key={g} dataKey={`${mal}_${g}`} name={g} fill={farge(g)} radius={[6, 6, 0, 0]} maxBarSize={38} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <p className="muted rh-note">{t('rhLowerBetter')}</p>
          </div>
        )}

        <h3>{t('rhChartMonths')}</h3>
        <p className="muted rh-note">{t('rhChartMonthsSub')}</p>
        {/* Ett diagram per sesong, nyeste først: få stolper i hvert, så
            måned og prosent er lesbare også på mobil. */}
        {[...new Set(maneder.map(x => x.sesong))].sort((x, y) => y - x).map(ses => {
          const mnd = maneder.filter(x => x.sesong === ses)
          const tot = nokkeltall(utvalg.filter(r => r.sesong === ses))
          return (
            <div className="chart rh-mnd" key={ses}>
              <div className="rh-mndhode">
                <b>{sesongNavn(ses)}</b>
                <span className={`rh-pst ${pstKlasse(tot.prosent)}`}><i style={{ width: `${tot.prosent}%` }} /><b>{tot.prosent} % {t('finished')}</b></span>
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={mnd} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid {...RUTENETT} />
                  <XAxis dataKey="nokkel" interval={0} height={44} axisLine={false} tickLine={false} tick={<MndTick rader={mnd} />} />
                  <YAxis allowDecimals={false} {...Y_AKSE} width={30} />
                  <Tooltip cursor={{ fill: 'var(--panel-2)' }}
                    content={<GrafTips tittel={(k, pl) => { const r = pl?.[0]?.payload; return r ? `${r.navn} · ${r.prosent} % ${t('finished')}` : k }} />} />
                  <Bar dataKey="fullfort" name={t('finished')} stackId="a" fill={FULLFORT} maxBarSize={42} isAnimationActive={false}
                    shape={<StabelStolpe overst={r => !r.ute} />} />
                  <Bar dataKey="ute" name={t('rhOut')} stackId="a" fill={UTE} maxBarSize={42} isAnimationActive={false}
                    shape={<StabelStolpe />} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })}
        <div className="rh-forklaring"><span><i style={{ background: FULLFORT }} />{t('finished')}</span><span><i style={{ background: UTE }} />{t('rhOut')}</span></div>

        <h3>{t('rhBySeason')}</h3>
        <div className="ad-scroll">
          <table className="ad-table rh-tabell">
            <thead><tr>
              {[['sesong', 'rhSeason'], ['gren', 'rhDisc'], ['starter', 'startsL'], ['fullfort', 'finished'], ['prosent', 'rhPct'],
                ['bestePlass', 'rhBestPos'], ['bestePoeng', 'rhBestPts'], ['snittPoeng', 'rhAvgPts']].map(([k, etikett], i) => (
                <th key={k} className={i > 1 ? 'tall' : ''}
                  aria-sort={oppKol === k ? (oppRetning === 'opp' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="rh-sort" onClick={() => sorterOpp(k)}>
                    {t(etikett)}<span aria-hidden="true">{oppKol === k ? (oppRetning === 'opp' ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr></thead>
            <tbody>{oppsummert.map((x, i) => (
              <tr key={x.sesong + x.gren} className={oppKol === 'sesong' && i > 0 && oppsummert[i - 1].sesong !== x.sesong ? 'rh-nysesong' : ''}>
                <td>{sesongNavn(x.sesong)}</td>
                <td><b style={{ color: farge(x.gren) }}>{x.gren}</b></td>
                <td className="tall">{x.starter}</td><td className="tall">{x.fullfort}</td>
                <td className="tall">
                  <span className={`rh-pst ${pstKlasse(x.prosent)}`}>
                    <i style={{ width: `${x.prosent ?? 0}%` }} /><b>{x.prosent == null ? '–' : `${x.prosent} %`}</b>
                  </span>
                </td>
                <td className="tall">{x.bestePlass ?? '–'}</td><td className="tall">{p1(x.bestePoeng)}</td><td className="tall">{p1(x.snittPoeng)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div className="rh-grafhode">
          <h3>{t('rhAllRaces')} <span className="muted">({liste.length})</span></h3>
          <label className="rh-kryss"><input type="checkbox" checked={bareFullfort} onChange={e => setBareFullfort(e.target.checked)} /> {t('rhOnlyFinished')}</label>
        </div>
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
            <tbody>{liste.map((r, i) => (
              <Fragment key={r.fis_race_id}>
              {/* Sortert på dato får hver sesong sin egen overskriftsrad. */}
              {kol === 'dato' && (i === 0 || liste[i - 1].sesong !== r.sesong) && (
                <tr className="rh-sesongrad"><td colSpan={6}>{sesongNavn(r.sesong)}
                  <span> · {liste.filter(x => x.sesong === r.sesong).length} {t('krCount')}</span></td></tr>
              )}
              <tr>
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
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      </>)}
    </div>
  )
}
