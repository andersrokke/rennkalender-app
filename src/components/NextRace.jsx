import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import { fmt } from '../util'
import { fisPoints } from '../format'
import { kmFromHome, homeLabel, nok } from '../travel'
import GateLine from './GateLine.jsx'

// «Neste renn»: skjermen som svarer på hva løperen trenger å vite nå.
// Rennet som kommer, fristen, antatt startnummer, reisa og hvem fra laget som
// kommer. Alt henter seg fra det som allerede ligger i basen, og hver enkelt
// bit faller pent bort hvis dataene mangler.

const DISCS = ['SL', 'GS', 'SG', 'DH']

// Disiplinen som står først i «4xGS 4xSL», ikke den første i alfabetet.
function firstDisc(events) {
  const s = (events || '').toUpperCase()
  return DISCS.map(d => [d, s.indexOf(d)]).filter(([, i]) => i >= 0)
    .sort((a, b) => a[1] - b[1])[0]?.[0] || null
}
const today = () => new Date().toISOString().slice(0, 10)
const daysTo = d => Math.round((new Date(d + 'T12:00:00') - new Date()) / 864e5)
const initials = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

export default function NextRace({ profile, team, onOpenRace }) {
  const t = useT()
  const [rows, setRows] = useState([])
  const [history, setHistory] = useState([])
  const [pred, setPred] = useState(null)
  const [mates, setMates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      const [{ data: own }, { data: tr }] = await Promise.all([
        supabase.from('athlete_races').select('*, race:races(*, venue:venues(*))').eq('athlete_id', profile.id),
        team
          ? supabase.from('team_races').select('*, race:races(*, venue:venues(*))').eq('team_id', team.id)
          : Promise.resolve({ data: [] })
      ])
      if (!alive) return
      const m = new Map()
      ;(tr || []).filter(x => x.race).forEach(x => m.set(x.race.id, { race: x.race, status: null }))
      ;(own || []).filter(x => x.race).forEach(x => m.set(x.race.id, { race: x.race, status: x.status }))
      const now = today()
      setRows([...m.values()]
        .filter(x => x.race.end_date >= now && x.status !== 'unavailable')
        .sort((a, b) => a.race.start_date.localeCompare(b.race.start_date)))
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [profile.id, team?.id])

  const next = rows[0]?.race || null
  const disc = next ? firstDisc(next.events) : null

  // Påmeldingskurven. race_signups har én rad per telling, så det blir en ekte
  // kurve og ikke to punkter.
  useEffect(() => {
    if (!next) return setHistory([])
    let alive = true
    supabase.from('race_signups').select('counted_at, participants')
      .eq('race_id', next.id).order('counted_at', { ascending: true }).limit(60)
      .then(({ data }) => { if (alive) setHistory(data || []) })
    return () => { alive = false }
  }, [next?.id])

  useEffect(() => {
    if (!next || !disc || !profile.fis_code) return setPred(null)
    let alive = true
    supabase.rpc('predicted_start', { p_race_id: next.id, p_discipline: disc, p_fis_code: profile.fis_code })
      .then(({ data }) => { if (alive) setPred(data?.[0] || null) })
    return () => { alive = false }
  }, [next?.id, disc, profile.fis_code])

  useEffect(() => {
    if (!next || !team) return setMates([])
    let alive = true
    supabase.from('athlete_races')
      .select('status, athlete:profiles!athlete_races_athlete_id_fkey(id, full_name, team_id)')
      .eq('race_id', next.id).in('status', ['planned', 'entered'])
      .then(({ data }) => {
        if (!alive) return
        setMates((data || [])
          .filter(r => r.athlete && r.athlete.team_id === team.id && r.athlete.id !== profile.id))
      })
    return () => { alive = false }
  }, [next?.id, team?.id, profile.id])

  const signup = history[history.length - 1] || null
  const weekAgo = useMemo(() => {
    if (history.length < 2) return null
    const cut = Date.now() - 7 * 864e5
    const older = history.filter(h => new Date(h.counted_at).getTime() <= cut)
    return older.length ? older[older.length - 1] : history[0]
  }, [history])

  if (loading) return <div className="page muted">{t('loading')}</div>

  if (!next) return (
    <div className="nextwrap">
      <div className="nr-empty">
        <b>{t('nrNone')}</b>
        {t('nrNoneBody')}
      </div>
    </div>
  )

  const d = daysTo(next.start_date)
  const when = d < 0 ? t('nrRunning') : d === 0 ? t('nrToday')
    : d === 1 ? t('nrTomorrow') : t('nrInDays').replace('{n}', d)
  const hoursToDeadline = next.signup_deadline
    ? Math.round((new Date(next.signup_deadline) - new Date()) / 36e5) : null
  const deadlineSoon = hoursToDeadline != null && hoursToDeadline > 0 && hoursToDeadline <= 48
  const deadlineText = next.signup_deadline
    ? new Date(next.signup_deadline).toLocaleString(t.lang === 'en' ? 'en-GB' : 'nb-NO',
      { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    : null

  const oneWay = kmFromHome(next, profile.home_city)
  const roundTrip = oneWay != null ? oneWay * 2 : null
  const drive = roundTrip

  const inDraw = pred && pred.predicted_bib == null && pred.rank_by_points != null
  const cap = next.max_attendees || null
  const left = cap && signup ? cap - signup.participants : null
  const delta = signup && weekAgo ? signup.participants - weekAgo.participants : null

  return (
    <div className="nextwrap">
      <section className="nr-hero">
        <div className="nr-main">
          <div className="nr-kicker">
            <span className={'nr-when' + (d <= 1 ? ' soon' : '')}>{when}</span>
            <span className="nr-eyebrow">{t('nrNext')}</span>
          </div>
          <h2>{next.place}</h2>
          <div className="nr-meta">
            <span>{fmt(next)}</span><span className="sep" />
            <span>{next.category}</span><span className="sep" />
            <span><b>{next.events}</b></span>
            {next.host_nation && <><span className="sep" /><span>{next.host_nation}</span></>}
          </div>

          {deadlineSoon && (
            <div className="nr-alert">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.01" /><circle cx="12" cy="12" r="9" /></svg>
              <span>{t('nrDeadline')} {deadlineText}</span>
              <a href="https://isonen.no" target="_blank" rel="noopener">{t('nrEnter')}</a>
            </div>
          )}

          {oneWay != null && (
            <div className="nr-route">
              <span>{homeLabel(profile.home_city)}</span>
              <span className="leg" />
              <span>{next.place}</span>
              <span className="far">{nok(roundTrip)} {t('nrKmReturn')}</span>
            </div>
          )}
        </div>

        <aside className="nr-timing">
          {pred && pred.rank_by_points != null ? (
            <>
              <div className="row">
                <span className="lab">{t('nrStartNo')}</span>
                {inDraw
                  ? <span className="big drawn">1–{pred.draw_group}</span>
                  : <span className="big">{pred.predicted_bib}<sup>{t('nrOf')} {pred.entries}</sup></span>}
              </div>
              <div className="sep" />
              <div className="row">
                <span className="lab">{inDraw ? t('nrInDraw') : t('nrToDraw')}</span>
                <span className="val">{inDraw ? t('nrInDrawYes') : `${fisPoints(pred.gap_to_draw, t.lang)} p`}</span>
              </div>
              <div className="row">
                <span className="lab">{t('nrYourPoints').replace('{d}', disc)}</span>
                <span className="val">{fisPoints(pred.my_points, t.lang)}</span>
              </div>
              <p className="note">{t('nrDrawNote')
                .replace('{n}', pred.draw_group).replace('{a}', pred.entries)
                .replace('{b}', pred.with_points)}</p>
            </>
          ) : (
            <>
              <div className="row">
                <span className="lab">{t('nrStartNo')}</span>
                <span className="big">–</span>
              </div>
              <p className="note">{profile.fis_code ? t('nrNoEntries') : t('nrNoFis')}</p>
            </>
          )}
        </aside>
      </section>

      <div className="nr-tiles">
        <section className="nr-tile">
          <span className="lab">{t('nrSignups')}</span>
          {signup ? <>
            <span className="big">{signup.participants}{cap && <small>/{cap}</small>}</span>
            <Spark points={history} />
            <span className="sub">
              {delta != null && delta > 0 && <>{t('nrLast7').replace('{n}', delta)} </>}
              {left != null && left >= 0 && <>{t('nrSpotsLeft').replace('{n}', left)}</>}
            </span>
          </> : <>
            <span className="big">–</span>
            <span className="sub">{t('noNumbers')}</span>
          </>}
        </section>

        <section className="nr-tile">
          <span className="lab">{t('nrTravel')}</span>
          {drive != null ? <>
            <span className="big">{nok(roundTrip)}<small> {t('nrKmReturn')}</small></span>
          </> : <>
            <span className="big">–</span>
            <span className="sub">{t('nrNoVenue')}</span>
          </>}
        </section>

        <section className="nr-tile">
          <span className="lab">{team ? team.name : t('nrSolo')}</span>
          {team ? <>
            <span className="big">{mates.length + 1}</span>
            <div className="nr-avs" aria-hidden="true">
              <i>{initials(profile.full_name)}</i>
              {mates.slice(0, 3).map(m => <i key={m.athlete.id}>{initials(m.athlete.full_name)}</i>)}
              {mates.length > 3 && <i className="n">+{mates.length - 3}</i>}
            </div>
            <span className="sub">
              {mates.length
                ? t('nrAlsoGoing').replace('{names}',
                    mates.map(m => m.athlete.full_name.split(' ')[0]).slice(0, 3).join(', '))
                : t('nrOnlyYou')}
            </span>
          </> : <>
            <span className="big">{rows.length}</span>
            <span className="sub">{t('nrSoloNote')}</span>
          </>}
        </section>
      </div>

      <GateLine rows={rows} nextId={next.id} onSelect={onOpenRace} />
    </div>
  )
}

// Påmeldingskurven. Røde fordi tallet nærmer seg taket er det som haster.
function Spark({ points }) {
  if (!points || points.length < 3) return null
  const vals = points.map(p => p.participants)
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const span = Math.max(1, hi - lo)
  const step = 156 / (vals.length - 1)
  const pts = vals.map((v, i) => `${4 + i * step},${28 - ((v - lo) / span) * 24}`).join(' ')
  const last = pts.split(' ').pop().split(',')
  return (
    <svg className="nr-spark" viewBox="0 0 164 32" role="img"
      aria-label={`${lo} → ${hi}`}>
      <polyline points={pts} fill="none" stroke="var(--danger)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--danger)" stroke="var(--snow)" strokeWidth="2" />
    </svg>
  )
}
