import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useT } from '../i18n'
import { fmt } from '../util'
import { fetchFromFis, fisSummary } from '../fis'
import { useCupStandings } from './useCupStandings'
import CupStandings from './CupStandings.jsx'
import {
  DISC, COUNT_DISC, DISC_COLOR, useDevelopment, toChartRows, countingResults,
  officialPoints, seasonSummary, currentSeasonStart, discCode, isFinish
} from './useDevelopment'

const n1 = v => v == null ? '–' : Number(v).toLocaleString('nb-NO', { maximumFractionDigits: 2 })

// "Min utvikling": FIS points per discipline per list, counting results and a
// season summary. A coach sees every athlete on the team in the same chart.
export default function Development({ profile, team, isCoach, readOnly = false }) {
  const t = useT()
  const [people, setPeople] = useState([])
  const [disc, setDisc] = useState('GS')
  const [only, setOnly] = useState('all')   // coach: show every athlete, or one

  useEffect(() => {
    if (isCoach && team) {
      supabase.from('profiles').select('id, full_name, fis_code').eq('team_id', team.id)
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

  // Same Edge Function as in Settings, so the athlete can refresh on demand
  // instead of waiting for the nightly job.
  async function fetchFis(code) {
    setFisBusy(true); setFisMsg(null)
    const res = await fetchFromFis(code)
    setFisBusy(false)
    setFisMsg(res.error ? res.error : fisSummary(res.athlete, t))
    if (!res.error) reload()
  }
  const lastFetched = updatedAt[profile.fis_code]
  const rows = useMemo(() => toChartRows(points), [points])
  const nameOf = code => people.find(p => p.fis_code === code)?.full_name || code

  // One line per athlete for the chosen discipline (coach), or one line per
  // discipline for a single athlete.
  const shown = isCoach && only !== 'all' ? people.filter(p => p.fis_code === only) : people
  const series = isCoach
    ? people.map((p, i) => ({ key: `${p.fis_code}|${disc}`, name: p.full_name, color: LINE_COLORS[i % LINE_COLORS.length] }))
        .filter(s => only === 'all' || s.key.startsWith(only + '|'))
    : DISC.map(d => ({ key: `${profile.fis_code}|${d}`, name: d, color: DISC_COLOR[d] }))
        .filter(s => rows.some(r => r[s.key] != null))

  if (!codes.length) {
    return <div className="page"><div className="card">
      <h2>{t('devTitle')}</h2>
      <p className="muted">{isCoach ? t('devNoTeamCodes') : t('devNoCode')}</p>
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
            {lastFetched && <span>{t('fisLastUpdated')} {new Date(lastFetched).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}</span>}
            {fisBusy && <span className="spinner" />}
          </div>
        )}
        {profile.fis_code && readOnly && lastFetched && (
          <div className="fis-head"><span>{t('fisLastUpdated')} {new Date(lastFetched).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
        )}
        {fisMsg && !fisBusy && <div className="notice">{fisMsg}</div>}
        {isCoach && (
          <div className="row" style={{ margin: '10px 0', gap: 14 }}>
            <div className="row" style={{ gap: 4 }}>
              {DISC.map(d => <button key={d} className={`chip ${disc === d ? 'on' : ''}`} onClick={() => setDisc(d)}>{d}</button>)}
            </div>
            {people.length > 1 && (
              <select style={{ width: 'auto' }} value={only} onChange={e => setOnly(e.target.value)}>
                <option value="all">{t('allAthletes')}</option>
                {people.map(p => <option key={p.fis_code} value={p.fis_code}>{p.full_name}</option>)}
              </select>
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
              <LineChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--mute)' }} interval="preserveStartEnd" />
                {/* lower FIS points are better, so the axis is reversed */}
                <YAxis reversed tick={{ fontSize: 11, fill: 'var(--mute)' }} />
                <Tooltip contentStyle={{ background: 'var(--snow)', border: '1px solid var(--line)', color: 'var(--slate)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series.map(s => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color}
                    dot={false} strokeWidth={2} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {people.map(p => <CupStandings key={'cup' + p.fis_code} groups={cups[p.fis_code]} />)}

      {shown.map(p => {
        const official = officialPoints(points, p.fis_code)
        const counting = countingResults(results, p.fis_code, season, official)
        const sum = seasonSummary(results, p.fis_code, season)
        const mine = results.filter(r => r.fis_code === p.fis_code)
        return (
          <div className="card" key={p.fis_code}>
            <h2>{p.full_name}</h2>
            <h3>{t('countingResults')}</h3>
            {mine.length === 0 ? <p className="muted">{t('devNoResults')}</p>
              : Object.keys(counting).length === 0 ? <p className="muted">{t('devNoResults')}</p> : (
              <div className="counting">
                {COUNT_DISC.filter(d => counting[d]).map(d => {
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
            <h3>{t('seasonSummary')} {season}/{String(season + 1).slice(2)}</h3>
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
    </div>
  )
}

const LINE_COLORS = ['#4D8DFF', '#2ECC8F', '#FFB547', '#F55FA1', '#B08CFF', '#FF7A59', '#E6D64A', '#1A9A6A']
