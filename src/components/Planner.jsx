import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import RaceMap from './RaceMap.jsx'
import { fmt } from '../util'
import {
  HOMES, DEFAULT_HOME, DEFAULT_PLAN, TRIP_COLORS,
  homeLL, buildTrips, tripTotals, nok
} from '../travel'

// Season planner: races the athlete has in athlete_races (planned / entered)
// chained into trips, with distance, nights and cost.
export default function Planner({ profile, onChange }) {
  const [rows, setRows] = useState([])
  const [home, setHome] = useState(profile.home_city || DEFAULT_HOME)
  const [plan, setPlan] = useState({ ...DEFAULT_PLAN, ...(profile.plan_settings || {}) })
  const [focus, setFocus] = useState(null)

  useEffect(() => {
    supabase.from('athlete_races').select('status, race:races(*, venue:venues(*))')
      .eq('athlete_id', profile.id).in('status', ['planned', 'entered'])
      .then(({ data }) => setRows((data || []).map(a => a.race).filter(Boolean)))
  }, [profile.id])

  async function saveHome(v) {
    setHome(v)
    await supabase.from('profiles').update({ home_city: v }).eq('id', profile.id)
    onChange?.()
  }
  async function savePlan(key, value) {
    const next = { ...plan, [key]: +value }
    setPlan(next)
    await supabase.from('profiles').update({ plan_settings: next }).eq('id', profile.id)
    onChange?.()
  }
  async function removeRace(raceId) {
    await supabase.from('athlete_races').delete().eq('athlete_id', profile.id).eq('race_id', raceId)
    setRows(rs => rs.filter(r => r.id !== raceId))
  }

  const trips = useMemo(() => buildTrips(rows, home, plan), [rows, home, plan])
  const tot = tripTotals(trips)
  const routes = trips.map((t, i) => ({ points: t.points, color: TRIP_COLORS[i % TRIP_COLORS.length] }))
  const noVenue = rows.length - trips.reduce((a, t) => a + t.races.length, 0)

  const Kpi = ({ v, label }) => <div className="kpi"><b>{v}</b><span>{label}</span></div>

  return (
    <>
      <div className="controls">
        <div className="group"><span>Hjemsted</span>
          <select style={{ width: 'auto' }} value={home} onChange={e => saveHome(e.target.value)}>
            {Object.entries(HOMES).map(([k, v]) => <option key={k} value={k}>{v[2]}</option>)}
          </select>
        </div>
        <div className="group"><span>{rows.length} renn i planen · {trips.length} reiser</span></div>
      </div>
      <div className="split">
        <RaceMap races={rows} focus={focus} routes={routes} home={homeLL(home)} />
        <div className="list">
          {trips.length === 0 ? (
            <div className="empty">Planen er tom. Legg til renn under «Alle renn», så regner jeg ut reise, netter og kostnad.</div>
          ) : (
            <>
              <div className="trip total">
                <div className="route">Hele sesongen · {trips.length} reiser · {rows.length} renn</div>
                <div className="kpis">
                  <Kpi v={nok(tot.km)} label={`km (${nok(tot.km / 10)} mil)`} />
                  <Kpi v={Math.round(tot.hours)} label="t i bil" />
                  <Kpi v={tot.nights} label="netter" />
                  <Kpi v={nok(tot.cost)} label="kr" />
                </div>
                <div className="legs-sum">kjøring {nok(tot.drive)} · opphold {nok(tot.stay)} · startkontingent {nok(tot.fees)} · {tot.days} dager borte</div>
              </div>
              {trips.map((t, i) => (
                <div className="trip" key={i} style={{ borderLeftColor: TRIP_COLORS[i % TRIP_COLORS.length] }}>
                  <div className="route">Reise {i + 1}: Hjem<i>→</i>{t.races.map(r => r.place).join(' → ')}<i>→</i>Hjem</div>
                  <div className="when">{fmt({ start_date: t.races[0].start_date, end_date: t.races[t.races.length - 1].end_date })}</div>
                  <div className="kpis">
                    <Kpi v={nok(t.km)} label="km" /><Kpi v={t.hours} label="t i bil" />
                    <Kpi v={t.nights} label="netter" /><Kpi v={nok(t.cost.total)} label="kr" />
                  </div>
                  <div className="legs">
                    {t.legs.map((l, j) => <div key={j}><span>{l.from} → {l.to}</span><span>{nok(l.km)} km</span></div>)}
                  </div>
                  {t.races.map(r => (
                    <div className="plan-race" key={r.id}>
                      <span><b>{r.place}</b> · {fmt(r)} · {r.events}</span>
                      <button className="btn small" title="Fjern fra min plan" onClick={() => removeRace(r.id)}>×</button>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
          {noVenue > 0 && <div className="muted" style={{ padding: '0 20px 12px' }}>{noVenue} renn i planen mangler sted på kartet og er ikke regnet med.</div>}
          <div className="settings">
            <div><label>kr per km</label><input type="number" step="0.5" value={plan.kmRate} onChange={e => savePlan('kmRate', e.target.value)} /></div>
            <div><label>kr per natt</label><input type="number" step="50" value={plan.hotel} onChange={e => savePlan('hotel', e.target.value)} /></div>
            <div><label>kr per renndag</label><input type="number" step="50" value={plan.entry} onChange={e => savePlan('entry', e.target.value)} /></div>
            <div><label>maks dager mellom renn for å reise videre</label><input type="number" min="0" max="10" value={plan.maxGap} onChange={e => savePlan('maxGap', e.target.value)} /></div>
          </div>
          <div className="hint">Kjørelengde er estimert (luftlinje × 1,3). Ligger to renn nær hverandre i tid, reiser du videre i stedet for hjem.</div>
        </div>
      </div>
    </>
  )
}
