import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useT } from '../i18n'
import TrainingStats from './TrainingStats.jsx'
import TrainingPlan from './TrainingPlan.jsx'

// Treningslogg. Tabellen training_sessions fantes i basen fra før uten noen
// skjerm; dette er skjermen.
//
// Alle feltene står framme. De var en stund foldet bort under «flere
// detaljer», men et felt man ikke ser, er et felt ingen fyller ut - og da blir
// tallene i sammendraget bygget på halve økter.

const DISCIPLINES = ['SL', 'GS', 'SG', 'DH', 'FREE', 'COND']
const SNOW = ['ice', 'salted', 'hard', 'grippy', 'soft', 'slush', 'powder', 'artificial']
const WEATHER = ['sun', 'cloudy', 'flat_light', 'snow', 'fog', 'rain', 'wind']

// Vanskelighetsgrad vises i løypefargene en skikjører allerede leser. Fargen
// står alltid sammen med ordet, så den er aldri det eneste kjennetegnet.
const DIFFICULTIES = ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride']

const today = () => new Date().toISOString().slice(0, 10)
const blank = () => ({
  date: today(), resort: '', slope_id: '', venue: '', discipline: 'GS', runs: '',
  gates: '', snow: '', weather: '', temp_c: '', minutes: '', rpe: '', note: ''
})
const num = v => (v === '' || v == null ? null : Number(v))

