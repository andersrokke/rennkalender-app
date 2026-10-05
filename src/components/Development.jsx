import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import { AKSE, Y_AKSE, RUTENETT, SESONG_ETIKETT, Toning, GrafTips, GrafForklaring, aktivtPunkt } from './Graf.jsx'
import { useT } from '../i18n'
import { fmt } from '../util'
import { fisPoints, dateTime } from '../format'
import { fetchFromFis, fisSummary } from '../fis'
import { useCupStandings } from './useCupStandings'
import CupStandings from './CupStandings.jsx'
import Timing from './Timing.jsx'
import ResultHistory from './ResultHistory.jsx'
import TeamStats from './TeamStats.jsx'
import GoodVenues from './GoodVenues.jsx'
import {
  DISC, COUNT_DISC, DISC_COLOR, useDevelopment, useCurrentList, toChartRows, countingResults,
  officialPoints, seasonSummary, currentSeasonStart, discCode, isFinish, shortLabel
} from './useDevelopment'



// "Min utvikling": FIS points per discipline per list, counting results and a
// season summary. A coach sees every athlete on the team in the same chart.
export default function Development({ profile, team, isCoach, readOnly = false }) {
  const t = useT()
  const n1 = v => fisPoints(v, t.lang)
  const [people, setPeople] = useState([])
  const [only, setOnly] = useState('all')   // coach: show every athlete, or one
  // Sesong og gren velges for hele siden, én eller flere av hver; tomt valg
  // betyr alle. Treneren starter på storslalåm: med alle grener for et helt
  // lag blir det en linje per løper per gren.
  const [gren, setGren] = useState(isCoach ? ['GS'] : [])
  const [sesonger, setSesonger] = useState([])   // startår, f.eks. 2025 for 2025/26
  const vippSesong = y => setSesonger(v => v.includes(y) ? v.filter(x => x !== y) : [...v, y])
  const vippGren = d => setGren(v => v.includes(d) ? v.filter(x => x !== d) : [...v, d])

  useEffect(() => {
    if (isCoach && team) {
      supabase.from('profiles').select('id, full_name, fis_code, gender').eq('team_id', team.id)
        .not('fis_code', 'is', null).order('full_name')
        .then(({ data }) => setPeople(data || []))
    } else {
      setPeople(profile.fis_code ? [{ id: profile.id, full_name: profile.full_name, fis_code: profile.fis_code }] : [])
    }
  }, [isCoach, team?.id, profile.id, profile.fis_code])

  const codes = people.map(p => p.fis_code)
  const { points, results, updatedAt, loading, reload } = useDevelopment(codes)
  const { byCode: cups } = useCupStandings()
  const [fisBusy, setFisBusy] = useState(false)
  const [fisMsg, setFisMsg] = useState(null)
  const [hentet, setHentet] = useState(0)

  // Same Edge Function as in Settings, so the athlete can refresh on demand
  // instead of waiting for the nightly job.
  async function fetchFis(code) {
    setFisBusy(true); setFisMsg(null)
    const res = await fetchFromFis(code)
    setFisBusy(false)
    setFisMsg(res.error ? res.error : fisSummary(res.athlete, t))
    if (!res.error) { reload(); setHentet(x => x + 1) }
  }
  const lastFetched = updatedAt[profile.fis_code]
  const alleRader = useMemo(() => toChartRows(points), [points])
  // Sesongen står sist i listenavnet («11 · 23/24»).
  const sesongAvLabel = l => { const m = /(\d{2})\/\d{2}$/.exec(l || ''); return m ? 2000 + Number(m[1]) : null }
  const tilgjengeligeSesonger = useMemo(() => {
    const fra = y => (y.getMonth() >= 6 ? y.getFullYear() : y.getFullYear() - 1)
    const ut = new Set(alleRader.map(r => sesongAvLabel(r.label)).filter(Boolean))
    results.forEach(r => { if (r.race_date) ut.add(fra(new Date(r.race_date))) })
    return [...ut].filter(y => y >= 2023).sort((a, b) => b - a)
  }, [alleRader, results])
  const rows = useMemo(() => !sesonger.length ? alleRader : alleRader.filter(r => sesonger.includes(sesongAvLabel(r.label))),
    [alleRader, sesonger])

  // «Hvor er vi nå» i en graf over seksti lister. Sesongen skyggelegges, og
  // den gjeldende lista får en egen linje - men bare hvis noen faktisk har
  // poeng på den, ellers ville linja havnet på feil kategori.
  const curList = useCurrentList()
  const curLabel = curList ? shortLabel(curList.name) : null
  const nowLabel = curLabel && rows.some(r => r.label === curLabel) ? curLabel : null
  // Ett felt per sesong, lest av listenavnet («11 · 23/24»). Annenhver sesong
  // skygges og hver får navnet sitt øverst, så årene skilles tydelig.
  const seasonBands = useMemo(() => {
    const ut = []
    rows.forEach(r => {
      const s = (/(\d{2}\/\d{2})$/.exec(r.label) || [])[1]
      if (!s) return
      const siste = ut[ut.length - 1]
      if (siste && siste.navn === s) siste.til = r.label
      else ut.push({ navn: s, fra: r.label, til: r.label })
    })
    return ut.map((b, i) => ({ ...b, skygge: i % 2 === 1 }))
  }, [rows])
  const onlyDate = v => new Date(v).toLocaleDateString(t.lang === 'en' ? 'en-GB' : 'nb-NO',
    { day: 'numeric', month: 'short', year: 'numeric' })
  const nameOf = code => people.find(p => p.fis_code === code)?.full_name || code

  // One line per athlete for the chosen discipline (coach), or one line per
  // discipline for a single athlete.
  const shown = isCoach && only !== 'all' ? people.filter(p => p.fis_code === only) : people
  const valgteGrener = gren.length ? DISC.filter(d => gren.includes(d)) : DISC
  // Treneren med hele laget: én linje per løper per valgte gren. Med én gren
  // skilles løperne på farge; med flere står grenen i navnet.
  const series = (isCoach && shown.length > 1
    ? shown.flatMap((p, i) => valgteGrener.map((d, j) => ({ key: `${p.fis_code}|${d}`,
        name: valgteGrener.length > 1 ? `${p.full_name} · ${d}` : p.full_name,
        color: LINE_COLORS[(i * valgteGrener.length + j) % LINE_COLORS.length] })))
    : valgteGrener.map(d => ({ key: `${(shown[0] || profile).fis_code}|${d}`, name: d, color: DISC_COLOR[d] }))
  ).filter(s => rows.some(r => r[s.key] != null))
  const iGren = d => !gren.length || gren.includes(d)
  const resultaterIGren = !gren.length ? results : results.filter(r => gren.includes(discCode(r.discipline)))

  if (!codes.length) {
    return <div className="page"><div className="card">
      <h2>{readOnly ? profile.full_name : t('devTitle')}</h2>
      <p className="muted">{isCoach ? t('devNoTeamCodes') : readOnly ? t('krNoFis') : t('devNoCode')}</p>
    </div></div>
  }

  const season = currentSeasonStart()
  return (
    <div className="page">
      <div className="card">
        <h2>{isCoach ? t('devTitleCoach') : readOnly ? profile.full_name : t('devTitle')}</h2>
        <p className="muted">{t('devSub')}</p>
        {profile.fis_code && !readOnly && (
          <div className="fis-head">
            <button className="btn link" disabled={fisBusy} onClick={() => fetchFis(profile.fis_code)}>
              {fisBusy ? t('fisFetching') : t('fisRefresh')}
            </button>
            {lastFetched && <span>{t('fisLastUpdated')} {dateTime(lastFetched, t.lang)}</span>}
            {fisBusy && <span className="spinner" />}
          </div>
        )}
        {profile.fis_code && readOnly && lastFetched && (
          <div className="fis-head"><span>{t('fisLastUpdated')} {dateTime(lastFetched, t.lang)}</span></div>
        )}
        {fisMsg && !fisBusy && <div className="notice">{fisMsg}</div>}
        <div className="rh-filter">
          {tilgjengeligeSesonger.length > 0 && (
            <div className="row" style={{ gap: 4 }}>
              <button className={`chip ${!sesonger.length ? 'on' : ''}`} aria-pressed={!sesonger.length} onClick={() => setSesonger([])}>{t('rhAllSeasons')}</button>
              {tilgjengeligeSesonger.map(y => <button key={y} className={`chip ${sesonger.includes(y) ? 'on' : ''}`} aria-pressed={sesonger.includes(y)}
                onClick={() => vippSesong(y)}>{y}/{String(y + 1).slice(2)}</button>)}
            </div>
          )}
          <div className="row" style={{ gap: 4 }}>
            <button className={`chip ${!gren.length ? 'on' : ''}`} aria-pressed={!gren.length} onClick={() => setGren([])}>{t('rhAllDisc')}</button>
            {DISC.map(d => <button key={d} className={`chip ${gren.includes(d) ? 'on' : ''}`} aria-pressed={gren.includes(d)} onClick={() => vippGren(d)}>{d}</button>)}
          </div>
        </div>
        {isCoach && (
          <div className="row" style={{ margin: '10px 0', gap: 14 }}>
            {people.length > 1 && (
              <select style={{ width: 'auto' }} value={only} onChange={e => setOnly(e.target.value)}>
                <option value="all">{t('allAthletes')}</option>
                {people.map(p => <option key={p.fis_code} value={p.fis_code}>{p.full_name}</option>)}
              </select>
            )}
          </div>
        )}
        {curList && (
          <div className="fis-period">
            <span className="lab">{t('fisPeriod')}</span>
            <span className="now">{shortLabel(curList.name)}</span>
            <span className="when">
              {curList.imported_at && <>{t('fisFetchedList')} {onlyDate(curList.imported_at)}<br /></>}
              {t('fisToday')} {onlyDate(Date.now())}
            </span>
            {rows.length > 0 && !nowLabel && (
              <p className="miss">{isCoach ? t('fisNoOneOnList') : t('fisNotOnList')}</p>
            )}
          </div>
        )}
        {loading ? <p className="muted">{t('loading')}</p>
          : rows.length === 0 ? (
            <div className="empty-fis">
              <p className="muted">{profile.fis_code ? t('fisEmpty') : t('devNoPoints')}</p>
              {profile.fis_code && !readOnly && <button className="btn primary" disabled={fisBusy} onClick={() => fetchFis(profile.fis_code)}>
                {fisBusy ? t('fisFetching') : t('fisFetch')}
              </button>}
            </div>
          ) : (
          <div className="chart">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={rows} margin={{ top: 24, right: 18, left: 0, bottom: 4 }}>
                <defs>{series.map((s, i) => <Toning key={s.key} id={`dev-ton-${i}`} farge={s.color} />)}</defs>
                <CartesianGrid {...RUTENETT} />
                {seasonBands.map(b => (
                  <ReferenceArea key={'b' + b.navn} x1={b.fra} x2={b.til} fill="var(--slate)" fillOpacity={b.skygge ? 0.045 : 0}
                    stroke="none" label={{ value: `20${b.navn}`, position: 'insideBottom', ...SESONG_ETIKETT }} />
                ))}
                {seasonBands.slice(1).map(b => (
                  <ReferenceLine key={'l' + b.navn} x={b.fra} stroke="var(--faint)" strokeWidth={1} strokeDasharray="4 4" />
                ))}
                {nowLabel && (
                  <ReferenceLine x={nowLabel} stroke="var(--slate)" strokeWidth={1.5}
                    label={{ value: t('fisNowMark'), position: 'top', fill: 'var(--slate)', fontSize: 11, fontWeight: 700 }} />
                )}
                <XAxis dataKey="label" {...AKSE} interval="preserveStartEnd" minTickGap={24} />
                {/* lower FIS points are better, so the axis is reversed */}
                <YAxis reversed {...Y_AKSE} domain={['auto', 'auto']} tickFormatter={v => fisPoints(v, t.lang)} />
                <Tooltip cursor={{ stroke: 'var(--faint)', strokeDasharray: '3 3' }}
                  content={<GrafTips verdi={p => fisPoints(p.value, t.lang)} />} />
                <Legend content={<GrafForklaring />} />
                {/* Toningen under linja tegnes bare når det er få serier;
                    med et helt lag blir det grøt. Bunnen er dårligste verdi,
                    siden aksen er snudd. */}
                {series.map((s, i) => (
                  <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5}
                    fill={series.length <= 4 ? `url(#dev-ton-${i})` : 'none'} baseValue="dataMax"
                    dot={false} activeDot={aktivtPunkt(s.color)} connectNulls isAnimationActive={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Treneren: hele laget i én sorterbar tabell. Et trykk på en løper
          velger ham eller henne, og alt under gjelder da den løperen. */}
      {isCoach && people.length > 0 && (
        <TeamStats people={people} valgt={only === 'all' ? null : only}
          onPick={code => { setOnly(code); setTimeout(() => document.getElementById('dev-loper')?.scrollIntoView({ behavior: 'smooth' }), 50) }} />
      )}
      {isCoach && only !== 'all' && (
        <div className="ts-tilbake" id="dev-loper">
          <button className="btn small" onClick={() => setOnly('all')}>← {t('tsBack')}</button>
          <b>{nameOf(only)}</b>
        </div>
      )}

      {people.map(p => <CupStandings key={'cup' + p.fis_code} groups={cups[p.fis_code]} />)}

      {shown.map(p => {
        const official = officialPoints(points, p.fis_code)
        const counting = countingResults(results, p.fis_code, season, official)
        const sum = seasonSummary(resultaterIGren, p.fis_code, season)
        const mine = results.filter(r => r.fis_code === p.fis_code)
        return (
          <div className="card" key={p.fis_code}>
            <h2>{p.full_name}</h2>
            <h3>{t('countingResults')}</h3>
            {mine.length === 0 ? <p className="muted">{t('devNoResults')}</p>
              : !COUNT_DISC.some(d => counting[d] && iGren(d)) ? <p className="muted">{t('devNoResults')}</p> : (
              <div className="counting">
                {COUNT_DISC.filter(d => counting[d] && iGren(d)).map(d => {
                  const c = counting[d]
                  return (
                    <div key={d} className="count-disc">
                      <div className="count-head">
                        <b style={{ color: DISC_COLOR[d] || 'var(--slate)' }}>{d}</b>
                        {c.official && <span className="official">{t('officialNow')} <b>{n1(c.official.points)}</b></span>}
                      </div>
                      {c.baseListStands ? (
                        <div className="count-note">{t('blStands')}</div>
                      ) : (
                        <div className="count-note">
                          {t('calcPerRules')}: <b>{n1(c.calculated)}</b>
                          {' — '}{c.need === 3 ? t('avgOfThree') : t('avgOfTwo')}
                          {c.best.length < c.need && ` (${c.best.length} ${t('ofN')} ${c.need} ${t('resultsWord')}, +${c.penaltyPct} %)`}
                          {c.official && (c.beatsBaseList
                            ? <span className="improves"> · {t('wouldImprove')} {n1(c.improvesBy)}</span>
                            : <span> · {t('blStands')}</span>)}
                        </div>
                      )}
                      {c.best.map((r, i) => (
                        <div key={i} className="count-row">
                          <span>{r.race_date} · {r.place} · {r.category}</span>
                          <span>{t('pos')} {r.position} · {n1(r.fis_points)} p</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
            <h3>{t('seasonSummary')} {season}/{String(season + 1).slice(2)}{gren.length ? ` · ${DISC.filter(d => gren.includes(d)).join(', ')}` : ''}</h3>
            {/* counts only, so every number on this row means the same kind of thing */}
            <div className="kpis">
              <div className="kpi"><b>{sum.starts}</b><span>{t('startsL')}</span></div>
              <div className="kpi"><b>{sum.finished}</b><span>{t('finished')}</span></div>
              <div className="kpi"><b>{sum.dnf}</b><span>{t('dnf')}</span></div>
              <div className="kpi"><b>{sum.wins}</b><span>{t('winsN')}</span></div>
              <div className="kpi"><b>{sum.podium}</b><span>{t('podiumN')}</span></div>
              <div className="kpi"><b>{sum.top10}</b><span>{t('top10N')}</span></div>
            </div>
            {sum.bestRace && (
              <div className="season-best">
                {t('bestRacePoints')}: <b>{n1(sum.bestPoints)}</b>
                {' '}<span className="muted">({sum.bestRace.place}, {fmt({ start_date: sum.bestRace.race_date, end_date: sum.bestRace.race_date })})</span>
              </div>
            )}
            {/* a placing is only worth stating when it is not a win — then the win count says it */}
            {sum.bestPosition != null && sum.bestPosition !== 1 && (
              <div className="season-best muted">{t('bestPlacing')}: {sum.bestPosition}</div>
            )}
          </div>
        )
      })}
      {/* Hele historikken tegnes for én løper om gangen. En trener med hele
          laget valgt får beskjed om å velge én, i stedet for ti kort på rad. */}
      {shown.length === 1
        ? <ResultHistory fisCode={shown[0].fis_code} name={isCoach ? shown[0].full_name : null} nonce={hentet}
            grenUtenfra={gren} sesongUtenfra={sesonger} kanFore={readOnly ? null : profile.id} />
        : shown.length > 1 && <div className="card"><h2>{t('rhTitle')}</h2><p className="muted">{t('rhPickOne')}</p></div>}
      {isCoach && shown.length === 1 && (
        <div className="gv-inni"><GoodVenues fisCode={shown[0].fis_code} gender={shown[0].gender?.trim() || null} name={shown[0].full_name} /></div>
      )}
      {/* Løper og trener finner tidtakingen under Treningslogg. En forelder har
          ingen treningslogg, så for dem står den her. */}
      {readOnly && <Timing profile={profile} team={team} isCoach={false} />}
    </div>
  )
}

const LINE_COLORS = ['#3D7BEB', '#1F9D76', '#E0A12B', '#DB4C7B', '#8B6FE8', '#F0774A', '#3AAFC4', '#7A8B2E']
