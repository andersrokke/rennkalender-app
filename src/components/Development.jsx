import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useT } from '../i18n'
import {
  DISC, DISC_COLOR, useDevelopment, toChartRows, countingResults,
  seasonSummary, currentSeasonStart, discCode, isFinish
} from './useDevelopment'

const n1 = v => v == null ? '–' : Number(v).toLocaleString('nb-NO', { maximumFractionDigits: 2 })

// "Min utvikling": FIS points per discipline per list, counting results and a
// season summary. A coach sees every athlete on the team in the same chart.
export default function Development({ profile, team, isCoach }) {
  const t = useT()
  const [people, setPeople] = useState([])
  const [disc, setDisc] = useState('GS')

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
  const { points, results, loading } = useDevelopment(codes)
  const rows = useMemo(() => toChartRows(points), [points])
  const nameOf = code => people.find(p => p.fis_code === code)?.full_name || code

  // One line per athlete for the chosen discipline (coach), or one line per
  // discipline for a single athlete.
  const series = isCoach
    ? people.map((p, i) => ({ key: `${p.fis_code}|${disc}`, name: p.full_name, color: LINE_COLORS[i % LINE_COLORS.length] }))
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
        <h2>{t('devTitle')}</h2>
        <p className="muted">{t('devSub')}</p>
        {isCoach && (
          <div className="row" style={{ margin: '10px 0' }}>
            {DISC.map(d => <button key={d} className={`chip ${disc === d ? 'on' : ''}`} onClick={() => setDisc(d)}>{d}</button>)}
          </div>
        )}
        {loading ? <p className="muted">{t('loading')}</p>
          : rows.length === 0 ? <p className="muted">{t('devNoPoints')}</p> : (
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

      {people.map(p => {
        const counting = countingResults(results, p.fis_code)
        const sum = seasonSummary(results, p.fis_code, season)
        const mine = results.filter(r => r.fis_code === p.fis_code)
        if (!mine.length) return null
        return (
          <div className="card" key={p.fis_code}>
            <h2>{p.full_name}</h2>
            <h3>{t('countingResults')}</h3>
            {Object.keys(counting).length === 0 ? <p className="muted">{t('devNoResults')}</p> : (
              <div className="counting">
                {DISC.filter(d => counting[d]).map(d => (
                  <div key={d} className="count-disc">
                    <div className="count-head"><b style={{ color: DISC_COLOR[d] }}>{d}</b>
                      <span className="muted">{t('avgOfTwo')} <b>{n1(counting[d].average)}</b></span></div>
                    {counting[d].best.map((r, i) => (
                      <div key={i} className="count-row">
                        <span>{r.race_date} · {r.place} · {r.category}</span>
                        <span>{t('pos')} {r.position} · {n1(r.fis_points)} p</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <h3>{t('seasonSummary')} {season}/{String(season + 1).slice(2)}</h3>
            <div className="kpis">
              <div className="kpi"><b>{sum.starts}</b><span>{t('startsL')}</span></div>
              <div className="kpi"><b>{sum.finished}</b><span>{t('finished')}</span></div>
              <div className="kpi"><b>{sum.dnf}</b><span>{t('dnf')}</span></div>
              <div className="kpi"><b>{sum.best ? sum.best.position : '–'}</b><span>{t('bestPos')}</span></div>
              <div className="kpi"><b>{n1(sum.bestPoints)}</b><span>{t('bestPoints')}</span></div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const LINE_COLORS = ['#4D8DFF', '#2ECC8F', '#FFB547', '#F55FA1', '#B08CFF', '#FF7A59', '#E6D64A', '#1A9A6A']