export default function TrainingLog({ profile, team, isCoach }) {
  const t = useT()
  const [slopes, setSlopes] = useState([])
  const [mates, setMates] = useState([])
  const [who, setWho] = useState(profile.id)
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [adding, setAdding] = useState(null)   // 'resort' | 'slope' | null
  const [draft, setDraft] = useState({ resort: '', name: '', difficulty: '' })
  const [addBusy, setAddBusy] = useState(false)
  const [addErr, setAddErr] = useState(null)
  // Bumpes når en økt er lagret, så statistikken under henter på nytt.
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    supabase.from('slopes').select('id, resort, name, difficulty')
      .order('resort').order('name')
      .then(({ data }) => setSlopes(data || []))
  }, [])

  useEffect(() => {
    if (!isCoach || !team) return setMates([])
    supabase.from('profiles').select('id, full_name').eq('team_id', team.id)
      .eq('role', 'athlete').order('full_name')
      .then(({ data }) => setMates(data || []))
  }, [isCoach, team?.id])

  // Skjemaet henter ikke lenger økter selv. Statistikken under gjør det, med
  // filtre og sortering, og nonce ber den om å hente på nytt når noe er lagret.
  const oppdater = () => setNonce(n => n + 1)


  // Inne i en hall er vær ikke en variabel - det er alltid det samme. Å be om
  // sol eller tåke der gir enten et tilfeldig svar eller et tomt felt, og
  // begge forurenser statistikken. «Innendørs» er et svar; tomt felt er et
  // hull man ikke kan skille fra «glemte det».
  const erInne = useMemo(() => {
    if (form.slope_id) return !!slopes.find(s => String(s.id) === String(form.slope_id))?.indoor
    if (!form.resort || form.resort === OTHER) return false
    const i = slopes.filter(s => s.resort === form.resort)
    return i.length > 0 && i.every(s => s.indoor)
  }, [slopes, form.resort, form.slope_id])

  useEffect(() => {
    if (erInne && form.weather !== 'indoor') set({ weather: 'indoor' })
    if (!erInne && form.weather === 'indoor') set({ weather: '' })
  }, [erInne])

  // To steg: destinasjon foerst, saa bakke. Med flere hundre nedfarter i
  // registeret blir én lang liste ubrukelig paa telefon.
  const resorts = useMemo(
    () => [...new Set(slopes.map(s => s.resort))].sort((a, b) => a.localeCompare(b, 'nb')),
    [slopes])
  const inResort = useMemo(
    () => slopes.filter(s => s.resort === form.resort),
    [slopes, form.resort])

  const set = patch => setForm(f => ({ ...f, ...patch }))

  // Legger til en bakke - og dermed destinasjonen, siden en destinasjon bare
  // finnes i kraft av bakkene sine. Finnes den alt, brukes den som står der:
  // det er ikke en feil å legge inn noe to ganger.
  async function addSlope(e) {
    e.preventDefault()
    const resort = (adding === 'resort' ? draft.resort : form.resort).trim()
    const name = draft.name.trim()
    if (!resort || !name) return
    setAddBusy(true); setAddErr(null)
    const row = {
      resort, name, difficulty: draft.difficulty || null,
      source: 'user', created_by: profile.id
    }
    let { data, error } = await supabase.from('slopes').insert(row)
      .select('id, resort, name, difficulty, indoor').single()
    if (error?.code === '23505') {
      ({ data, error } = await supabase.from('slopes')
        .select('id, resort, name, difficulty')
        .eq('resort', resort).eq('name', name).single())
    }
    setAddBusy(false)
    if (error) return setAddErr(error.message)
    setSlopes(list => [...list.filter(x => x.id !== data.id), data])
    set({ resort: data.resort, slope_id: String(data.id) })
    setAdding(null); setDraft({ resort: '', name: '', difficulty: '' })
  }

  function pickResort(v) {
    if (v === ADD) { setAdding('resort'); setAddErr(null); return }
    setAdding(null)
    set({ resort: v, slope_id: '' })
  }
  function pickSlope(v) {
    if (v === ADD) { setAdding('slope'); setAddErr(null); return }
    setAdding(null)
    set({ slope_id: v })
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('training_sessions').insert({
      athlete_id: who,
      team_id: team?.id ?? null,
      date: form.date,
      discipline: form.discipline,
      slope_id: form.slope_id ? Number(form.slope_id) : null,
      // Fritekst brukes bare når bakken ikke er i registeret, så de to aldri
      // sier hver sin ting om samme økt. Er destinasjonen valgt uten bakke,
      // lagres destinasjonen - da vet vi hvor, bare ikke nøyaktig hvilken.
      venue: form.slope_id ? null
        : form.resort && form.resort !== OTHER ? form.resort
          : (form.venue.trim() || null),
      runs: num(form.runs), gates: num(form.gates),
      snow: form.snow || null, weather: form.weather || null,
      temp_c: num(form.temp_c), minutes: num(form.minutes), rpe: num(form.rpe),
      note: form.note.trim() || null,
      created_by: profile.id
    })
    setBusy(false)
    if (error) return setMsg({ bad: true, text: error.message })
    setForm(blank()); setMsg({ text: t('tlSaved') }); oppdater()
  }

  return (
    <>
      <TrainingPlan profile={profile} team={team} isCoach={isCoach} slopes={slopes}
        onPlanned={oppdater} />

      <div className="card">
      <h2>{t('tlTitle')}</h2>
      <p className="muted">{t('tlSub')}</p>

      <form onSubmit={save}>
        {isCoach && mates.length > 0 && (
          <>
            <label htmlFor="tl-who">{t('tlFor')}</label>
            <select id="tl-who" style={{ width: 'auto' }} value={who} onChange={e => setWho(e.target.value)}>
              <option value={profile.id}>{profile.full_name} ({t('tlYou')})</option>
              {mates.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </>
        )}

        <div className="tl-grid">
          <div>
            <label htmlFor="tl-date">{t('tlDate')}</label>
            <input id="tl-date" type="date" required value={form.date}
              max={today()} onChange={e => set({ date: e.target.value })} />
          </div>
          <div>
            <label htmlFor="tl-resort">{t('tlResort')}</label>
            <select id="tl-resort" value={adding === 'resort' ? ADD : form.resort}
              onChange={e => pickResort(e.target.value)}>
              <option value="">{t('tlPickResort')}</option>
              {resorts.map(r => <option key={r} value={r}>{r}</option>)}
              <option value={ADD}>{t('tlAddResort')}</option>
              <option value={OTHER}>{t('tlSlopeOther')}</option>
            </select>
          </div>
          {/* Skjules helt ved «annet sted»: en låst velger som sier «velg
              destinasjon først» er feil når destinasjonen nettopp er valgt. */}
          {form.resort !== OTHER && <div>
            <label htmlFor="tl-slope">{t('tlSlope')}</label>
            <select id="tl-slope" value={adding === 'slope' ? ADD : form.slope_id}
              disabled={!form.resort || form.resort === OTHER}
              onChange={e => pickSlope(e.target.value)}>
              <option value="">{form.resort ? t('tlWholeResort') : t('tlPickResortFirst')}</option>
              {inResort.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.difficulty ? ` — ${t('diff_' + s.difficulty)}` : ''}
                </option>
              ))}
              {form.resort && <option value={ADD}>{t('tlAddSlope')}</option>}
            </select>
          </div>}
          <div>
            <label htmlFor="tl-runs">{t('tlRuns')}</label>
            <input id="tl-runs" type="number" min="0" max="99" inputMode="numeric"
              value={form.runs} onChange={e => set({ runs: e.target.value })} />
          </div>
        </div>

        {adding && (
          <div className="tl-add">
            <p className="tl-add-lead">
              {adding === 'resort' ? t('tlAddResortLead')
                : t('tlAddSlopeLead').replace('{r}', form.resort)}
            </p>
            <div className="tl-grid">
              {adding === 'resort' && (
                <div>
                  <label htmlFor="tl-new-resort">{t('tlNewResort')}</label>
                  <input id="tl-new-resort" value={draft.resort} autoFocus
                    onChange={e => setDraft(d => ({ ...d, resort: e.target.value }))} />
                </div>
              )}
              <div>
                <label htmlFor="tl-new-slope">{t('tlNewSlope')}</label>
                <input id="tl-new-slope" value={draft.name} autoFocus={adding === 'slope'}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="tl-new-diff">{t('tlNewDiff')}</label>
                <select id="tl-new-diff" value={draft.difficulty}
                  onChange={e => setDraft(d => ({ ...d, difficulty: e.target.value }))}>
                  <option value="">{t('tlNewDiffNone')}</option>
                  {DIFFICULTIES.map(d => <option key={d} value={d}>{t('diff_' + d)}</option>)}
                </select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn primary small" disabled={addBusy} onClick={addSlope}>
                {addBusy ? t('tlSaving') : t('tlAdd')}
              </button>
              <button type="button" className="btn small"
                onClick={() => { setAdding(null); setAddErr(null) }}>{t('cancel')}</button>
              <span className="muted">{t('tlAddHelp')}</span>
            </div>
            {addErr && <div className="error">{addErr}</div>}
          </div>
        )}

        {form.resort === OTHER && (
          <>
            <label htmlFor="tl-venue">{t('tlVenue')}</label>
            <input id="tl-venue" value={form.venue} placeholder={t('tlVenuePh')}
              onChange={e => set({ venue: e.target.value })} />
          </>
        )}

        <label>{t('tlDiscipline')}</label>
        <Chips t={t} options={DISCIPLINES} prefix="disc_" value={form.discipline}
          onPick={v => set({ discipline: v || 'GS' })} />

        <label>{t('tlSnow')}</label>
        <Chips t={t} options={SNOW} prefix="snow_" value={form.snow}
          onPick={v => set({ snow: v })} />

        <label>{t('tlWeather')}</label>
        {erInne
          ? <p className="tl-inne">{t('tlIndoor')}</p>
          : <Chips t={t} options={WEATHER} prefix="wx_" value={form.weather}
              onPick={v => set({ weather: v })} />}

        <div className="tl-grid">
          <div>
            <label htmlFor="tl-gates">{t('tlGates')}</label>
            <input id="tl-gates" type="number" min="0" value={form.gates}
              onChange={e => set({ gates: e.target.value })} />
          </div>
          <div>
            <label htmlFor="tl-temp">{t('tlTemp')}</label>
            <input id="tl-temp" type="number" step="0.5" value={form.temp_c}
              onChange={e => set({ temp_c: e.target.value })} />
          </div>
          <div>
            <label htmlFor="tl-min">{t('tlMinutes')}</label>
            <input id="tl-min" type="number" min="0" value={form.minutes}
              onChange={e => set({ minutes: e.target.value })} />
          </div>
          <div>
            <label htmlFor="tl-rpe">{t('tlRpe')}</label>
            <input id="tl-rpe" type="number" min="1" max="10" value={form.rpe}
              onChange={e => set({ rpe: e.target.value })} />
          </div>
        </div>

        <label htmlFor="tl-note">{t('tlNote')}</label>
        <textarea id="tl-note" value={form.note} onChange={e => set({ note: e.target.value })} />

        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={busy}>{busy ? t('tlSaving') : t('tlSave')}</button>
          {msg && <span className={msg.bad ? 'error' : 'notice'} style={{ margin: 0 }}>{msg.text}</span>}
        </div>
      </form>

      </div>

      <TrainingStats athleteId={who} mates={mates} isCoach={isCoach} nonce={nonce} />
    </>
  )
}

// Utenfor komponenten med vilje: definert inni ville den blitt et nytt
// komponenttre for hver render, og fokus hadde hoppet ut av knappen.
function Chips({ t, options, prefix, value, onPick }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      {options.map(o => (
        <button key={o} type="button"
          className={`chip ${value === o ? 'on' : ''}`}
          aria-pressed={value === o}
          onClick={() => onPick(value === o ? '' : o)}>
          {t(prefix + o)}
        </button>
      ))}
    </div>
  )
}
