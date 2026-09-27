import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'

// Planlagt trening. To ansikter på samme data:
//
//   Treneren setter en dag - bakke, bolker med gren og klokkeslett, hvilke
//   løpere - og den havner i training_sessions med planned = true.
//   Løperen ser den samme raden som «i morgen kjører vi SG 07-09».
//
// Planen er altså ikke en egen tabell. En økt er planlagt til den blir ført,
// og da står den allerede der med riktig dag, bakke og gren.

const DISCIPLINES = ['SL', 'GS', 'SG', 'DH', 'FREE', 'COND']
const OTHER = '__other'
const iso = d => d.toISOString().slice(0, 10)
const today = () => iso(new Date())
const tomorrow = () => iso(new Date(Date.now() + 864e5))
const hhmm = t => (t || '').slice(0, 5)

// «I dag» / «I morgen» / «lørdag 3. okt» - den formen man sier det på.
function whenLabel(date, t, lang) {
  const d = Math.round((new Date(date + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5)
  if (d === 0) return t('nrToday')
  if (d === 1) return t('nrTomorrow')
  return new Date(date + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'nb-NO',
    { weekday: 'long', day: 'numeric', month: 'short' })
}

export default function TrainingPlan({ profile, team, isCoach, slopes, onPlanned }) {
  const t = useT()
  const [rows, setRows] = useState([])

  const load = () => supabase.from('training_sessions')
    .select('id, athlete_id, date, discipline, start_time, end_time, venue, note, slope:slopes(resort, name, difficulty)')
    .eq('planned', true).gte('date', today())
    .order('date').order('start_time', { nullsFirst: false }).limit(60)
    .then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [profile.id, team?.id])

  // Løperens egne bolker, gruppert per dag.
  const mine = useMemo(() => {
    const byDay = new Map()
    rows.filter(r => r.athlete_id === profile.id).forEach(r => {
      if (!byDay.has(r.date)) byDay.set(r.date, [])
      byDay.get(r.date).push(r)
    })
    return [...byDay.entries()].slice(0, 4)
  }, [rows, profile.id])

  return (
    <>
      {mine.length > 0 && (
        <div className="card">
          <h2>{t('tpUpcoming')}</h2>
          {mine.map(([date, blocks]) => {
            const first = blocks[0]
            return (
              <div className="tp-day" key={date}>
                <div className="tp-when">
                  <b>{whenLabel(date, t, t.lang)}</b>
                  {first.slope
                    ? <span> · {first.slope.resort} · {first.slope.name}</span>
                    : first.venue ? <span> · {first.venue}</span> : null}
                </div>
                <div className="tp-blocks">
                  {blocks.map(b => (
                    <div className="tp-block" key={b.id}>
                      <span className="tm">
                        {b.start_time ? `${hhmm(b.start_time)}–${hhmm(b.end_time) || ''}` : '–'}
                      </span>
                      <span className="di">{t('disc_' + b.discipline)}</span>
                    </div>
                  ))}
                </div>
                {first.note && <p className="muted tp-note">{first.note}</p>}
              </div>
            )
          })}
        </div>
      )}

      {isCoach && team && (
        <Planner profile={profile} team={team} slopes={slopes} t={t}
          onDone={() => { load(); onPlanned?.() }} />
      )}
    </>
  )
}

function Planner({ team, slopes, t, onDone }) {
  const [mates, setMates] = useState([])
  const [who, setWho] = useState([])
  const [date, setDate] = useState(tomorrow)
  const [resort, setResort] = useState('')
  const [slopeId, setSlopeId] = useState('')
  const [venue, setVenue] = useState('')
  const [note, setNote] = useState('')
  const [blocks, setBlocks] = useState([{ discipline: 'GS', start: '10:00', end: '12:00' }])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('team_id', team.id)
      .eq('role', 'athlete').order('full_name')
      .then(({ data }) => { setMates(data || []); setWho((data || []).map(m => m.id)) })
  }, [team.id])

  const resorts = useMemo(
    () => [...new Set(slopes.map(s => s.resort))].sort((a, b) => a.localeCompare(b, 'nb')),
    [slopes])
  const inResort = useMemo(() => slopes.filter(s => s.resort === resort), [slopes, resort])

  const setBlock = (i, patch) =>
    setBlocks(bs => bs.map((b, k) => (k === i ? { ...b, ...patch } : b)))

  async function save(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('plan_training', {
      p_athletes: who,
      p_date: date,
      p_slope_id: slopeId ? Number(slopeId) : null,
      p_blocks: blocks.filter(b => b.discipline),
      p_venue: slopeId ? null : (resort === OTHER ? venue.trim() || null : resort || null),
      p_note: note.trim() || null
    })
    setBusy(false)
    if (error) return setMsg({ bad: true, text: error.message })
    setMsg({ text: t('tpPlanned').replace('{n}', data ?? 0).replace('{a}', who.length) })
    onDone()
  }

  return (
    <div className="card">
      <h2>{t('tpTitle')}</h2>
      <p className="muted">{t('tpSub')}</p>

      <form onSubmit={save}>
        <div className="tl-grid">
          <div>
            <label htmlFor="tp-date">{t('tlDate')}</label>
            <input id="tp-date" type="date" required value={date} min={today()}
              onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="tp-resort">{t('tlResort')}</label>
            <select id="tp-resort" value={resort}
              onChange={e => { setResort(e.target.value); setSlopeId('') }}>
              <option value="">{t('tlPickResort')}</option>
              {resorts.map(r => <option key={r} value={r}>{r}</option>)}
              <option value={OTHER}>{t('tlSlopeOther')}</option>
            </select>
          </div>
          {resort !== OTHER && (
            <div>
              <label htmlFor="tp-slope">{t('tlSlope')}</label>
              <select id="tp-slope" value={slopeId} disabled={!resort}
                onChange={e => setSlopeId(e.target.value)}>
                <option value="">{resort ? t('tlWholeResort') : t('tlPickResortFirst')}</option>
                {inResort.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.difficulty ? ` — ${t('diff_' + s.difficulty)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {resort === OTHER && (
          <>
            <label htmlFor="tp-venue">{t('tlVenue')}</label>
            <input id="tp-venue" value={venue} placeholder={t('tlVenuePh')}
              onChange={e => setVenue(e.target.value)} />
          </>
        )}

        <label>{t('tpBlocks')}</label>
        <div className="tp-rows">
          {blocks.map((b, i) => (
            <div className="tp-row" key={i}>
              <select aria-label={t('tlDiscipline')} value={b.discipline}
                onChange={e => setBlock(i, { discipline: e.target.value })}>
                {DISCIPLINES.map(d => <option key={d} value={d}>{t('disc_' + d)}</option>)}
              </select>
              <input type="time" aria-label={t('tpFrom')} value={b.start}
                onChange={e => setBlock(i, { start: e.target.value })} />
              <span className="to">–</span>
              <input type="time" aria-label={t('tpTo')} value={b.end}
                onChange={e => setBlock(i, { end: e.target.value })} />
              <button type="button" className="btn small" disabled={blocks.length === 1}
                aria-label={t('tpRemoveBlock')}
                onClick={() => setBlocks(bs => bs.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn link"
          onClick={() => setBlocks(bs => [...bs, { discipline: 'SL', start: '', end: '' }])}>
          {t('tpAddBlock')}
        </button>

        <label>{t('tpFor')}</label>
        <div className="row" style={{ gap: 6 }}>
          {mates.map(m => (
            <button key={m.id} type="button"
              className={`chip ${who.includes(m.id) ? 'on' : ''}`}
              aria-pressed={who.includes(m.id)}
              onClick={() => setWho(w => w.includes(m.id) ? w.filter(x => x !== m.id) : [...w, m.id])}>
              {m.full_name}
            </button>
          ))}
        </div>

        <label htmlFor="tp-note">{t('tlNote')}</label>
        <textarea id="tp-note" value={note} onChange={e => setNote(e.target.value)} />

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={busy || !who.length}>
            {busy ? t('tlSaving') : t('tpSave')}
          </button>
          {msg && <span className={msg.bad ? 'error' : 'notice'} style={{ margin: 0 }}>{msg.text}</span>}
        </div>
      </form>
    </div>
  )
}
