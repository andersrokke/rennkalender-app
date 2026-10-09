import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { ComposedChart, AreaChart, Area, Line, BarChart, Bar, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts'
import { useT } from '../i18n'
import { AKSE, Y_AKSE, RUTENETT, SESONG_ETIKETT, PUNKT_ETIKETT, Toning, GrafTips, GrafForklaring, punkt, aktivtPunkt, StabelStolpe, FULLFORT, UTE } from './Graf.jsx'
import { fisPoints } from '../format'
import { DISC_COLOR } from './useDevelopment'
import {
  berik, filtrer, sorter, sorterOppsummering, perManed, nokkeltall, perSesongOgGren, sesongKort, poengOverTid, sesongGraf, sesongFelt, sesongNavn, FORSTE_SESONG
} from '../resultater'
import { medVaer, lagreFore, vaerGrupper, tempgruppe, vaertype, dagstemp, VAERTEGN, TEMPGRUPPER, VAERTYPER, FORE } from '../vaer'

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
export default function ResultHistory({ fisCode, name, nonce = 0, grenUtenfra = null, sesongUtenfra = null, kanFore = null }) {
  const t = useT()
  const p1 = v => fisPoints(v, t.lang)
  const grader = v => v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}°`
  const [raa, setRaa] = useState(null)
  const [sesong, setSesong] = useState([])        // valgte sesonger; tom = alle
  useEffect(() => { if (sesongUtenfra) setSesong(sesongUtenfra) }, [sesongUtenfra])
  const vippSesong = x => setSesong(v => v.includes(x) ? v.filter(y => y !== x) : [...v, x])
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
      .then(async ({ data }) => {
        if (av) return
        setRaa(data || [])
        // Været og føret kommer etterpå, så lista ikke venter på dem.
        const m = await medVaer(data || [])
        if (!av) setRaa(m)
      })
    return () => { av = true }
  }, [fisCode, nonce])

  // kanFore er id-en til den som fører (løper eller trener); null for foreldre.
  async function settFore(r, fore) {
    const { error } = await lagreFore(r, fore, kanFore)
    if (error) return alert(error.message)
    setRaa(rr => rr.map(x => x.place === r.place && (x.nation || '') === (r.nation || '') && x.race_date === r.race_date
      ? { ...x, fore: fore ? { fore } : null } : x))
  }

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
  const medVaerN = utvalg.filter(r => r.vaer && !r.dns && !r.trening).length
  const perTemp = useMemo(() => vaerGrupper(utvalg, tempgruppe, TEMPGRUPPER), [utvalg])
  const perType = useMemo(() => vaerGrupper(utvalg, vaertype, VAERTYPER), [utvalg])
  const perFore = useMemo(() => vaerGrupper(utvalg, f => f?.fore, FORE, 'fore'), [utvalg])
  const tid = useMemo(() => poengOverTid(utvalg), [utvalg])
  const felt = useMemo(() => sesongFelt(tid), [tid])
  // Sesonggrafen følger de samme valgene: med to sesonger valgt sammenlignes de to.
  const perSesong = useMemo(() => sesongGraf(utvalg), [utvalg])
  const kort = useMemo(() => sesongKort(perSesong, grener.filter(medGren), mal), [perSesong, grener, gren, mal])
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
          <Brikke pa={!sesong.length} onClick={() => setSesong([])}>{t('rhAllSeasons')}</Brikke>
          {sesonger.map(s => <Brikke key={s} pa={sesong.includes(s)} onClick={() => vippSesong(s)}>{sesongNavn(s)}</Brikke>)}
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
              <ComposedChart data={tid} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
                <defs>{grenerIUtvalg.map(g => <Toning key={g} id={`rh-ton-${g}`} farge={farge(g)} styrke={0.26} />)}</defs>
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
                {/* Med én gren i bildet får linja toning under seg; med flere
                    ville flatene dekket hverandre. */}
                {grenerIUtvalg.length === 1 && grenerIUtvalg.map(g => (
                  <Area key={'a' + g} type="linear" dataKey={yAkse === 'poeng' ? g : 'plass_' + g} stroke="none" fill={`url(#rh-ton-${g})`}
                    baseValue="dataMax" connectNulls legendType="none" tooltipType="none" isAnimationActive={false} activeDot={false} />
                ))}
                {grenerIUtvalg.map(g => (
                  <Line key={g} type="linear" dataKey={yAkse === 'poeng' ? g : 'plass_' + g} name={g} stroke={farge(g)}
                    strokeWidth={2.5} dot={punkt(farge(g))} activeDot={aktivtPunkt(farge(g))} connectNulls isAnimationActive={false} />
                ))}
              </ComposedChart>
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
        {perSesong.length === 0 ? <p className="muted">{t('rhTooFew')}</p> : (<>
          {/* Ett kort per gren: siste sesong, endringen fra sesongen før og en
              liten kurve over alle sesongene. */}
          <div className="rh-sesongkort">
            {kort.map(k => {
              const bedre = k.endring != null && k.endring < 0, darligere = k.endring != null && k.endring > 0
              return (
                <div className="rh-skort" key={k.gren}>
                  <div className="rh-skort-topp">
                    <span className="rh-skort-gren" style={{ color: farge(k.gren) }}><i style={{ background: farge(k.gren) }} />{k.gren}</span>
                    <span className="rh-skort-ses">{k.sesong}</span>
                  </div>
                  <b>{p1(k.verdi)}</b>
                  {k.endring == null ? <span className="rh-skort-endring">{t('rhFirstSeason')}</span> : (
                    <span className={`rh-skort-endring ${bedre ? 'bedre' : darligere ? 'darligere' : ''}`}>
                      {bedre ? '↓' : darligere ? '↑' : '→'} {p1(Math.abs(k.endring))} p <em>{t('rhFrom')} {k.forrigeSesong}</em>
                    </span>
                  )}
                  {k.serie.length > 1 && (
                    <div className="rh-skort-kurve">
                      <ResponsiveContainer width="100%" height={46}>
                        <AreaChart data={k.serie} margin={{ top: 6, right: 4, left: 4, bottom: 2 }}>
                          <defs><Toning id={`rh-sk-${k.gren}`} farge={farge(k.gren)} styrke={0.3} /></defs>
                          <YAxis hide reversed domain={['dataMin', 'dataMax']} />
                          <Area type="monotone" dataKey="v" stroke={farge(k.gren)} strokeWidth={2} fill={`url(#rh-sk-${k.gren})`}
                            baseValue="dataMax" dot={{ r: 2.5, fill: farge(k.gren), stroke: 'none' }} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {perSesong.length > 1 && (
            <div className="chart">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={perSesong} margin={{ top: 26, right: 26, left: 0, bottom: 4 }}>
                  <defs>{grener.filter(medGren).map(g => <Toning key={g} id={`rh-ses-${g}`} farge={farge(g)} styrke={0.2} />)}</defs>
                  <CartesianGrid {...RUTENETT} />
                  <XAxis dataKey="navn" {...AKSE} padding={{ left: 28, right: 28 }} />
                  {/* lavere poeng er bedre, så aksen er snudd: opp er framgang */}
                  <YAxis reversed {...Y_AKSE} domain={['auto', 'auto']} tickFormatter={p1} />
                  <Tooltip cursor={{ stroke: 'var(--faint)', strokeDasharray: '3 3' }} content={<GrafTips verdi={p => `${p1(p.value)} p`} />} />
                  <Legend content={<GrafForklaring />} />
                  {grener.filter(medGren).map((g, i, alle) => (
                    <Area key={g} type="monotone" dataKey={`${mal}_${g}`} name={g} stroke={farge(g)} strokeWidth={3}
                      fill={alle.length <= 2 ? `url(#rh-ses-${g})` : 'none'} baseValue="dataMax" connectNulls
                      dot={{ r: 5, fill: 'var(--snow)', stroke: farge(g), strokeWidth: 2.5 }} activeDot={aktivtPunkt(farge(g))} isAnimationActive={false}>
                      {alle.length <= 2 && <LabelList dataKey={`${mal}_${g}`} position="top" offset={10} formatter={p1} style={PUNKT_ETIKETT} />}
                    </Area>
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <p className="muted rh-note">{t('rhUpIsBetter')}</p>
            </div>
          )}
        </>)}

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
                    background={{ fill: 'var(--panel-2)', radius: 6 }}
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

        {medVaerN >= 3 && (<>
          <h3>{t('vrTitle')}</h3>
          <p className="muted rh-vaernote">{t(kanFore ? 'vrSub' : 'vrSubRead').replace('{n}', medVaerN)}</p>
          <div className="vr-rute">
            {[[perTemp, 'vrTemp', 'vrT_'], [perType, 'vrType', 'vrV_'], [perFore, 'vrFore', 'snow_']].map(([gr, tittel, pre]) => (
              <div className="vr-kort" key={tittel}>
                <h4>{t(tittel)}</h4>
                {gr.length === 0 ? <p className="muted">{t('vrForeNone')}</p> : (
                  <table className="vr-tabell">
                    <thead><tr><th /><th className="tall">{t('vrStarts')}</th><th className="tall">{t('finished')}</th><th className="tall">{t('vrAvg')}</th></tr></thead>
                    <tbody>{gr.map(g => (
                      <tr key={g.gruppe}>
                        <td>{t(pre + g.gruppe)}</td>
                        <td className="tall">{g.starter}</td>
                        <td className="tall"><b style={{ color: PST_FARGE(g.andel) }}>{g.andel} %</b></td>
                        <td className="tall">{p1(g.snittPoeng)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </>)}

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
              <th>{t('vrCol')}</th><th>{t('vrFore')}</th>
            </tr></thead>
            <tbody>{liste.map((r, i) => (
              <Fragment key={r.fis_race_id}>
              {/* Sortert på dato får hver sesong sin egen overskriftsrad. */}
              {kol === 'dato' && (i === 0 || liste[i - 1].sesong !== r.sesong) && (
                <tr className="rh-sesongrad"><td colSpan={8}>{sesongNavn(r.sesong)}
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
                <td className="nobr vr-celle" title={r.vaer ? `${t('vrMorning')} ${grader(r.vaer.temp_morgen)} · ${t('vrNoon')} ${grader(r.vaer.temp_middag)} · ${t('vrWind')} ${r.vaer.vind_ms ?? '–'} m/s${r.vaer.sno_cm ? ` · ${t('vrSnow')} ${r.vaer.sno_cm} cm` : ''}` : ''}>
                  {r.vaer ? <><span aria-hidden="true">{VAERTEGN[vaertype(r.vaer)] || ''}</span> {grader(dagstemp(r.vaer))}
                    <span className="muted"> {vaertype(r.vaer) ? t('vrV_' + vaertype(r.vaer)) : ''}</span></> : <span className="muted">–</span>}
                </td>
                <td>
                  {kanFore ? (
                    <select className="vr-fore" value={r.fore?.fore || ''} aria-label={t('vrFore')} onChange={e => settFore(r, e.target.value)}>
                      <option value="">{t('vrForePick')}</option>
                      {FORE.map(f => <option key={f} value={f}>{t('snow_' + f)}</option>)}
                    </select>
                  ) : r.fore ? t('snow_' + r.fore.fore) : <span className="muted">–</span>}
                </td>
              </tr>
              </Fragment>
            ))}</tbody>
          </table>
        </div>
      </>)}
    </div>
  )
}
