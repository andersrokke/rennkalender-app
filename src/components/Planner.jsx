import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import RaceMap from './RaceMap.jsx'
import { fmt } from '../util'
import { useT } from '../i18n'
import {
  HOMES, DEFAULT_HOME, DEFAULT_PLAN, TRIP_COLORS, TRAVEL_MODES,
  homeLL, buildTrips, tripTotals, nok, raceNights, raceStarts, raceMode
} from '../travel'

// Season planner: races the athlete has in athlete_races (planned / entered)
// chained into trips, with distance, nights and cost.
export default function Planner({ profile, onChange, readOnly = false }) {
  const t = useT()
  const [rows, setRows] = useState([])
  const [home, setHome] = useState(profile.home_city || DEFAULT_HOME)
  const [plan, setPlan] = useState({ ...DEFAULT_PLAN, ...(profile.plan_settings || {}) })
  const [focus, setFocus] = useState(null)
  const [details, setDetails] = useState({})

  useEffect(() => {
    supabase.from('athlete_races').select('status, race:races(*, venue:venues(*))')
      .eq('athlete_id', profile.id).in('status', ['planned', 'entered'])
      .then(({ data }) => setRows((data || []).map(a => a.race).filter(Boolean)))
    supabase.from('race_plan_details').select('*').eq('athlete_id', profile.id)
      .then(({ data }) => setDetails(Object.fromEntries((data || []).map(d => [d.race_id, d]))))
  }, [profile.id])

  // One row per race in race_plan_details; the athlete owns their own rows,
  // coaches and guardians can only read them.
  async function saveDetail(raceId, patch) {
    const next = { ...(details[raceId] || { race_id: raceId, travel_mode: 'car' }), ...patch }
    setDetails(d => ({ ...d, [raceId]: next }))
    await supabase.from('race_plan_details').upsert(
      { athlete_id: profile.id, race_id: raceId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'athlete_id,race_id' })
  }

  async function saveHome(v) {
    setHome(v)
    await supabase.from('profiles').update({ home_city: v }).eq('id', profile.id)
    onChange?.()
  }
  async function persist(next) {
    setPlan(next)
    await supabase.from('profiles').update({ plan_settings: next }).eq('id', profile.id)
    onChange?.()
  }
  const savePlan = (key, value) => persist({ ...plan, [key]: +value })

  // Manual overrides on top of the automatic chaining. A race is either forced
  // onto the previous trip (join) or forced to start a new one (split).
  const joinPrev = id => persist({
    ...plan, joins: [...new Set([...(plan.joins || []), id])],
    splits: (plan.splits || []).filter(x => x !== id)
  })
  const splitHere = id => persist({
    ...plan, splits: [...new Set([...(plan.splits || []), id])],
    joins: (plan.joins || []).filter(x => x !== id)
  })
  async function removeRace(raceId) {
    await supabase.from('athlete_races').delete().eq('athlete_id', profile.id).eq('race_id', raceId)
    setRows(rs => rs.filter(r => r.id !== raceId))
  }

  const trips = useMemo(() => buildTrips(rows, home, plan, 'Hjem', details), [rows, home, plan, details])
  const tot = tripTotals(trips)
  const routes = trips.map((trip, i) => ({ points: trip.points, color: TRIP_COLORS[i % TRIP_COLORS.length] }))
  const noVenue = rows.length - trips.reduce((a, trip) => a + trip.races.length, 0)

  const Kpi = ({ v, label }) => <div className="kpi"><b>{v}</b><span>{label}</span></div>

  return (
    <>
      <div className="controls">
        <div className="group"><span>{t('home')}</span>
          {readOnly
            ? <span>{(HOMES[home] || [])[2] || home}</span>
            : <select style={{ width: 'auto' }} value={home} onChange={e => saveHome(e.target.value)}>
                {Object.entries(HOMES).map(([k, v]) => <option key={k} value={k}>{v[2]}</option>)}
              </select>}
        </div>
        <div className="group"><span>{rows.length} {t('inPlan')} · {trips.length} {t('tripsN')}</span></div>
      </div>
      <div className="split">
        <RaceMap races={rows} focus={focus} routes={routes} home={homeLL(home)} />
        <div className="list">
          {trips.length === 0 ? (
            <div className="empty">{t('planEmpty')}</div>
          ) : (
            <>
              <div className="trip total">
                <div className="route">{t('wholeSeason')} · {trips.length} {t('tripsN')} · {rows.length} {t('racesN')}</div>
                <div className="kpis">
                  <Kpi v={nok(tot.km)} label={`${t('km')} (${nok(tot.km / 10)} ${t('mil')})`} />
                  <Kpi v={Math.round(tot.hours)} label={t('hours')} />
                  <Kpi v={tot.nights} label={t('nights')} />
                  <Kpi v={nok(tot.cost)} label={t('cost')} />
                </div>
                <div className="legs-sum">
                  {t('drive')} {nok(tot.drive)} · {t('flightW')} {nok(tot.flight)} · {t('stay')} {nok(tot.stay)} · {t('fees')} {nok(tot.fees)} ({tot.starts} {t('startsL')}) · {t('liftL')} {nok(tot.lift)}
                </div>
                {tot.busTrips > 0 && <div className="covered">{t('coveredBySchool')}: {tot.busTrips} {t(tot.busTrips === 1 ? 'busTripWordOne' : 'busTripsWord')}</div>}
              </div>
              {trips.map((trip, i) => (
                <div className="trip" key={i} style={{ borderLeftColor: TRIP_COLORS[i % TRIP_COLORS.length] }}>
                  <div className="route">{t('trip')} {i + 1}: {t('homeShort')}<i>→</i>{trip.races.map(r => r.place).join(' → ')}<i>→</i>{t('homeShort')}</div>
                  <div className="when">{fmt({ start_date: trip.races[0].start_date, end_date: trip.races[trip.races.length - 1].end_date })}</div>
                  <div className="kpis">
                    <Kpi v={nok(trip.km)} label={t('km')} /><Kpi v={trip.hours} label={t('hours')} />
                    <Kpi v={trip.nights} label={t('nights')} /><Kpi v={nok(trip.cost.total)} label={t('cost')} />
                  </div>
                  <div className="legs">
                    {trip.legs.map((l, j) => <div key={j}><span>{l.from} → {l.to}</span><span>{nok(l.km)} {t('km')}</span></div>)}
                    <div><span>
                      {trip.cost.drive > 0 && <>{t('drive')} {nok(trip.cost.drive)} · </>}
                      {trip.cost.flight > 0 && <>{t('flightW')} {nok(trip.cost.flight)} · </>}
                      {t('stay')} {nok(trip.cost.stay)} · {t('fees')} {nok(trip.cost.fees)} · {t('liftL')} {nok(trip.cost.lift)}
                    </span><span>{trip.starts} {t('startsL')}</span></div>
                  </div>
                  {trip.races.map((r, k) => {
                    const d = details[r.id]
                    const mode = raceMode(d)
                    return (
                      <div className="plan-race" key={r.id}>
                        <div className="plan-race-main">
                          <span><b>{r.place}</b> · {fmt(r)} · {r.events}
                            {!readOnly && k > 0 && <button className="btn small link split" onClick={() => splitHere(r.id)}>{t('splitBtn')}</button>}
                          </span>
                          {!readOnly && <button className="btn small" title={t('removeMine')} onClick={() => removeRace(r.id)}>×</button>}
                        </div>
                        <div className="plan-race-opts">
                          {readOnly ? (
                            <span className="muted">{t(mode === 'bus' ? 'modeBus' : mode === 'flight' ? 'modeFlight' : 'modeCar')}
                              {' · '}{raceNights(r, d)} {t('nightsLabel').toLowerCase()}
                              {' · '}{raceStarts(r, d)} {t('startsL')}
                              {mode === 'flight' && d?.flight_cost ? ` · ${nok(d.flight_cost)} kr` : ''}
                            </span>
                          ) : (
                            <>
                              <div className="modes">
                                {TRAVEL_MODES.map(m => (
                                  <button key={m} className={`chip ${mode === m ? 'on' : ''}`}
                                    onClick={() => saveDetail(r.id, { travel_mode: m })}>
                                    {t(m === 'bus' ? 'modeBus' : m === 'flight' ? 'modeFlight' : 'modeCar')}
                                  </button>
                                ))}
                              </div>
                              {mode === 'flight' && (
                                <label className="mini">{t('flightCost')}
                                  <input type="number" min="0" step="100" value={d?.flight_cost ?? ''}
                                    onChange={e => saveDetail(r.id, { flight_cost: e.target.value === '' ? null : +e.target.value })} />
                                </label>
                              )}
                              <label className="mini">{t('nightsLabel')}
                                <input type="number" min="0" max="60" value={raceNights(r, d)}
                                  onChange={e => saveDetail(r.id, { nights_override: e.target.value === '' ? null : +e.target.value })} />
                              </label>
                              <label className="mini">{t('startsLabel')}
                                <input type="number" min="0" max="40" value={raceStarts(r, d)}
                                  onChange={e => saveDetail(r.id, { starts_override: e.target.value === '' ? null : +e.target.value })} />
                              </label>
                            </>
                          )}
                        </div>
                        {mode === 'bus' && <div className="covered small">{t('busNoDrive')}</div>}
                      </div>
                    )
                  })}
                  {!readOnly && i > 0 && <div style={{ marginTop: 8 }}>
                    <button className="btn small link" onClick={() => joinPrev(trip.races[0].id)}>{t('joinBtn')}</button>
                  </div>}
                </div>
              ))}
            </>
          )}
          {noVenue > 0 && <div className="muted" style={{ padding: '0 20px 12px' }}>{noVenue} {t('noVenue')}</div>}
          {!readOnly && <div className="settings">
            <div><label>{t('kmRate')}</label><input type="number" step="0.5" value={plan.kmRate} onChange={e => savePlan('kmRate', e.target.value)} /></div>
            <div><label>{t('hotel')}</label><input type="number" step="50" value={plan.hotel} onChange={e => savePlan('hotel', e.target.value)} /></div>
            <div><label>{t('entry')}</label><input type="number" step="50" value={plan.entry} onChange={e => savePlan('entry', e.target.value)} /></div>
            <div><label>{t('liftS')}</label><input type="number" step="50" value={plan.lift} onChange={e => savePlan('lift', e.target.value)} /></div>
            <div><label>{t('maxGap')}</label><input type="number" min="0" max="10" value={plan.maxGap} onChange={e => savePlan('maxGap', e.target.value)} /></div>
          </div>}
          <div className="hint">{t('hint')}</div>
        </div>
      </div>
    </>
  )
}
